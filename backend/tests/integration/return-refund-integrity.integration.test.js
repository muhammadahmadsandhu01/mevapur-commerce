const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const stripeProvider = require('../../services/payment/providers/StripeProvider');
const ReturnInventoryService = require('../../services/ReturnInventoryService');
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

const product = async ({ price = 125, stock = 20 } = {}) => {
  sequence += 1;
  return Product.create({
    name: `Return Integrity Product ${sequence}`,
    slug: `return-integrity-product-${sequence}`,
    description: 'Return integrity test product',
    sku: `RET-INT-${sequence}`,
    price,
    stock,
    isActive: true
  });
};

const deliveredOrder = async (user, items, {
  paymentMethod = 'cod',
  totalAmount
} = {}) => {
  const snapshotItems = items.map(({ product: item, quantity, price = item.price }) => ({
    product: item._id,
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
    shippingCost: 0,
    taxAmount: 0,
    discount: 0,
    totalAmount: totalAmount ?? subtotal,
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
    }], { refundAmount: 999999 });
    expect(manipulated.status).toBe(400);

    const valid = await returnRequest(owner, order, [{
      productId: String(item._id), quantity: 1, reason: 'not_as_described'
    }]);
    expect(valid.status).toBe(201);
    const entry = await Return.findById(valid.body.data.return._id);
    expect(entry.refundAmount).toBe(125);
    expect(entry.items[0].price).toBe(125);
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
});
