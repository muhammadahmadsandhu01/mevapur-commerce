const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const stripeProvider = require('../../services/payment/providers/StripeProvider');
const ReturnInventoryService = require('../../services/ReturnInventoryService');
const RefundService = require('../../services/payment/RefundService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const Return = require('../../models/Return');
const InventoryTransaction = require('../../models/InventoryTransaction');

let sequence = 0;
let fakeStripe;

const auth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `return-integrity-${sequence}@example.test`,
    role
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });
  return {
    user,
    authorization: `Bearer ${TokenService.generateAccessToken({
      userId: user._id,
      sessionId: session._id,
      tokenVersion: user.tokenVersion
    })}`
  };
};

const product = async ({ price = 125, stock = 20, variants = [] } = {}) => {
  sequence += 1;
  return Product.create({
    name: `Return Integrity Product ${sequence}`,
    slug: `return-integrity-product-${sequence}`,
    description: 'Return integrity test product',
    category: new mongoose.Types.ObjectId(),
    images: ['https://example.com/test.webp'],
    sku: `RET-INT-${sequence}`,
    price,
    stock,
    variants,
    isActive: true
  });
};

const deliveredOrder = async (user, items, {
  paymentMethod = 'cod',
  totalAmount,
  discount = 0,
  shippingCost = 0,
  taxAmount = 0,
  coupon
} = {}) => {
  const snapshotItems = items.map(({
    product: item,
    quantity,
    price = item.price,
    variantId = null,
    isDefaultVariant = false
  }) => ({
    product: item._id,
    variantId,
    isDefaultVariant,
    name: item.name,
    sku: item.sku,
    price,
    quantity,
    lineTotal: price * quantity
  }));
  const subtotal = snapshotItems.reduce((sum, item) => sum + item.lineTotal, 0);
  return Order.create({
    user: user._id,
    idempotencyKey: crypto.randomUUID(),
    requestHash: crypto.randomBytes(32).toString('hex'),
    items: snapshotItems,
    shippingAddress: {
      fullName: user.fullName,
      phone: '03001234567',
      address: '1 Return Integrity Street',
      city: 'Lahore',
      province: 'Punjab',
      country: 'PK'
    },
    paymentMethod,
    payment: {
      provider: paymentMethod === 'stripe' ? 'Stripe' : 'Cash on Delivery',
      currency: 'PKR',
      paidAt: new Date()
    },
    paymentStatus: 'Paid',
    orderStatus: 'Delivered',
    subtotal,
    shippingCost,
    taxAmount,
    discount,
    coupon,
    totalAmount: totalAmount
      ?? (subtotal - discount + shippingCost + taxAmount),
    statusTimeline: [{
      status: 'Delivered',
      actor: user._id,
      actorRole: 'customer',
      timestamp: new Date()
    }],
    deliveredAt: new Date()
  });
};

const completedPayment = async (owner, order, provider = 'cod') => Payment.create({
  order: order._id,
  user: owner._id,
  provider,
  providerPaymentId: `${provider.toUpperCase()}-${order._id}`,
  providerDisplayName: provider === 'stripe' ? 'Card / Stripe' : 'Cash on Delivery',
  paymentType: provider === 'stripe' ? 'automated' : 'offline',
  status: 'Completed',
  amount: order.totalAmount,
  paidAmount: order.totalAmount,
  currency: 'PKR',
  idempotencyKey: crypto.randomUUID(),
  requestHash: crypto.randomBytes(32).toString('hex'),
  providerIdempotencyKey: crypto.randomUUID(),
  providerAttemptStatus: 'Ready',
  completedAt: new Date()
});

const returnRequest = (owner, order, items, extra = {}) => request(app)
  .post('/api/account/returns')
  .set('Authorization', owner.authorization)
  .send({ orderId: String(order._id), items, ...extra });

const processReturn = (admin, entry, body = {}) => request(app)
  .post(`/api/returns/${entry._id}/refund`)
  .set('Authorization', admin.authorization)
  .send(body);

const updateReturnStatus = (admin, entry, status, body = {}) => request(app)
  .put(`/api/returns/${entry._id}/status`)
  .set('Authorization', admin.authorization)
  .send({ status, ...body });

const reconcileInventory = (actor, entry, action, note = '') => request(app)
  .post(`/api/returns/${entry._id}/inventory-reconciliation`)
  .set('Authorization', actor.authorization)
  .send({ action, ...(note ? { note } : {}) });

const trackModelSaves = (models) => {
  let activeSaves = 0;
  let concurrent = false;
  const calls = [];
  const spies = models.map(([name, Model]) => {
    const originalSave = Model.prototype.save;
    return jest.spyOn(Model.prototype, 'save').mockImplementation(
      async function trackedSave(...args) {
        activeSaves += 1;
        concurrent = concurrent || activeSaves > 1;
        calls.push(name);
        await new Promise((resolve) => setImmediate(resolve));
        try {
          return await originalSave.apply(this, args);
        } finally {
          activeSaves -= 1;
        }
      }
    );
  });

  return {
    calls,
    wasConcurrent: () => concurrent,
    restore: () => spies.forEach((spy) => spy.mockRestore())
  };
};

