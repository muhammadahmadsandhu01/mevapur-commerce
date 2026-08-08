const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Review = require('../../models/Review');
const Return = require('../../models/Return');
const Refund = require('../../models/Refund');
const Notification = require('../../models/Notification');
const Coupon = require('../../models/Coupon');
const Wishlist = require('../../models/Wishlist');

let sequence = 0;
const auth = async (role = 'customer') => { sequence += 1; const user = await global.createTestUser({ email: `customer-${sequence}@example.test`, role }); const session = await Session.create({ user: user._id, refreshTokenHash: crypto.randomBytes(32).toString('hex'), tokenFamilyId: crypto.randomUUID(), isActive: true, isRevoked: false, expiresAt: new Date(Date.now() + 3600000) }); return { user, authorization: `Bearer ${TokenService.generateAccessToken({ userId: user._id, sessionId: session._id, tokenVersion: user.tokenVersion })}` }; };
const product = async () => { sequence += 1; return Product.create({ name: `Customer Product ${sequence}`, slug: `customer-product-${sequence}`, description: 'Customer commerce product', sku: `CUS-${sequence}`, price: 100, stock: 20, isActive: true }); };
const order = async (user, item, status = 'Delivered') => Order.create({ user: user._id, idempotencyKey: crypto.randomUUID(), requestHash: crypto.randomBytes(32).toString('hex'), items: [{ product: item._id, name: item.name, price: 100, quantity: 1, lineTotal: 100 }], shippingAddress: { fullName: user.fullName, phone: '03001234567', address: '1 Customer Street', city: 'Lahore', province: 'Punjab', country: 'PK' }, paymentMethod: 'cod', payment: { currency: 'PKR' }, paymentStatus: 'Pending', orderStatus: status, subtotal: 100, shippingCost: 0, taxAmount: 0, discount: 0, totalAmount: 100, statusTimeline: [{ status, actor: user._id, actorRole: 'customer', timestamp: new Date(), note: '' }], deliveredAt: status === 'Delivered' ? new Date() : null });

