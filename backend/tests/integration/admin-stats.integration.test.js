const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Order = require('../../models/Order');

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
      'lowStockProducts',
      'monthlyRevenue',
      'newCustomers',
      'ordersGrowth',
      'outOfStockProducts',
      'pendingOrders',
      'processingOrders',
      'productsGrowth',
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

  test('correctly calculates total, today, and monthly revenue with floating point values and canonical financial semantics', async () => {
    const admin = await authAdmin();
    const user = await global.createTestUser({ email: `customer-stats-${sequence}@example.test` });

    const today = new Date();
    today.setHours(12, 0, 0, 0); // middle of today

    const pastMonth = new Date();
    pastMonth.setMonth(pastMonth.getMonth() - 2); // 2 months ago

    const testProductId = new mongoose.Types.ObjectId();

    // Order 1: Delivered and Paid in today window
    await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 100.10,
      subtotal: 100.10,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Paid',
      createdAt: today,
      shippingAddress: { fullName: 'U1', phone: '123', address: 'A1', city: 'C1', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P1', price: 100.10, quantity: 1, lineTotal: 100.10 }],
      statusTimeline: [{ status: 'Delivered', actor: user._id, actorRole: 'customer', timestamp: today, note: '' }]
    });

    // Order 2: Pending and Unpaid in today window
    await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 250.20,
      subtotal: 250.20,
      paymentMethod: 'cod',
      orderStatus: 'Pending',
      paymentStatus: 'Pending',
      createdAt: today,
      shippingAddress: { fullName: 'U2', phone: '123', address: 'A2', city: 'C2', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P2', price: 250.20, quantity: 1, lineTotal: 250.20 }],
      statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: today, note: '' }]
    });

    // Order 3: Cancelled but Paid (paid-but-cancelled anomaly/liability)
    await Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 500.00,
      subtotal: 500.00,
      paymentMethod: 'stripe',
      orderStatus: 'Cancelled',
      paymentStatus: 'Paid',
      createdAt: pastMonth,
      shippingAddress: { fullName: 'U3', phone: '123', address: 'A3', city: 'C3', province: 'Punjab', country: 'PK' },
      items: [{ product: testProductId, name: 'P3', price: 500.00, quantity: 1, lineTotal: 500.00 }],
      statusTimeline: [{ status: 'Cancelled', actor: user._id, actorRole: 'customer', timestamp: pastMonth, note: '' }]
    });

    const response = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', admin.authorization);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // Realized revenue isolates paid non-cancelled orders
    expect(response.body.data.totalRevenue).toBe(100.10);
    expect(response.body.data.todayRevenue).toBe(100.10);
    expect(response.body.data.monthlyRevenue).toBe(100.10);
    expect(response.body.data.grossCaptured).toBe(100.10);
    expect(response.body.data.cancelledPaidLiability).toBe(500.00);
    expect(response.body.data.totalOrders).toBe(3);
    expect(response.body.data.pendingOrders).toBe(1);
    expect(response.body.data.cancelledOrders).toBe(1);
    expect(response.body.data.averageOrderValue).toBe(100.10);
  });
});
