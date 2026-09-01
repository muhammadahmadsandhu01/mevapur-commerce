const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');

let sequence = 0;
const authAdmin = async () => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `admin-stats-${sequence}@example.test`,
    role: 'admin'
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

describe('Admin Stats Aggregation Integration', () => {
  test('requires authentication and admin authorization', async () => {
    const unauthenticated = await request(app).get('/api/admin/stats');
    expect(unauthenticated.status).toBe(401);

    const customer = await authAdmin();
    customer.user.role = 'customer';
    await customer.user.save();

    const forbidden = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', customer.authorization);
    expect(forbidden.status).toBe(403);
  });

  test('returns 0 and null baselines for empty database', async () => {
    const admin = await authAdmin();
    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', admin.authorization);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totalRevenue).toBe(0);
    expect(response.body.data.todayRevenue).toBe(0);
    expect(response.body.data.monthlyRevenue).toBe(0);
    expect(response.body.data.totalOrders).toBe(0);
    expect(response.body.data.revenueGrowth).toBeNull();
    expect(response.body.data.ordersGrowth).toBeNull();
    expect(response.body.data.customersGrowth).toBeNull();
    expect(response.body.data.productsGrowth).toBeNull();
    expect(response.body.data.conversionRate).toBeNull();
    expect(Object.keys(response.body.data).sort()).toEqual([
      'averageOrderValue',
      'cancelledOrders',
      'cancelledPaidLiability',
      'conversionRate',
      'customersGrowth',
      'deliveredOrders',
      'grossCaptured',
      'legacyOrderCaptureAmount',
      'legacyOrderCaptureCount',
      'lowStockProducts',
      'monthlyRevenue',
      'newCustomers',
      'ordersGrowth',
      'outOfStockProducts',
      'overRefundAnomalyAmount',
      'overRefundAnomalyCount',
      'paymentOrderMismatchAmount',
      'paymentOrderMismatchCount',
      'pendingOrders',
      'processingOrders',
      'productsGrowth',
      'refundReconciliationMismatchAmount',
      'refundReconciliationMismatchCount',
      'revenueGrowth',
      'shippedOrders',
      'todayRevenue',
      'totalCustomers',
      'totalOrders',
      'totalProducts',
      'totalRefunded',
      'totalRevenue'
    ]);
  });

  test('correctly reconciles Payment, Order, Legacy captures, and Anomaly metrics', async () => {
    const admin = await authAdmin();
    const user = await global.createTestUser({ email: `customer-stats-${sequence}@example.test` });

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const pastMonth = new Date();
    pastMonth.setMonth(pastMonth.getMonth() - 2);

    const testProductId = new mongoose.Types.ObjectId();

    // 1. Reconciled Capture: Completed Payment + matching Order Paid
    const order1 = await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 100.10,
      subtotal: 100.10,
      paymentMethod: 'stripe',
      orderStatus: 'Delivered',
      paymentStatus: 'Paid',
      createdAt: today,
      shippingAddress: { fullName: 'U1', phone: '123', address: 'A1', city: 'C1', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P1', price: 100.10, quantity: 1, lineTotal: 100.10 }],
      statusTimeline: [{ status: 'Delivered', actor: user._id, actorRole: 'customer', timestamp: today, note: '' }]
    });

    await Payment.create({
      order: order1._id,
      user: user._id,
      provider: 'stripe',
      providerPaymentId: `pi_test_${crypto.randomUUID()}`,
      amount: 100.10,
      status: 'Completed',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    // 2. Legacy Order Capture: Order marked Paid without Payment record
    await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 200.00,
      subtotal: 200.00,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Paid',
      createdAt: today,
      shippingAddress: { fullName: 'U2', phone: '123', address: 'A2', city: 'C2', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P2', price: 200.00, quantity: 1, lineTotal: 200.00 }],
      statusTimeline: [{ status: 'Delivered', actor: user._id, actorRole: 'customer', timestamp: today, note: '' }]
    });

    // 3. Payment/Order Mismatch: Completed Payment but Order is Pending (unpaid)
    const order3 = await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 300.00,
      subtotal: 300.00,
      paymentMethod: 'jazzcash',
      orderStatus: 'Pending',
      paymentStatus: 'Pending',
      createdAt: today,
      shippingAddress: { fullName: 'U3', phone: '123', address: 'A3', city: 'C3', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P3', price: 300.00, quantity: 1, lineTotal: 300.00 }],
      statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: today, note: '' }]
    });

    await Payment.create({
      order: order3._id,
      user: user._id,
      provider: 'jazzcash',
      providerPaymentId: `jc_test_${crypto.randomUUID()}`,
      amount: 300.00,
      status: 'Completed',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    // 4. Cancelled but Paid (paid-but-cancelled liability)
    const order4 = await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 500.00,
      subtotal: 500.00,
      paymentMethod: 'stripe',
      orderStatus: 'Cancelled',
      paymentStatus: 'Paid',
      createdAt: pastMonth,
      shippingAddress: { fullName: 'U4', phone: '123', address: 'A4', city: 'C4', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P4', price: 500.00, quantity: 1, lineTotal: 500.00 }],
      statusTimeline: [{ status: 'Cancelled', actor: user._id, actorRole: 'customer', timestamp: pastMonth, note: '' }]
    });

    await Payment.create({
      order: order4._id,
      user: user._id,
      provider: 'stripe',
      providerPaymentId: `pi_test_${crypto.randomUUID()}`,
      amount: 500.00,
      status: 'Completed',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    // 5. Reconciled Capture with Verified Completed Refund (Partial)
    const order5 = await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 400.00,
      subtotal: 400.00,
      paymentMethod: 'stripe',
      orderStatus: 'Delivered',
      paymentStatus: 'PartiallyRefunded',
      createdAt: today,
      shippingAddress: { fullName: 'U5', phone: '123', address: 'A5', city: 'C5', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P5', price: 400.00, quantity: 1, lineTotal: 400.00 }],
      statusTimeline: [{ status: 'Delivered', actor: user._id, actorRole: 'customer', timestamp: today, note: '' }]
    });

    const payment5 = await Payment.create({
      order: order5._id,
      user: user._id,
      provider: 'stripe',
      providerPaymentId: `pi_test_${crypto.randomUUID()}`,
      amount: 400.00,
      status: 'PartiallyRefunded',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    await Refund.create({
      order: order5._id,
      payment: payment5._id,
      customer: user._id,
      provider: 'stripe',
      providerRefundId: `re_test_${crypto.randomUUID()}`,
      amount: 50.00,
      status: 'Completed',
      processedBy: admin.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', admin.authorization);

    expect(response.status).toBe(200);
    const stats = response.body.data;

    // Expected realized revenue = Order 1 (100.10) + Order 2 (200.00) + Order 5 (400 - 50 = 350.00) = 650.10
    expect(stats.totalRevenue).toBe(650.1);
    expect(stats.grossCaptured).toBe(700.1);
    expect(stats.totalRefunded).toBe(50.0);
    expect(stats.legacyOrderCaptureCount).toBe(1);
    expect(stats.legacyOrderCaptureAmount).toBe(200.0);
    expect(stats.paymentOrderMismatchCount).toBe(1);
    expect(stats.paymentOrderMismatchAmount).toBe(300.0);
    expect(stats.cancelledPaidLiability).toBe(500.0);
  });
});
