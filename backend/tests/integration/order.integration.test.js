const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Product = require('../../models/Product');
const Coupon = require('../../models/Coupon');
const Order = require('../../models/Order');
const Session = require('../../models/Session');
const InventoryTransaction = require('../../models/InventoryTransaction');

let sequence = 0;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `order-${sequence}@example.com`,
    role
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  });

  return {
    user,
    token,
    authorization: `Bearer ${token}`
  };
};

const createProduct = async (overrides = {}) => {
  sequence += 1;
  return Product.create({
    name: `Order Product ${sequence}`,
    slug: `order-product-${sequence}`,
    description: 'Product used by the isolated order integration tests',
    sku: `ORDER-${sequence}`,
    price: 125,
    stock: 10,
    isActive: true,
    ...overrides
  });
};

const createCoupon = async (overrides = {}) => {
  sequence += 1;
  return Coupon.create({
    code: `ORDER${sequence}`,
    type: 'fixed',
    value: 25,
    minOrderAmount: 0,
    maxDiscount: 0,
    usageLimit: 0,
    perCustomerLimit: 0,
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 60 * 60 * 1000),
    isActive: true,
    ...overrides
  });
};

const payloadFor = (product, overrides = {}) => ({
  items: [{
    productId: product._id.toString(),
    quantity: 1
  }],
  shippingAddress: {
    fullName: 'Order Integration',
    phone: '03001234567',
    address: '12 Integration Test Street',
    city: 'Lahore',
    province: 'Punjab',
    country: 'Pakistan'
  },
  paymentMethod: 'cod',
  ...overrides
});

const placeOrder = (auth, payload, key = crypto.randomUUID()) => request(app)
  .post('/api/orders')
  .set('Authorization', auth.authorization)
  .set('Idempotency-Key', key)
  .send(payload);