describe('HZ-001/HZ-002 return and refund financial integrity', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Payment.syncIndexes(),
      Refund.syncIndexes(),
      Return.syncIndexes(),
      InventoryTransaction.syncIndexes()
    ]);
  });

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fake';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated_fake';
    let refunds = 0;
    fakeStripe = {
      paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
      refunds: {
        create: jest.fn(async () => ({
          id: `re_return_integrity_${++refunds}`,
          status: 'succeeded'
        }))
      },
      webhooks: { constructEvent: jest.fn() }
    };
    stripeProvider.setClientForTests(fakeStripe);
  });

  afterAll(() => {
    stripeProvider.resetClientForTests();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  test('rejects duplicate lines before they can exceed eligibility or alter stock', async () => {
    const [owner, item] = await Promise.all([auth(), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 2 }]);

    const response = await returnRequest(owner, order, [{
      productId: String(item._id), quantity: 1, reason: 'damaged'
    }, {
      productId: String(item._id), quantity: 2, reason: 'damaged'
    }]);

    expect(response.status).toBe(400);
    expect(await Return.countDocuments()).toBe(0);
    expect((await Product.findById(item._id)).stock).toBe(20);
  });

  test('concurrent return requests cannot reserve the same order quantity twice', async () => {
    const [owner, item] = await Promise.all([auth(), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }]);
    const line = [{
      productId: String(item._id), quantity: 1, reason: 'damaged'
    }];

    const responses = await Promise.all([
      returnRequest(owner, order, line),
      returnRequest(owner, order, line)
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    expect(await Return.countDocuments({ order: order._id })).toBe(1);
  });

  test('uses the stored order price and rejects client price/refund manipulation', async () => {
    const [owner, item] = await Promise.all([auth(), product({ price: 999 })]);
    const order = await deliveredOrder(owner.user, [{
      product: item, quantity: 2, price: 125
    }]);

    const manipulated = await returnRequest(owner, order, [{
      productId: String(item._id),
      quantity: 1,
      reason: 'not_as_described',
      price: 0.01
    }], { refundAmount: 999999, discount: 999999 });
    expect(manipulated.status).toBe(400);

    const valid = await returnRequest(owner, order, [{
      productId: String(item._id), quantity: 1, reason: 'not_as_described'
    }]);
    expect(valid.status).toBe(201);
    const entry = await Return.findById(valid.body.data.return._id);
    expect(entry.refundAmount).toBe(125);
    expect(entry.items[0].price).toBe(125);
    expect(entry.items[0].refundAmount).toBe(125);
  });

  test('allocates an order coupon across lines and is independent of request order', async () => {
    const [owner, first, second] = await Promise.all([
      auth(), product({ price: 100 }), product({ price: 100 })
    ]);
    const firstOrder = await deliveredOrder(owner.user, [
      { product: first, quantity: 1 },
      { product: second, quantity: 1 }
    ], { discount: 50 });
    const secondOrder = await deliveredOrder(owner.user, [
      { product: first, quantity: 1 },
      { product: second, quantity: 1 }
    ], { discount: 50 });

    const single = await returnRequest(owner, firstOrder, [{
      productId: String(first._id), quantity: 1, reason: 'other'
    }]);
    expect(single.status).toBe(201);
    expect(single.body.data.return.refundAmount).toBe(75);

    const together = await returnRequest(owner, secondOrder, [{
      productId: String(second._id), quantity: 1, reason: 'other'
    }, {
      productId: String(first._id), quantity: 1, reason: 'other'
    }]);
    expect(together.status).toBe(201);
    const stored = await Return.findById(together.body.data.return._id);
    expect(stored.refundAmount).toBe(150);
    expect(stored.items.reduce((sum, item) => sum + item.refundAmount, 0))
      .toBe(150);
    expect(Object.fromEntries(stored.items.map((item) => [
      String(item.product), item.refundAmount
    ]))).toEqual({
      [String(first._id)]: 75,
      [String(second._id)]: 75
    });
  });

  test('separate discounted returns reconcile to the paid merchandise total', async () => {
    const [owner, admin, first, second] = await Promise.all([
      auth(), auth('admin'), product({ price: 100 }), product({ price: 100 })
    ]);
    const order = await deliveredOrder(owner.user, [
      { product: first, quantity: 1 },
      { product: second, quantity: 1 }
    ], { paymentMethod: 'stripe', discount: 50 });
    const payment = await completedPayment(owner.user, order, 'stripe');
    const amounts = [];

    for (const item of [first, second]) {
      const response = await returnRequest(owner, order, [{
        productId: String(item._id), quantity: 1, reason: 'other'
      }]);
      expect(response.status).toBe(201);
      const entry = await Return.findById(response.body.data.return._id);
      amounts.push(entry.refundAmount);
      entry.status = 'approved';
      await entry.save();
      expect((await processReturn(admin, entry)).status).toBe(200);
    }

    expect(amounts).toEqual([75, 75]);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(150);
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'Refunded',
      refundedAmount: 150
    });
  });

  test('partial-quantity returns consume deterministic unit shares exactly once', async () => {
    const [owner, admin, item] = await Promise.all([
      auth(), auth('admin'), product({ price: 100 })
    ]);
    const order = await deliveredOrder(owner.user, [{
      product: item, quantity: 3
    }], { paymentMethod: 'stripe', discount: 100 });
    const payment = await completedPayment(owner.user, order, 'stripe');
    const amounts = [];

    for (let index = 0; index < 3; index += 1) {
      const response = await returnRequest(owner, order, [{
        productId: String(item._id), quantity: 1, reason: 'other'
      }]);
      expect(response.status).toBe(201);
      const entry = await Return.findById(response.body.data.return._id);
      amounts.push(entry.refundAmount);
      entry.status = 'approved';
      await entry.save();
      expect((await processReturn(admin, entry)).status).toBe(200);
    }

    expect(amounts).toEqual([66.67, 66.67, 66.66]);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(200);
    expect((await Payment.findById(payment._id)).refundedAmount).toBe(200);
  });

  test('recorded prior return amounts consume the order merchandise ceiling', async () => {
    const [owner, first, second] = await Promise.all([
      auth(), product({ price: 100 }), product({ price: 100 })
    ]);
    const order = await deliveredOrder(owner.user, [
      { product: first, quantity: 1 },
      { product: second, quantity: 1 }
    ], { discount: 50, shippingCost: 50 });
    await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: first._id,
        orderLineKey: `${first._id}:root`,
        name: first.name,
        quantity: 1,
        price: 100,
        refundAmount: 100,
        reason: 'other'
      }],
      status: 'refunded',
      refundAmount: 100,
      refundedAt: new Date()
    });

    const response = await returnRequest(owner, order, [{
      productId: String(second._id), quantity: 1, reason: 'other'
    }]);
    expect(response.status).toBe(409);
    expect(await Return.countDocuments({ order: order._id })).toBe(1);
  });

  test('legacy orders without line totals allocate discounts safely', async () => {
    const [owner, first, second] = await Promise.all([
      auth(), product({ price: 100 }), product({ price: 100 })
    ]);
    const orderId = new (require('mongoose').Types.ObjectId)();
    await Order.collection.insertOne({
      _id: orderId,
      orderId: `LEGACY-${orderId}`,
      user: owner.user._id,
      items: [{
        product: first._id, name: first.name, price: 100, quantity: 1
      }, {
        product: second._id, name: second.name, price: 100, quantity: 1
      }],
      shippingAddress: {
        fullName: owner.user.fullName,
        phone: '03001234567',
        address: '1 Legacy Street',
        city: 'Lahore',
        province: 'Punjab',
        country: 'PK'
      },
      paymentMethod: 'cod',
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      subtotal: 200,
      shippingCost: 0,
      discount: 50,
      totalAmount: 150,
      deliveredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const response = await returnRequest(owner, { _id: orderId }, [{
      productId: String(first._id), quantity: 1, reason: 'other'
    }]);
    expect(response.status).toBe(201);
    expect(response.body.data.return.refundAmount).toBe(75);
  });

  test('the Payment captured-value cap remains authoritative after allocation', async () => {
    const [owner, admin, first, second] = await Promise.all([
      auth(), auth('admin'), product({ price: 100 }), product({ price: 100 })
    ]);
    const order = await deliveredOrder(owner.user, [
      { product: first, quantity: 1 },
      { product: second, quantity: 1 }
    ], { paymentMethod: 'stripe', discount: 50 });
    const payment = await completedPayment(owner.user, order, 'stripe');
    payment.paidAmount = 50;
    await payment.save();
    const created = await returnRequest(owner, order, [{
      productId: String(first._id), quantity: 1, reason: 'other'
    }]);
    const entry = await Return.findById(created.body.data.return._id);
    entry.status = 'approved';
    await entry.save();

    const response = await processReturn(admin, entry);
    expect(response.status).toBe(409);
    expect(fakeStripe.refunds.create).not.toHaveBeenCalled();
    expect((await Payment.findById(payment._id)).refundedAmount).toBe(0);
  });

  test('refund reservation saves sharing a session execute sequentially', async () => {
    const [owner, admin, item] = await Promise.all([
      auth(), auth('admin'), product()
    ]);
    const order = await deliveredOrder(owner.user, [{
      product: item, quantity: 1
    }], { paymentMethod: 'stripe' });
    await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'other'
      }],
      status: 'approved',
      refundAmount: 125
    });
    fakeStripe.refunds.create.mockResolvedValueOnce({
      id: 're_sequential_reservation',
      status: 'pending'
    });
    const tracker = trackModelSaves([
      ['refund', Refund],
      ['return', Return]
    ]);
    let response;

    try {
      response = await processReturn(admin, entry);
    } finally {
      tracker.restore();
    }

    expect(response.status).toBe(202);
    expect(tracker.wasConcurrent()).toBe(false);
    expect(tracker.calls.slice(-2)).toEqual(['refund', 'return']);
  });

  test('refund completion saves sharing a session execute sequentially', async () => {
    const [owner, admin, item] = await Promise.all([
      auth(), auth('admin'), product()
    ]);
    const order = await deliveredOrder(owner.user, [{
      product: item, quantity: 1
    }], { paymentMethod: 'stripe' });
    await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'other'
      }],
      status: 'approved',
      refundAmount: 125
    });
    const tracker = trackModelSaves([
      ['payment', Payment],
      ['refund', Refund],
      ['order', Order],
      ['return', Return]
    ]);
    let response;

    try {
      response = await processReturn(admin, entry);
    } finally {
      tracker.restore();
    }

    expect(response.status).toBe(200);
    expect(tracker.wasConcurrent()).toBe(false);
    expect(tracker.calls.slice(-4)).toEqual([
      'payment', 'refund', 'order', 'return'
    ]);
  });

  test.each([0, -1, 0.5, '1'])('rejects invalid return quantity %p', async (quantity) => {
    const [owner, item] = await Promise.all([auth(), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 2 }]);
    const response = await returnRequest(owner, order, [{
      productId: String(item._id), quantity, reason: 'other'
    }]);
    expect(response.status).toBe(400);
    expect(await Return.countDocuments()).toBe(0);
  });

  test('rejects unknown lines and mismatched variants', async () => {
    const [owner, item, other] = await Promise.all([auth(), product(), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }]);

    expect((await returnRequest(owner, order, [{
      productId: String(other._id), quantity: 1, reason: 'wrong_item'
    }])).status).toBe(400);
    expect((await returnRequest(owner, order, [{
      productId: String(item._id),
      variantId: String(other._id),
      quantity: 1,
      reason: 'wrong_item'
    }])).status).toBe(400);
  });

  test('prior partial refunds reduce the next return eligibility', async () => {
    const [owner, item] = await Promise.all([auth(), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 3 }]);
    await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 2,
        price: 125,
        reason: 'damaged'
      }],
      status: 'refunded',
      refundAmount: 250,
      refundedAt: new Date()
    });

    expect((await returnRequest(owner, order, [{
      productId: String(item._id), quantity: 2, reason: 'other'
    }])).status).toBe(409);
    expect((await returnRequest(owner, order, [{
      productId: String(item._id), quantity: 1, reason: 'other'
    }])).status).toBe(201);
  });

  test('provider failure/timeout is non-final and leaves inventory unchanged', async () => {
    const [owner, admin, item] = await Promise.all([auth(), auth('admin'), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }], {
      paymentMethod: 'stripe'
    });
    const payment = await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        reason: 'damaged'
      }],
      status: 'approved',
      refundAmount: 125
    });
    fakeStripe.refunds.create.mockRejectedValueOnce(new Error('isolated timeout'));

    const response = await processReturn(admin, entry);
    expect(response.status).toBe(502);
    const unchangedReturn = await Return.findById(entry._id);
    expect(unchangedReturn.status).toBe('approved');
    expect(unchangedReturn.refundedAt).toBeFalsy();
    expect((await Product.findById(item._id)).stock).toBe(20);
    const unresolvedRefund = await Refund.findOne({ payment: payment._id });
    expect(unresolvedRefund.status).toBe('Processing');
    expect(unresolvedRefund.completedAt).toBeNull();
  });

  test('pending provider result completes and restocks only after verified webhook', async () => {
    const [owner, admin, item] = await Promise.all([auth(), auth('admin'), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }], {
      paymentMethod: 'stripe'
    });
    const payment = await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        reason: 'damaged'
      }],
      status: 'inspected',
      refundAmount: 125
    });
    fakeStripe.refunds.create.mockResolvedValueOnce({
      id: 're_return_pending',
      status: 'pending'
    });

    const started = await request(app)
      .put(`/api/returns/${entry._id}/status`)
      .set('Authorization', admin.authorization)
      .send({ status: 'refunded' });
    expect(started.status).toBe(202);
    expect((await Return.findById(entry._id)).status).toBe('inspected');
    expect((await Product.findById(item._id)).stock).toBe(20);

    const refund = await Refund.findOne({ payment: payment._id });
    const result = await require('../../services/payment/RefundService').handleProviderEvent({
      id: 'evt_return_refund_success',
      data: {
        object: {
          id: 're_return_pending',
          status: 'succeeded',
          amount: 12500,
          currency: 'pkr',
          metadata: {
            refundId: String(refund._id),
            paymentId: String(payment._id),
            orderId: String(order._id)
          }
        }
      }
    });
    expect(result.outcome).toBe('processed');
    expect(await Return.findById(entry._id)).toMatchObject({ status: 'refunded' });
    expect((await Product.findById(item._id)).stock).toBe(21);
    expect((await Refund.findById(refund._id)).status).toBe('Completed');
  });

  test('provider-declared failure remains non-final and does not restock', async () => {
    const [owner, admin, item] = await Promise.all([auth(), auth('admin'), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }], {
      paymentMethod: 'stripe'
    });
    await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{ product: item._id, name: item.name, quantity: 1, price: 125, reason: 'damaged' }],
      status: 'approved',
      refundAmount: 125
    });
    fakeStripe.refunds.create.mockResolvedValueOnce({
      id: 're_return_failed',
      status: 'failed'
    });

    expect((await processReturn(admin, entry)).status).toBe(502);
    expect((await Return.findById(entry._id)).status).toBe('approved');
    expect((await Product.findById(item._id)).stock).toBe(20);
    const failedRefund = await Refund.findOne({ order: order._id });
    expect(failedRefund.status).toBe('Failed');
    expect(failedRefund.completedAt).toBeNull();
  });

  test('provider success survives a later local failure and reconciles without a second provider refund', async () => {
    const [owner, admin, item] = await Promise.all([auth(), auth('admin'), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }], {
      paymentMethod: 'stripe'
    });
    await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{ product: item._id, name: item.name, quantity: 1, price: 125, reason: 'damaged' }],
      status: 'approved',
      refundAmount: 125
    });
    const restock = jest.spyOn(ReturnInventoryService, 'restockInTransaction')
      .mockRejectedValueOnce(new Error('isolated local transaction failure'));

    expect((await processReturn(admin, entry)).status).toBe(500);
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect((await Return.findById(entry._id)).status).toBe('approved');
    expect((await Product.findById(item._id)).stock).toBe(20);

    restock.mockRestore();
    expect((await processReturn(admin, entry)).status).toBe(200);
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect((await Return.findById(entry._id)).status).toBe('refunded');
    expect((await Product.findById(item._id)).stock).toBe(21);
  });

  test('confirmed provider refund is exactly-once across repeat and concurrent processing', async () => {
    const [owner, admin, item] = await Promise.all([auth(), auth('admin'), product()]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }], {
      paymentMethod: 'stripe'
    });
    await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        reason: 'damaged'
      }],
      status: 'approved',
      refundAmount: 125
    });

    const responses = await Promise.all([
      processReturn(admin, entry),
      processReturn(admin, entry)
    ]);
    expect(responses.every((response) => [200, 202].includes(response.status))).toBe(true);
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect((await Product.findById(item._id)).stock).toBe(21);
    expect(await Refund.countDocuments({ order: order._id })).toBe(1);
    expect(await InventoryTransaction.countDocuments({
      reference: entry.returnNumber,
      type: 'return'
    })).toBe(1);

    expect((await processReturn(admin, entry)).status).toBe(200);
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect((await Product.findById(item._id)).stock).toBe(21);
  });

  test('COD manual confirmation is explicit, atomic and admin-only', async () => {
    const [owner, other, admin, item] = await Promise.all([
      auth(), auth(), auth('admin'), product()
    ]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }]);
    const payment = await completedPayment(owner.user, order, 'cod');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        reason: 'other'
      }],
      status: 'approved',
      refundMethod: 'bank_transfer',
      refundAmount: 125
    });

    expect((await processReturn(other, entry)).status).toBe(403);
    expect((await Product.findById(item._id)).stock).toBe(20);
    expect((await processReturn(admin, entry)).status).toBe(200);
    expect(fakeStripe.refunds.create).not.toHaveBeenCalled();
    expect(await Return.findById(entry._id)).toMatchObject({ status: 'refunded' });
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'Refunded', refundedAmount: 125
    });
    expect((await Product.findById(item._id)).stock).toBe(21);
  });

  test('provider-reference index excludes absent/null/empty IDs and rejects a real duplicate', async () => {
    const schemaIndex = Refund.schema.indexes().find(
      ([, options]) => options.name === 'unique_provider_refund_reference'
    );
    expect(schemaIndex).toEqual([{
      provider: 1,
      providerRefundId: 1
    }, expect.objectContaining({
      unique: true,
      partialFilterExpression: {
        providerRefundId: { $type: 'string', $gt: '' }
      }
    })]);
    expect(schemaIndex[1].sparse).toBeUndefined();

    const [owner, admin, firstItem, secondItem] = await Promise.all([
      auth(), auth('admin'), product(), product()
    ]);
    const firstOrder = await deliveredOrder(owner.user, [{
      product: firstItem, quantity: 1
    }]);
    const secondOrder = await deliveredOrder(owner.user, [{
      product: secondItem, quantity: 1
    }]);
    await completedPayment(owner.user, firstOrder, 'cod');
    await completedPayment(owner.user, secondOrder, 'cod');
    const firstReturn = await Return.create({
      order: firstOrder._id,
      customer: owner.user._id,
      items: [{
        product: firstItem._id,
        orderLineKey: `${firstItem._id}:root`,
        name: firstItem.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'other'
      }],
      status: 'approved',
      refundMethod: 'bank_transfer',
      refundAmount: 125
    });
    const secondReturn = await Return.create({
      order: secondOrder._id,
      customer: owner.user._id,
      items: [{
        product: secondItem._id,
        orderLineKey: `${secondItem._id}:root`,
        name: secondItem.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'other'
      }],
      status: 'approved',
      refundMethod: 'bank_transfer',
      refundAmount: 125
    });

    expect((await processReturn(admin, firstReturn)).status).toBe(200);
    const firstRefund = await Refund.findOne({ order: firstOrder._id });
    await Refund.collection.updateOne(
      { _id: firstRefund._id },
      { $set: { providerRefundId: null } }
    );
    expect((await processReturn(admin, secondReturn)).status).toBe(200);
    expect(await Refund.countDocuments({ provider: 'cod' })).toBe(2);

    const secondRefund = await Refund.findOne({ order: secondOrder._id });
    await Refund.collection.updateOne(
      { _id: secondRefund._id },
      { $set: { providerRefundId: '' } }
    );
    await Refund.collection.updateOne(
      { _id: firstRefund._id },
      { $set: { providerRefundId: '' } }
    );

    const realReference = 're_phase_1d_unique_reference';
    await Refund.collection.updateOne(
      { _id: firstRefund._id },
      { $set: { provider: 'stripe', providerRefundId: realReference } }
    );
    await expect(Refund.collection.updateOne(
      { _id: secondRefund._id },
      { $set: { provider: 'stripe', providerRefundId: realReference } }
    )).rejects.toMatchObject({ code: 11000 });
  });

  test('catalog hard deletion and destructive variant removal are blocked only for historical references', async () => {
    const [owner, superAdmin, referenced, unreferenced] = await Promise.all([
      auth(), auth('super_admin'), product(), product()
    ]);
    await deliveredOrder(owner.user, [{ product: referenced, quantity: 1 }]);

    // Archive both products prior to deletion test
    await request(app)
      .post(`/api/admin/products/${referenced._id}/archive`)
      .set('Authorization', superAdmin.authorization);
    await request(app)
      .post(`/api/admin/products/${unreferenced._id}/archive`)
      .set('Authorization', superAdmin.authorization);

    const blockedDelete = await request(app)
      .delete(`/api/admin/products/${referenced._id}`)
      .set('Authorization', superAdmin.authorization);
    expect(blockedDelete.status).toBe(409);
    expect(await Product.findById(referenced._id)).not.toBeNull();

    const allowedDelete = await request(app)
      .delete(`/api/admin/products/${unreferenced._id}`)
      .set('Authorization', superAdmin.authorization);
    expect(allowedDelete.status).toBe(200);
    expect(await Product.findById(unreferenced._id)).toBeNull();

    const variantProduct = await product({
      variants: [{
        sku: `RET-INT-VARIANT-${++sequence}`,
        price: 125,
        stock: 5,
        isDefault: true
      }]
    });
    const variantId = variantProduct.variants[0]._id;
    await deliveredOrder(owner.user, [{
      product: variantProduct,
      quantity: 1,
      variantId,
      isDefaultVariant: true
    }]);

    const blockedVariantRemoval = await request(app)
      .put(`/api/admin/products/${variantProduct._id}`)
      .set('Authorization', superAdmin.authorization)
      .send({ variants: [] });
    expect(blockedVariantRemoval.status).toBe(409);
    expect((await Product.findById(variantProduct._id)).variants.id(variantId))
      .not.toBeNull();

    const unreferencedVariantProduct = await product({
      variants: [{
        sku: `RET-INT-UNREFERENCED-VARIANT-${++sequence}`,
        price: 125,
        stock: 3,
        isDefault: true
      }]
    });
    const allowedVariantRemoval = await request(app)
      .put(`/api/admin/products/${unreferencedVariantProduct._id}`)
      .set('Authorization', superAdmin.authorization)
      .send({ variants: [], price: 125 });
    expect(allowedVariantRemoval.status).toBe(200);
    expect((await Product.findById(unreferencedVariantProduct._id)).variants)
      .toHaveLength(0);
  });

  test('enforces valid return transitions, terminal states and stale concurrent updates', async () => {
    const [owner, admin, item] = await Promise.all([
      auth(), auth('admin'), product()
    ]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }]);
    const createEntry = (status = 'pending') => Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'other'
      }],
      status,
      refundAmount: 125
    });

    const valid = await createEntry();
    expect((await updateReturnStatus(admin, valid, 'approved')).status).toBe(200);
    expect((await updateReturnStatus(admin, valid, 'received')).status).toBe(200);
    expect((await updateReturnStatus(admin, valid, 'inspected')).status).toBe(200);

    const skipped = await createEntry();
    expect((await updateReturnStatus(admin, skipped, 'received')).status).toBe(409);
    expect((await Return.findById(skipped._id)).status).toBe('pending');

    const rejected = await createEntry();
    expect((await updateReturnStatus(admin, rejected, 'rejected')).status).toBe(200);
    expect((await updateReturnStatus(admin, rejected, 'approved')).status).toBe(409);

    const cancelled = await createEntry();
    expect((await updateReturnStatus(admin, cancelled, 'cancelled')).status).toBe(200);
    expect((await updateReturnStatus(admin, cancelled, 'approved')).status).toBe(409);

    const bypass = await createEntry('approved');
    expect((await updateReturnStatus(admin, bypass, 'refunded')).status).toBe(409);
    expect((await Return.findById(bypass._id)).status).toBe('approved');

    const stale = await createEntry();
    const competing = await Promise.all([
      updateReturnStatus(admin, stale, 'rejected'),
      updateReturnStatus(admin, stale, 'cancelled')
    ]);
    expect(competing.filter((response) => response.status === 200)).toHaveLength(1);
    expect(competing.filter((response) => response.status === 409)).toHaveLength(1);
  });

  test('provider-confirmed missing product becomes durable reconciliation and retries exactly once', async () => {
    const [owner, refundAdmin, reconciliationAdmin, item] = await Promise.all([
      auth(), auth('admin'), auth('admin'), product()
    ]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }], {
      paymentMethod: 'stripe'
    });
    const payment = await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'damaged'
      }],
      status: 'approved',
      refundAmount: 125
    });
    await Product.collection.deleteOne({ _id: item._id });

    const confirmed = await processReturn(refundAdmin, entry);
    expect(confirmed.status).toBe(202);
    expect(confirmed.body.data.status).toBe('inventory_reconciliation');
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);
    const refund = await Refund.findOne({ order: order._id })
      .select('+providerOutcome');
    expect(refund.status).toBe('Completed');
    expect(refund.providerOutcome).toBe('succeeded');
    expect(refund.inventoryReconciliationStatus).toBe('pending');
    expect(refund.inventoryReconciliationReasonCode)
      .toBe('RETURN_INVENTORY_PRODUCT_MISSING');
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'Refunded',
      refundedAmount: 125
    });
    expect(await InventoryTransaction.countDocuments({ order: order._id })).toBe(0);

    const duplicateReturn = await returnRequest(owner, order, [{
      productId: String(item._id),
      quantity: 1,
      reason: 'other'
    }]);
    expect(duplicateReturn.status).toBe(409);

    expect((await processReturn(reconciliationAdmin, entry)).status).toBe(202);
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);

    await Product.create({
      _id: item._id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      sku: item.sku,
      price: 125,
      stock: 0,
      isActive: false
    });
    const reconciled = await reconcileInventory(
      reconciliationAdmin,
      entry,
      'retry',
      'Historical catalog record restored'
    );
    expect(reconciled.status).toBe(200);
    expect(reconciled.body.data.inventoryStatus).toBe('restored');
    expect((await Product.findById(item._id)).stock).toBe(1);
    expect(await InventoryTransaction.countDocuments({ order: order._id })).toBe(1);

    const replay = await reconcileInventory(refundAdmin, entry, 'retry');
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect((await Product.findById(item._id)).stock).toBe(1);
    expect(await InventoryTransaction.countDocuments({ order: order._id })).toBe(1);
    expect(String((await Refund.findById(refund._id)).inventoryReconciledBy))
      .toBe(String(reconciliationAdmin.user._id));
  });

  test('missing variant supports authorized, attributable and idempotent manual resolution', async () => {
    const [owner, refundAdmin, resolutionAdmin, other, item] = await Promise.all([
      auth(),
      auth('admin'),
      auth('admin'),
      auth(),
      product({
        variants: [{
          sku: `RET-INT-MISSING-VARIANT-${++sequence}`,
          price: 125,
          stock: 5,
          isDefault: true
        }]
      })
    ]);
    const variantId = item.variants[0]._id;
    const order = await deliveredOrder(owner.user, [{
      product: item,
      quantity: 1,
      variantId,
      isDefaultVariant: true
    }], { paymentMethod: 'stripe' });
    await completedPayment(owner.user, order, 'stripe');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        variantId,
        isDefaultVariant: true,
        orderLineKey: `${item._id}:${variantId}`,
        name: item.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'damaged'
      }],
      status: 'inspected',
      refundAmount: 125
    });
    await Product.collection.updateOne(
      { _id: item._id },
      { $set: { variants: [] } }
    );

    expect((await processReturn(refundAdmin, entry)).status).toBe(202);
    const refund = await Refund.findOne({ order: order._id });
    expect(refund.inventoryReconciliationReasonCode)
      .toBe('RETURN_INVENTORY_VARIANT_MISSING');
    expect((await reconcileInventory(other, entry, 'manual_resolve', 'Verified')).status)
      .toBe(403);

    const resolved = await reconcileInventory(
      resolutionAdmin,
      entry,
      'manual_resolve',
      'Warehouse balance corrected outside the catalog record'
    );
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.inventoryStatus).toBe('manual_resolved');
    const storedRefund = await Refund.findById(refund._id);
    expect(String(storedRefund.inventoryReconciledBy))
      .toBe(String(resolutionAdmin.user._id));
    expect((await Return.findById(entry._id)).status).toBe('refunded');
    expect(await InventoryTransaction.countDocuments({ order: order._id })).toBe(0);

    const replay = await reconcileInventory(
      refundAdmin,
      entry,
      'manual_resolve',
      'Attempted overwrite'
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(String((await Refund.findById(refund._id)).inventoryReconciledBy))
      .toBe(String(resolutionAdmin.user._id));
  });

  test('manual confirmation records the actual administrator and preserves attribution across retry', async () => {
    const [owner, creatorAdmin, confirmingAdmin, item] = await Promise.all([
      auth(), auth('admin'), auth('admin'), product()
    ]);
    const order = await deliveredOrder(owner.user, [{ product: item, quantity: 1 }]);
    const payment = await completedPayment(owner.user, order, 'cod');
    const entry = await Return.create({
      order: order._id,
      customer: owner.user._id,
      items: [{
        product: item._id,
        orderLineKey: `${item._id}:root`,
        name: item.name,
        quantity: 1,
        price: 125,
        refundAmount: 125,
        reason: 'other'
      }],
      status: 'approved',
      refundMethod: 'bank_transfer',
      refundAmount: 125
    });
    const idempotencyKey = `return:${entry._id}`;
    const reason = `Approved return ${entry.returnNumber}`;
    const requestHash = RefundService.stableHash({
      paymentId: String(payment._id),
      amount: 125,
      reason,
      returnId: String(entry._id),
      method: 'bank_transfer',
      processingMode: 'manual'
    });
    const refund = await Refund.create({
      payment: payment._id,
      order: order._id,
      customer: owner.user._id,
      provider: 'cod',
      amount: 125,
      currency: 'PKR',
      status: 'Pending',
      idempotencyKey,
      requestHash,
      providerIdempotencyKey: `refund:${payment._id}:${idempotencyKey}`,
      providerAttemptStatus: 'Unclaimed',
      reservationActive: true,
      processingMode: 'manual',
      providerOutcome: 'unattempted',
      processedBy: creatorAdmin.user._id,
      reason,
      returnId: entry._id,
      method: 'bank_transfer',
      history: [{ status: 'Pending', source: 'admin' }]
    });
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { refundReservedAmount: 125 } }
    );
    entry.refund = refund._id;
    await entry.save();

    const restock = jest.spyOn(ReturnInventoryService, 'restockInTransaction')
      .mockRejectedValueOnce(new Error('isolated post-confirmation transaction failure'));
    expect((await processReturn(confirmingAdmin, entry)).status).toBe(500);
    expect(String((await Refund.findById(refund._id)).manualConfirmedBy))
      .toBe(String(confirmingAdmin.user._id));

    expect((await processReturn(creatorAdmin, entry)).status).toBe(200);
    restock.mockRestore();
    const completed = await Refund.findById(refund._id);
    expect(String(completed.processedBy)).toBe(String(creatorAdmin.user._id));
    expect(String(completed.manualConfirmedBy)).toBe(String(confirmingAdmin.user._id));
    expect(completed.manualConfirmedAt).toBeInstanceOf(Date);
    const ledger = await InventoryTransaction.findOne({
      order: order._id,
      type: 'return'
    });
    expect(String(ledger.performedBy)).toBe(String(confirmingAdmin.user._id));

    expect((await processReturn(creatorAdmin, entry)).status).toBe(200);
    expect(String((await Refund.findById(refund._id)).manualConfirmedBy))
      .toBe(String(confirmingAdmin.user._id));
    expect(await InventoryTransaction.countDocuments({ order: order._id }))
      .toBe(1);
  });
});
