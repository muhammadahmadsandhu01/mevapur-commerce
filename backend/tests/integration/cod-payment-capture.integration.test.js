const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const AuditLog = require('../../models/AuditLog');

let sequence = 0;

const createAuthUser = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `cod-user-${sequence}@example.test`,
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
    session,
    authorization: `Bearer ${TokenService.generateAccessToken({
      userId: user._id,
      sessionId: session._id,
      tokenVersion: user.tokenVersion
    })}`
  };
};

const createTestProduct = async () => {
  sequence += 1;
  return Product.create({
    name: `COD Test Product ${sequence}`,
    slug: `cod-test-product-${sequence}-${Date.now()}`,
    price: 1450,
    stock: 50,
    category: new mongoose.Types.ObjectId(),
    isActive: true,
    status: 'published',
    images: ['https://example.com/item.jpg']
  });
};

const createTestOrder = async ({
  user,
  product,
  paymentMethod = 'cod',
  orderStatus = 'Delivered',
  paymentStatus = 'Pending',
  totalAmount = 1450,
  paidAt = null
}) => {
  sequence += 1;
  const orderId = `ORD-20260907-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  return Order.create({
    orderId,
    user: user._id,
    idempotencyKey: `idemp-key-${sequence}-${Date.now()}`,
    requestHash: crypto.randomBytes(32).toString('hex'),
    items: [{
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: 1,
      lineTotal: product.price,
      image: 'https://example.com/item.jpg'
    }],
    shippingAddress: {
      fullName: 'Muhammad Ahmad',
      phone: '+923001234567',
      address: 'House 123 Street 4',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan'
    },
    paymentMethod,
    paymentStatus,
    payment: {
      provider: paymentMethod === 'cod' ? 'Cash on Delivery' : 'Stripe',
      currency: 'PKR',
      paidAt
    },
    subtotal: totalAmount,
    shippingCost: 0,
    discount: 0,
    taxAmount: 0,
    totalAmount,
    orderStatus,
    statusTimeline: [{
      status: 'Pending',
      actor: user._id,
      actorRole: 'customer',
      timestamp: new Date()
    }]
  });
};

describe('COD Payment Capture and Realized Revenue Integration', () => {
  let admin;
  let customer;
  let product;

  beforeEach(async () => {
    admin = await createAuthUser('admin');
    customer = await createAuthUser('customer');
    product = await createTestProduct();
  });

  // 1. Admin marks Delivered COD Pending → Paid
  test('1. Admin marks Delivered COD Pending -> Paid successfully', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending'
    });

    const response = await request(app)
      .patch(`/api/orders/${order.orderId}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Paid',
        adminNote: 'COD collected on delivery by courier'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.idempotentReplay).toBe(false);
    expect(response.body.data.order.paymentStatus).toBe('Paid');
    expect(response.body.data.order.payment.paidAt).toBeTruthy();

    // Verify DB
    const updated = await Order.findById(order._id);
    expect(updated.paymentStatus).toBe('Paid');
    expect(updated.payment.paidAt).toBeTruthy();
    expect(updated.adminNotes.length).toBe(1);
    expect(updated.adminNotes[0].note).toBe('COD collected on delivery by courier');
  });

  // 2. Server sets paidAt (never accepts from client)
  test('2. Server sets paidAt timestamp and rejects client-provided paidAt or extra fields', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending'
    });

    const beforeCall = new Date(Date.now() - 1000);
    const fakeClientDate = '2020-01-01T00:00:00.000Z';

    const response = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Paid',
        paidAt: fakeClientDate,
        amount: 99999
      });

    // Zod strict validation rejects extra fields
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORDER_VALIDATION_FAILED');
  });

  // 3. Customer / non-admin is forbidden
  test('3. Non-admin customer cannot call COD payment capture endpoint (403)', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending'
    });

    const response = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', customer.authorization)
      .send({
        paymentStatus: 'Paid'
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  // 4. Non-COD manual payment forbidden
  test('4. Non-COD manual payment is forbidden (409)', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'stripe',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending'
    });

    const response = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Paid'
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_MANUAL_PAYMENT_FORBIDDEN');
  });

  // 5. Undelivered COD forbidden
  test('5. Undelivered COD order cannot be marked Paid (409)', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Processing',
      paymentStatus: 'Pending'
    });

    const response = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Paid'
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_NOT_DELIVERED');
  });

  // 6. Paid -> Paid idempotent replay
  test('6. Paid -> Paid is an idempotent replay preserving original paidAt and without duplicate audit logs', async () => {
    const originalPaidAt = new Date('2026-09-07T12:00:00.000Z');
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Paid',
      paidAt: originalPaidAt
    });

    const initialAuditCount = await AuditLog.countDocuments({
      'metadata.orderId': String(order._id)
    });

    const response = await request(app)
      .patch(`/api/orders/${order.orderId}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Paid',
        adminNote: 'Duplicate attempt'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.idempotentReplay).toBe(true);

    const afterAuditCount = await AuditLog.countDocuments({
      'metadata.orderId': String(order._id)
    });
    expect(afterAuditCount).toBe(initialAuditCount);

    const reloaded = await Order.findById(order._id);
    expect(new Date(reloaded.payment.paidAt).toISOString()).toBe(originalPaidAt.toISOString());
  });

  // 7. Paid -> Pending forbidden
  test('7. Paid -> Pending or other illegal transitions are forbidden (400)', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Paid',
      paidAt: new Date()
    });

    const response = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Pending'
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORDER_VALIDATION_FAILED');
  });

  // 8. Malformed status / body rejected
  test('8. Malformed status value is rejected (400)', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending'
    });

    const response = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Refunded'
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORDER_VALIDATION_FAILED');
  });

  // 9. Missing order returns 404
  test('9. Missing order reference returns 404 ORDER_NOT_FOUND', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const response = await request(app)
      .patch(`/api/orders/${fakeId}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({
        paymentStatus: 'Paid'
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  // 10. Concurrency safety: simultaneous requests produce exactly 1 mutation & audit event
  test('10. Concurrent duplicate payment-capture requests remain consistent and atomic', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending'
    });

    const results = await Promise.all([
      request(app)
        .patch(`/api/orders/${order._id}/payment-status`)
        .set('Authorization', admin.authorization)
        .send({ paymentStatus: 'Paid', adminNote: 'Concurrent call 1' }),
      request(app)
        .patch(`/api/orders/${order._id}/payment-status`)
        .set('Authorization', admin.authorization)
        .send({ paymentStatus: 'Paid', adminNote: 'Concurrent call 2' })
    ]);

    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);

    const replayFlags = results.map((r) => r.body.data.idempotentReplay);
    // Exactly one must be a primary mutation (false) and the other an idempotent replay (true)
    expect(replayFlags.filter((f) => f === false).length).toBe(1);
    expect(replayFlags.filter((f) => f === true).length).toBe(1);

    // Audit log count for this order must be exactly 1
    const auditLogs = await AuditLog.find({
      'metadata.orderId': String(order._id),
      eventName: 'PAYMENT.COMPLETED'
    });
    expect(auditLogs.length).toBe(1);
  });

  // 11. Response excludes sensitive fields
  test('11. Response sanitizes order and excludes sensitive fields', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending'
    });

    const response = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({ paymentStatus: 'Paid' });

    expect(response.status).toBe(200);
    const resOrder = response.body.data.order;
    expect(resOrder.idempotencyKey).toBeUndefined();
    expect(resOrder.requestHash).toBeUndefined();
    expect(resOrder.payment.clientSecret).toBeUndefined();
    expect(resOrder.payment.gatewayResponse).toBeUndefined();
  });

  // 12. Pending COD contributes 0 to revenue via GET /api/orders/stats
  test('12. Delivered COD with Pending paymentStatus contributes 0 to realized revenue in stats', async () => {
    await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending',
      totalAmount: 1450
    });

    const response = await request(app)
      .get('/api/orders/stats')
      .set('Authorization', admin.authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.stats.totalRevenue).toBe(0);
    expect(response.body.data.stats.deliveredOrders).toBe(1);
  });

  // 13. Paid COD contributes full revenue via GET /api/orders/stats
  test('13. Delivered COD with Paid paymentStatus contributes full realized revenue in stats', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Pending',
      totalAmount: 1450
    });

    // Before capture
    let statsRes = await request(app)
      .get('/api/orders/stats')
      .set('Authorization', admin.authorization);
    expect(statsRes.body.data.stats.totalRevenue).toBe(0);

    // Perform capture
    const captureRes = await request(app)
      .patch(`/api/orders/${order._id}/payment-status`)
      .set('Authorization', admin.authorization)
      .send({ paymentStatus: 'Paid' });
    expect(captureRes.status).toBe(200);

    // After capture
    statsRes = await request(app)
      .get('/api/orders/stats')
      .set('Authorization', admin.authorization);
    expect(statsRes.body.data.stats.totalRevenue).toBe(1450);
  });

  // 14. Failed / Refunded orders do not falsely inflate revenue
  test('14. Failed and fully Refunded orders contribute 0 to realized revenue', async () => {
    const failedOrder = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'stripe',
      orderStatus: 'Delivered',
      paymentStatus: 'Failed',
      totalAmount: 2000
    });

    const refundedOrder = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'stripe',
      orderStatus: 'Delivered',
      paymentStatus: 'Refunded',
      totalAmount: 3000,
      paidAt: new Date()
    });

    const refundedPayment = await Payment.create({
      order: refundedOrder._id,
      user: customer.user._id,
      provider: 'stripe',
      providerPaymentId: `pi_test_${crypto.randomUUID()}`,
      amount: 3000,
      paidAmount: 3000,
      status: 'Refunded',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    await Refund.create({
      refundId: 'REF-TEST-0001',
      order: refundedOrder._id,
      payment: refundedPayment._id,
      customer: customer.user._id,
      provider: 'stripe',
      providerRefundId: `re_test_${crypto.randomUUID()}`,
      amount: 3000,
      currency: 'PKR',
      reason: 'customer_request',
      status: 'Completed',
      processedBy: admin.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID(),
      completedAt: new Date()
    });

    const statsRes = await request(app)
      .get('/api/orders/stats')
      .set('Authorization', admin.authorization);

    expect(statsRes.status).toBe(200);
    // Realized revenue should be 0 because Failed=0 and Refunded net=0
    expect(statsRes.body.data.stats.totalRevenue).toBe(0);
  });

  // 15. Partial refund correctly reflects canonical net realized revenue
  test('15. PartiallyRefunded order contributes canonical net realized revenue (orderTotal - refundAmount)', async () => {
    const order = await createTestOrder({
      user: customer.user,
      product,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'PartiallyRefunded',
      totalAmount: 5000,
      paidAt: new Date()
    });

    const payment = await Payment.create({
      order: order._id,
      user: customer.user._id,
      provider: 'cod',
      providerPaymentId: `COD-${order._id}`,
      amount: 5000,
      paidAmount: 5000,
      status: 'PartiallyRefunded',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    await Refund.create({
      refundId: 'REF-TEST-0002',
      order: order._id,
      payment: payment._id,
      customer: customer.user._id,
      provider: 'cod',
      providerRefundId: `re_test_${crypto.randomUUID()}`,
      amount: 1500,
      currency: 'PKR',
      reason: 'damaged_item',
      status: 'Completed',
      processedBy: admin.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID(),
      completedAt: new Date()
    });

    const statsRes = await request(app)
      .get('/api/orders/stats')
      .set('Authorization', admin.authorization);

    expect(statsRes.status).toBe(200);
    // Realized revenue should be 5000 - 1500 = 3500
    expect(statsRes.body.data.stats.totalRevenue).toBe(3500);
  });
});