describe('Order API integration', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Product.syncIndexes(),
      Coupon.syncIndexes(),
      InventoryTransaction.syncIndexes()
    ]);
  });

  test('requires P0 authentication and the Idempotency-Key header', async () => {
    const product = await createProduct();
    const unauthenticated = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(payloadFor(product));

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe('AUTH_TOKEN_REQUIRED');

    const auth = await createAuth();
    const missingKey = await request(app)
      .post('/api/orders')
      .set('Authorization', auth.authorization)
      .send(payloadFor(product));

    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.code).toBe('ORDER_VALIDATION_FAILED');
  });

  test('uses database price and creates a canonical pending COD order', async () => {
    const auth = await createAuth();
    const product = await createProduct({ price: 250, stock: 3 });
    const response = await placeOrder(auth, payloadFor(product, {
      items: [{
        productId: product._id.toString(),
        quantity: 2
      }]
    }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        idempotentReplay: false,
        order: {
          paymentMethod: 'cod',
          paymentStatus: 'Pending',
          orderStatus: 'Pending',
          subtotal: 500,
          shippingCost: 250,
          taxAmount: 0,
          totalAmount: 750
        }
      }
    });
    expect(response.body.data.order.orderId)
      .toMatch(/^ORD-\d{8}-[A-F0-9]{12}$/);
    expect(response.body.data.order.items[0]).toMatchObject({
      name: product.name,
      sku: product.sku,
      price: 250,
      quantity: 2,
      lineTotal: 500
    });
    expect(response.body.data.order.idempotencyKey).toBeUndefined();
    expect((await Product.findById(product._id)).stock).toBe(1);
    expect(await InventoryTransaction.countDocuments({ type: 'sale' })).toBe(1);
  });

  test('rejects client monetary totals before business logic', async () => {
    const auth = await createAuth();
    const product = await createProduct();
    const response = await placeOrder(auth, {
      ...payloadFor(product),
      subtotal: 1,
      shippingCost: 0,
      discount: 1000,
      totalAmount: 1
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORDER_VALIDATION_FAILED');
    expect(await Order.countDocuments()).toBe(0);
  });

  test('resolves authoritative variant price and conditionally decrements variant stock', async () => {
    const auth = await createAuth();
    const product = await createProduct({
      variants: [{
        sku: `VAR-${sequence}`,
        attributes: [{ name: 'Weight', value: '1kg' }],
        price: 375,
        stock: 2,
        isDefault: true,
        images: ['https://example.test/variant.jpg']
      }]
    });
    const variant = product.variants[0];

    const response = await placeOrder(auth, payloadFor(product, {
      items: [{
        productId: product._id.toString(),
        variantId: variant._id.toString(),
        quantity: 1
      }],
      paymentMethod: 'stripe'
    }));

    expect(response.status).toBe(201);
    expect(response.body.data.order.paymentMethod).toBe('stripe');
    expect(response.body.data.order.paymentStatus).toBe('Pending');
    expect(response.body.data.order.items[0]).toMatchObject({
      variantId: variant._id.toString(),
      price: 375,
      lineTotal: 375,
      sku: variant.sku
    });

    const updated = await Product.findById(product._id);
    expect(updated.variants.id(variant._id).stock).toBe(1);
    expect(updated.stock).toBe(1);
  });

  test('does not drive mirrored root stock negative for a default variant', async () => {
    const auth = await createAuth();
    const product = await createProduct({
      variants: [{
        sku: `VAR-GUARD-${sequence}`,
        attributes: [{ name: 'Weight', value: '2kg' }],
        price: 500,
        stock: 2,
        isDefault: true,
        images: []
      }]
    });
    await Product.updateOne(
      { _id: product._id },
      { $set: { stock: 0 } }
    );

    const response = await placeOrder(auth, payloadFor(product, {
      items: [{
        productId: product._id.toString(),
        variantId: product.variants[0]._id.toString(),
        quantity: 1
      }]
    }));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_OUT_OF_STOCK');
    const unchanged = await Product.findById(product._id);
    expect(unchanged.stock).toBe(0);
    expect(unchanged.variants[0].stock).toBe(2);
    expect(await Order.countDocuments()).toBe(0);
  });

  test('rejects unavailable products and insufficient stock without an order', async () => {
    const auth = await createAuth();
    const inactive = await createProduct({ isActive: false });
    const inactiveResponse = await placeOrder(auth, payloadFor(inactive));
    expect(inactiveResponse.status).toBe(409);
    expect(inactiveResponse.body.error.code).toBe('ORDER_PRODUCT_UNAVAILABLE');

    const limited = await createProduct({ stock: 1 });
    const stockResponse = await placeOrder(auth, payloadFor(limited, {
      items: [{
        productId: limited._id.toString(),
        quantity: 2
      }]
    }));
    expect(stockResponse.status).toBe(409);
    expect(stockResponse.body.error.code).toBe('ORDER_OUT_OF_STOCK');
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(limited._id)).stock).toBe(1);
  });

  test('replays the same request and rejects a conflicting idempotency payload', async () => {
    const auth = await createAuth();
    const product = await createProduct({ stock: 3 });
    const key = crypto.randomUUID();
    const first = await placeOrder(auth, payloadFor(product), key);
    const replay = await placeOrder(auth, payloadFor(product), key);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(replay.body.data.order._id).toBe(first.body.data.order._id);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(2);
    expect(await InventoryTransaction.countDocuments({ type: 'sale' })).toBe(1);

    const conflict = await placeOrder(auth, payloadFor(product, {
      customerNote: 'materially different'
    }), key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('ORDER_IDEMPOTENCY_CONFLICT');
  });

  test('simultaneous duplicate requests create one order and reserve once', async () => {
    const auth = await createAuth();
    const product = await createProduct({ stock: 1 });
    const key = crypto.randomUUID();
    const payload = payloadFor(product);

    const responses = await Promise.all([
      placeOrder(auth, payload, key),
      placeOrder(auth, payload, key)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(0);
    expect(await InventoryTransaction.countDocuments({ type: 'sale' })).toBe(1);
  });

  test('two customers cannot oversell one stock unit', async () => {
    const [firstAuth, secondAuth] = await Promise.all([
      createAuth(),
      createAuth()
    ]);
    const product = await createProduct({ stock: 1 });
    const payload = payloadFor(product);

    const responses = await Promise.all([
      placeOrder(firstAuth, payload),
      placeOrder(secondAuth, payload)
    ]);
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(0);
    expect(await InventoryTransaction.countDocuments({ type: 'sale' })).toBe(1);
  });

  test('coupon global limit cannot be exceeded concurrently', async () => {
    const [firstAuth, secondAuth] = await Promise.all([
      createAuth(),
      createAuth()
    ]);
    const product = await createProduct({ price: 1000, stock: 2 });
    const coupon = await createCoupon({ usageLimit: 1 });
    const payload = payloadFor(product, { couponCode: coupon.code });

    const responses = await Promise.all([
      placeOrder(firstAuth, payload),
      placeOrder(secondAuth, payload)
    ]);

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(1);
  });

  test('rejects an invalid supplied coupon without changing order or stock', async () => {
    const auth = await createAuth();
    const product = await createProduct({ price: 1000, stock: 2 });

    const response = await placeOrder(auth, payloadFor(product, {
      couponCode: 'NOT-A-REAL-COUPON'
    }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORDER_COUPON_INVALID');
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(product._id)).stock).toBe(2);
  });

  test('transaction failure rolls back coupon, stock, journal, and order', async () => {
    const auth = await createAuth();
    const product = await createProduct({ price: 1000, stock: 2 });
    const coupon = await createCoupon({ usageLimit: 1 });
    jest.spyOn(InventoryTransaction, 'create')
      .mockRejectedValueOnce(new Error('journal unavailable'));

    const response = await placeOrder(auth, payloadFor(product, {
      couponCode: coupon.code
    }));

    expect(response.status).toBe(500);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(product._id)).stock).toBe(2);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
    expect(await InventoryTransaction.countDocuments()).toBe(0);
  });

  test('cancellation restores inventory and coupon at most once', async () => {
    const auth = await createAuth();
    const product = await createProduct({ price: 1000, stock: 2 });
    const coupon = await createCoupon({ usageLimit: 2, perCustomerLimit: 1 });
    const placed = await placeOrder(auth, payloadFor(product, {
      couponCode: coupon.code
    }));
    expect(placed.status).toBe(201);
    expect(placed.body.data.order.coupon).toMatchObject({
      code: coupon.code,
      discountAmount: 25
    });
    const orderId = placed.body.data.order._id;

    const first = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', auth.authorization)
      .send({ reason: 'Changed my mind' });
    const replay = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', auth.authorization)
      .send({ reason: 'Changed my mind' });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect((await Product.findById(product._id)).stock).toBe(2);
    const restoredCoupon = await Coupon.findById(coupon._id);
    expect(restoredCoupon.usedCount).toBe(0);
    expect(restoredCoupon.redemptions[0].count).toBe(0);
    expect(await InventoryTransaction.countDocuments()).toBe(2);
  });

  test('enforces ownership, pagination, admin role, and valid transitions', async () => {
    const [owner, other, admin] = await Promise.all([
      createAuth(),
      createAuth(),
      createAuth('admin')
    ]);
    const product = await createProduct({ stock: 3 });
    const placed = await placeOrder(owner, payloadFor(product));
    const orderId = placed.body.data.order._id;

    const forbiddenDetail = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', other.authorization);
    expect(forbiddenDetail.status).toBe(403);
    expect(forbiddenDetail.body.error.code).toBe('ORDER_FORBIDDEN');

    const customerTransition = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', owner.authorization)
      .send({ orderStatus: 'Confirmed' });
    expect(customerTransition.status).toBe(403);

    const invalidTransition = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', admin.authorization)
      .send({ orderStatus: 'Processing' });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code)
      .toBe('ORDER_STATUS_TRANSITION_INVALID');

    const confirmed = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', admin.authorization)
      .send({ orderStatus: 'Confirmed', adminNote: 'Inventory verified' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.order.orderStatus).toBe('Confirmed');
    expect(confirmed.body.data.order.statusTimeline.at(-1)).toMatchObject({
      status: 'Confirmed',
      actorRole: 'admin'
    });

    const history = await request(app)
      .get('/api/orders/my-orders?page=1&limit=1')
      .set('Authorization', owner.authorization);
    expect(history.status).toBe(200);
    expect(history.body.data.orders).toHaveLength(1);
    expect(history.body.data.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 1
    });
  });
});