describe('P6B customer commerce ownership contracts', () => {
  beforeAll(async () => { await Promise.all([Wishlist.syncIndexes(), Review.syncIndexes(), Return.syncIndexes(), Refund.syncIndexes(), Coupon.syncIndexes()]); });
  test('profiles and addresses are owner-scoped, validated and market-eligible', async () => {
    const [first, second] = await Promise.all([auth(), auth()]);
    expect((await request(app).get('/api/account/profile').set('Authorization', first.authorization)).status).toBe(200);
    expect((await request(app).patch('/api/account/profile').set('Authorization', first.authorization).send({ fullName: 'Safe Customer', role: 'admin' })).status).toBe(400);
    const created = await request(app).post('/api/account/addresses').set('Authorization', first.authorization).send({ fullName: 'Safe Customer', phone: '03001234567', address: '1 Lane', city: 'Lahore', province: 'Punjab', country: 'PK', isDefault: true });
    expect(created.status).toBe(201); expect(created.body.data.address.isDefault).toBe(true);
    expect((await request(app).patch(`/api/account/addresses/${created.body.data.address.id}`).set('Authorization', first.authorization).send({ city: 'Karachi', isDefault: true })).body.data.address.city).toBe('Karachi');
    expect((await request(app).patch(`/api/account/addresses/${created.body.data.address.id}`).set('Authorization', second.authorization).send({ city: 'Karachi' })).status).toBe(404);
    expect((await request(app).post('/api/account/addresses').set('Authorization', first.authorization).send({ fullName: 'Safe Customer', phone: '03001234567', address: '1 Lane', city: 'New York', province: 'NY', country: 'US' })).status).toBe(409);
    expect((await request(app).delete(`/api/account/addresses/${created.body.data.address.id}`).set('Authorization', first.authorization)).status).toBe(204);
  });
  test('wishlist prevents duplicates and is isolated by customer', async () => {
    const [first, second, item] = await Promise.all([auth(), auth(), product()]);
    expect((await request(app).post(`/api/account/wishlist/${item._id}`).set('Authorization', first.authorization)).status).toBe(201);
    await request(app).post(`/api/account/wishlist/${item._id}`).set('Authorization', first.authorization);
    expect(await Wishlist.countDocuments({ user: first.user._id, product: item._id })).toBe(1);
    expect((await request(app).delete(`/api/account/wishlist/${item._id}`).set('Authorization', second.authorization)).status).toBe(404);
    expect((await request(app).get('/api/account/wishlist').set('Authorization', second.authorization)).body.data.items).toHaveLength(0); expect((await request(app).delete(`/api/account/wishlist/${item._id}`).set('Authorization', first.authorization)).status).toBe(204);
  });
  test('reviews require a delivered purchase and only approved reviews are public', async () => {
    const [first, second, item] = await Promise.all([auth(), auth(), product()]); await order(first.user, item);
    const created = await request(app).post('/api/account/reviews').set('Authorization', first.authorization).send({ productId: String(item._id), rating: 5, comment: 'A verified and detailed review.' });
    expect(created.status).toBe(201); expect((await request(app).get(`/api/account/reviews/product/${item._id}`)).body.data.reviews).toHaveLength(0);
    await Review.findByIdAndUpdate(created.body.data.review._id, { isApproved: true });
    expect((await request(app).get(`/api/account/reviews/product/${item._id}`)).body.data.reviews).toHaveLength(1);
    expect((await request(app).patch(`/api/account/reviews/${created.body.data.review._id}`).set('Authorization', second.authorization).send({ comment: 'Not mine.' })).status).toBe(404);
    expect((await request(app).patch(`/api/account/reviews/${created.body.data.review._id}`).set('Authorization', first.authorization).send({ comment: 'Updated review text.' })).status).toBe(200); expect((await request(app).delete(`/api/account/reviews/${created.body.data.review._id}`).set('Authorization', first.authorization)).status).toBe(204);
    expect((await request(app).post('/api/account/reviews').set('Authorization', second.authorization).send({ productId: String(item._id), rating: 6, comment: 'invalid' })).status).toBe(400);
  });
  test('returns do not refund or restock and enforce delivered-order ownership', async () => {
    const [first, second, item] = await Promise.all([auth(), auth(), product()]); const delivered = await order(first.user, item); const pending = await order(first.user, item, 'Pending'); const before = (await Product.findById(item._id)).stock;
    const returned = await request(app).post('/api/account/returns').set('Authorization', first.authorization).send({ orderId: String(delivered._id), items: [{ productId: String(item._id), quantity: 1, reason: 'not_as_described' }] });
    expect(returned.status).toBe(201); expect((await Product.findById(item._id)).stock).toBe(before); expect((await Return.findById(returned.body.data.return._id)).status).toBe('pending');
    expect((await request(app).put(`/api/returns/${returned.body.data.return._id}/status`).set('Authorization', first.authorization).send({ status: 'refunded' })).status).toBe(403);
    expect((await request(app).post('/api/account/returns').set('Authorization', second.authorization).send({ orderId: String(delivered._id), items: [{ productId: String(item._id), quantity: 1, reason: 'other' }] })).status).toBe(404);
    expect((await request(app).post('/api/account/returns').set('Authorization', first.authorization).send({ orderId: String(pending._id), items: [{ productId: String(item._id), quantity: 1, reason: 'other' }] })).status).toBe(409);
  });
  test('refunds, invoices, tracking and notifications expose only the owner-safe view', async () => {
    const [first, second, item] = await Promise.all([auth(), auth(), product()]); const placed = await order(first.user, item);
    await Refund.create({ payment: placed._id, order: placed._id, customer: first.user._id, provider: 'cod', amount: 20, currency: 'PKR', status: 'Pending', processedBy: first.user._id, idempotencyKey: crypto.randomUUID(), requestHash: crypto.randomBytes(32).toString('hex'), providerIdempotencyKey: crypto.randomUUID() });
    await Notification.create({ recipient: first.user._id, type: 'order', title: 'Order update', message: 'Your order is placed.' });
    const refundResponse = await request(app).get('/api/account/refunds').set('Authorization', first.authorization); expect(refundResponse.body.data.refunds[0]).not.toHaveProperty('providerRefundId');
    expect((await request(app).get('/api/account/refunds').set('Authorization', second.authorization)).body.data.refunds).toHaveLength(0);
    const invoice = await request(app).get(`/api/account/orders/${placed._id}/invoice`).set('Authorization', first.authorization); expect(invoice.status).toBe(200); expect(invoice.body.data.invoice.total).toBe(100);
    expect((await request(app).get(`/api/account/orders/${placed._id}/invoice`).set('Authorization', second.authorization)).status).toBe(404);
    expect((await request(app).get(`/api/account/orders/${placed._id}/tracking`).set('Authorization', first.authorization)).body.data.tracking.timeline).toHaveLength(1);
    const notifications = await request(app).get('/api/account/notifications').set('Authorization', first.authorization); const id = notifications.body.data.notifications[0]._id; expect((await request(app).put(`/api/account/notifications/${id}/read`).set('Authorization', first.authorization)).status).toBe(200); expect((await request(app).put(`/api/account/notifications/${id}/read`).set('Authorization', second.authorization)).status).toBe(404);
  });
  test('coupon preview gives server feedback while final order authority remains separate', async () => {
    await Coupon.create({ code: 'P6B10', type: 'percentage', value: 10, minOrderAmount: 50, startDate: new Date(Date.now() - 1000), endDate: new Date(Date.now() + 86400000), isActive: true });
    expect((await request(app).post('/api/coupons/validate').send({ code: 'P6B10', subtotal: 100 })).body.data.discountAmount).toBe(10);
    expect((await request(app).post('/api/coupons/validate').send({ code: 'P6B10', subtotal: 10 })).status).toBe(400);
  });
  test('operational return restock is transaction-guarded and cannot run twice', async () => {
    const [customer, admin, item] = await Promise.all([auth(), auth('admin'), product()]); const placed = await order(customer.user, item); const entry = await Return.create({ order: placed._id, customer: customer.user._id, items: [{ product: item._id, name: item.name, quantity: 1, price: 100, reason: 'damaged' }], status: 'approved', refundAmount: 100 });
    await request(app).post(`/api/returns/${entry._id}/refund`).set('Authorization', admin.authorization).send({ refundAmount: 100 }); expect((await Product.findById(item._id)).stock).toBe(21);
    await request(app).put(`/api/returns/${entry._id}/status`).set('Authorization', admin.authorization).send({ status: 'refunded' }); expect((await Product.findById(item._id)).stock).toBe(21);
  });
});
