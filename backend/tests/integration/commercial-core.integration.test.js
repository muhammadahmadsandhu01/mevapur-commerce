const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const InventoryTransaction = require('../../models/InventoryTransaction');
const MarketConfig = require('../../models/MarketConfig');
const ShippingZone = require('../../models/ShippingZone');

let sequence = 0;
const auth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({ email: `core-${sequence}@example.test`, role });
  const session = await Session.create({ user: user._id, refreshTokenHash: crypto.randomBytes(32).toString('hex'), tokenFamilyId: crypto.randomUUID(), isActive: true, isRevoked: false, expiresAt: new Date(Date.now() + 3600000) });
  const token = TokenService.generateAccessToken({ userId: user._id, sessionId: session._id, tokenVersion: user.tokenVersion });
  return { user, authorization: `Bearer ${token}` };
};
const product = async (overrides = {}) => {
  sequence += 1;
  return Product.create({ name: `Core Product ${sequence}`, slug: `core-product-${sequence}`, description: 'Commercial core integration product', sku: `CORE-${sequence}`, price: 100, stock: 10, isActive: true, ...overrides });
};
const orderPayload = (item) => ({
  items: [{ productId: String(item._id), quantity: 1 }],
  shippingAddress: { fullName: 'Core Customer', phone: '03001234567', address: '12 Commercial Core Street', city: 'Lahore', province: 'Punjab', country: 'PK' },
  paymentMethod: 'cod', currency: 'PKR'
});

describe('P6A commercial core contracts', () => {
  beforeAll(async () => {
    await Promise.all([Product.syncIndexes(), Order.syncIndexes(), InventoryTransaction.syncIndexes(), MarketConfig.syncIndexes(), ShippingZone.syncIndexes()]);
  });

  test('validates the canonical product query and rejects unsupported parameters', async () => {
    const first = await product({ price: 20 });
    const second = await product({ price: 200 });
    const response = await request(app).get(`/api/products?keyword=${encodeURIComponent('Core Product')}&minPrice=10&maxPrice=100&inStock=true&sortBy=price-asc&page=1&limit=10`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((entry) => String(entry._id))).toContain(String(first._id));
    expect(response.body.data.map((entry) => String(entry._id))).not.toContain(String(second._id));
    const invalid = await request(app).get('/api/products?search=legacy');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('COMMERCIAL_CORE_VALIDATION_FAILED');
  });

  test('uses configuration data for thresholds, remote shipping and country eligibility', async () => {
    const normal = await request(app).get('/api/commerce/shipping/quote?country=PK&currency=PKR&subtotal=4999&city=Lahore&region=Punjab');
    expect(normal.status).toBe(200);
    expect(normal.body.data.shippingAmount).toBe(250);
    expect(normal.body.data.deliveryMinDays).toBe(2);
    const free = await request(app).get('/api/commerce/shipping/quote?country=PK&currency=PKR&subtotal=5000&city=Lahore&region=Punjab');
    expect(free.body.data.shippingAmount).toBe(0);
    await ShippingZone.updateOne({ name: 'Pakistan major cities' }, { $set: { normalRate: 275 } });
    const changed = await request(app).get('/api/commerce/shipping/quote?country=PK&currency=PKR&subtotal=4999&city=Lahore&region=Punjab');
    expect(changed.body.data.shippingAmount).toBe(275);
    await ShippingZone.updateOne({ name: 'Pakistan standard delivery' }, { $set: { remoteCities: ['RemoteTown'] } });
    const remote = await request(app).get('/api/commerce/shipping/quote?country=PK&currency=PKR&subtotal=100&city=RemoteTown&region=Punjab');
    expect(remote.body.data).toMatchObject({ shippingAmount: 350, remoteArea: true, deliveryMinDays: 4, deliveryMaxDays: 7 });
    const unavailable = await request(app).get('/api/commerce/shipping/quote?country=US&currency=USD&subtotal=100');
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error.code).toBe('MARKET_COUNTRY_INELIGIBLE');
  });

  test('enforces admin-only, atomic and idempotent inventory adjustments including variants', async () => {
    const [admin, customer] = await Promise.all([auth('admin'), auth()]);
    const root = await product();
    const denied = await request(app).post('/api/inventory/adjust').set('Authorization', customer.authorization).send({ productId: String(root._id), type: 'out', quantity: 1, reason: 'Denied' });
    expect(denied.status).toBe(403);
    const key = crypto.randomUUID();
    const first = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(root._id), type: 'out', quantity: 3, reason: 'Cycle count', operationKey: key });
    expect(first.status).toBe(200);
    expect(first.body.data.product.newStock).toBe(7);
    const replay = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(root._id), type: 'out', quantity: 3, reason: 'Cycle count', operationKey: key });
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect((await Product.findById(root._id)).stock).toBe(7);
    expect(await InventoryTransaction.countDocuments({ product: root._id })).toBe(1);
    const insufficient = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(root._id), type: 'out', quantity: 8, reason: 'Invalid', operationKey: crypto.randomUUID() });
    expect(insufficient.status).toBe(409);
    const variantProduct = await product({ variants: [{ sku: `CORE-V-${sequence}`, attributes: [{ name: 'Size', value: 'M' }], price: 100, stock: 4, isDefault: false }] });
    const variant = variantProduct.variants[0];
    const variantResponse = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(variantProduct._id), variantId: String(variant._id), type: 'out', quantity: 2, reason: 'Variant count', operationKey: crypto.randomUUID() });
    expect(variantResponse.status).toBe(200);
    expect((await Product.findById(variantProduct._id)).variants.id(variant._id).stock).toBe(2);
  });

  test('updates tracking without mutating payment state', async () => {
    const [customer, admin] = await Promise.all([auth(), auth('admin')]);
    const item = await product();
    const created = await request(app).post('/api/orders').set('Authorization', customer.authorization).set('Idempotency-Key', crypto.randomUUID()).send(orderPayload(item));
    expect(created.status).toBe(201);
    const orderId = created.body.data.order._id;
    const denied = await request(app).put(`/api/orders/${orderId}/tracking`).set('Authorization', customer.authorization).send({ trackingNumber: 'T-123' });
    expect(denied.status).toBe(403);
    const updated = await request(app).put(`/api/orders/${orderId}/tracking`).set('Authorization', admin.authorization).send({ courierCompany: 'TCS', trackingNumber: 'T-123' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.order).toMatchObject({ courierCompany: 'TCS', trackingNumber: 'T-123', paymentStatus: 'Pending' });
    const invalid = await request(app).put(`/api/orders/${orderId}/tracking`).set('Authorization', admin.authorization).send({ trackingNumber: 'x'.repeat(101) });
    expect(invalid.status).toBe(400);
  });
});
