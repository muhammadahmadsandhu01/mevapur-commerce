const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const FinancialMetricsService = require('../../services/order/FinancialMetricsService');
const TokenService = require('../../services/TokenService');
const { ORDER_STATUSES } = require('../../constants/orderConstants');
const { REFUND_STATUSES } = require('../../constants/paymentConstants');

const generateAuthHeader = async (user) => {
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });

  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion || 0
  });

  return `Bearer ${token}`;
};

describe('Phase 3 — Shared Fixture Financial Reconciliation across Endpoints', () => {
  let adminUser;
  let adminAuth;
  let customer1;
  let customer2;
  let zeroOrderCustomer;
  const dummyProductId = new mongoose.Types.ObjectId();

  const createOrderHelper = async ({
    user,
    orderId,
    orderStatus,
    paymentStatus,
    totalAmount,
    date = new Date()
  }) => {
    const order = await Order.create({
      orderId,
      user,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      orderStatus,
      paymentStatus,
      paymentMethod: 'stripe',
      subtotal: totalAmount,
      totalAmount,
      shippingCost: 0,
      discount: 0,
      createdAt: date,
      items: [{
        product: dummyProductId,
        name: 'Test Almonds',
        price: totalAmount,
        quantity: 1,
        lineTotal: totalAmount
      }],
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '03001234567',
        address: '123 Main Street',
        city: 'Lahore',
        province: 'Punjab',
        country: 'PK'
      },
      statusTimeline: [{
        status: orderStatus,
        actor: user,
        actorRole: 'customer',
        timestamp: date,
        note: ''
      }]
    });

    if (paymentStatus === 'Paid' || paymentStatus === 'PartiallyRefunded' || paymentStatus === 'Refunded') {
      await Payment.create({
        order: order._id,
        user,
        provider: 'stripe',
        providerPaymentId: `pi_test_${crypto.randomUUID()}`,
        amount: totalAmount,
        currency: 'PKR',
        status: 'Completed',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: crypto.randomUUID(),
        createdAt: date
      });
    } else if (paymentStatus === 'Failed') {
      await Payment.create({
        order: order._id,
        user,
        provider: 'stripe',
        providerPaymentId: `pi_test_${crypto.randomUUID()}`,
        amount: totalAmount,
        currency: 'PKR',
        status: 'Failed',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: crypto.randomUUID(),
        createdAt: date
      });
    }

    return order;
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce-test';
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});

    adminUser = await User.create({
      fullName: 'Super Admin',
      email: 'superadmin-reconciliation@mevapur.test',
      password: 'Password123!',
      role: 'super_admin',
      isVerified: true
    });
    adminAuth = await generateAuthHeader(adminUser);

    customer1 = await User.create({
      fullName: 'Customer One',
      email: 'cust1@example.test',
      password: 'Password123!',
      role: 'customer',
      isVerified: true
    });

    customer2 = await User.create({
      fullName: 'Customer Two',
      email: 'cust2@example.test',
      password: 'Password123!',
      role: 'customer',
      isVerified: true
    });

    zeroOrderCustomer = await User.create({
      fullName: 'Zero Order Customer',
      email: 'zero@example.test',
      password: 'Password123!',
      role: 'customer',
      isVerified: true
    });

    // 1. Paid Delivered order: Rs. 5,000 (Customer 1)
    await createOrderHelper({
      user: customer1._id,
      orderId: 'ORD-REC-01',
      orderStatus: ORDER_STATUSES.DELIVERED,
      paymentStatus: 'Paid',
      totalAmount: 5000
    });

    // 2. Paid Processing order: Rs. 3,000 with Completed Partial Refund of Rs. 1,000 -> Net Rs. 2,000 (Customer 1)
    const order2 = await createOrderHelper({
      user: customer1._id,
      orderId: 'ORD-REC-02',
      orderStatus: ORDER_STATUSES.PROCESSING,
      paymentStatus: 'PartiallyRefunded',
      totalAmount: 3000
    });
    await Refund.create({
      payment: new mongoose.Types.ObjectId(),
      order: order2._id,
      customer: customer1._id,
      provider: 'stripe',
      amount: 1000,
      currency: 'PKR',
      status: REFUND_STATUSES.COMPLETED,
      processedBy: adminUser._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID(),
      reason: 'Partial return'
    });

    // 3. Paid order with Completed 100% Full Refund: Rs. 1,500 with Rs. 1,500 refund -> Net Rs. 0 (Customer 1)
    const order3 = await createOrderHelper({
      user: customer1._id,
      orderId: 'ORD-REC-03',
      orderStatus: ORDER_STATUSES.DELIVERED,
      paymentStatus: 'Refunded',
      totalAmount: 1500
    });
    await Refund.create({
      payment: new mongoose.Types.ObjectId(),
      order: order3._id,
      customer: customer1._id,
      provider: 'stripe',
      amount: 1500,
      currency: 'PKR',
      status: REFUND_STATUSES.COMPLETED,
      processedBy: adminUser._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID(),
      reason: 'Full return'
    });

    // 4. Cancelled Paid order: Rs. 10,000 (Excluded from realized revenue) (Customer 1)
    await createOrderHelper({
      user: customer1._id,
      orderId: 'ORD-REC-04',
      orderStatus: ORDER_STATUSES.CANCELLED,
      paymentStatus: 'Paid',
      totalAmount: 10000
    });

    // 5. Unpaid / Pending order: Rs. 2,500 (Excluded from realized revenue) (Customer 1)
    await createOrderHelper({
      user: customer1._id,
      orderId: 'ORD-REC-05',
      orderStatus: ORDER_STATUSES.PENDING,
      paymentStatus: 'Pending',
      totalAmount: 2500
    });

    // 6. Failed payment order: Rs. 3,000 (Excluded from realized revenue) (Customer 2)
    await createOrderHelper({
      user: customer2._id,
      orderId: 'ORD-REC-06',
      orderStatus: ORDER_STATUSES.PENDING,
      paymentStatus: 'Failed',
      totalAmount: 3000
    });

    // 7. Paid order with a PENDING refund: Rs. 4,000 (Pending refund ignored until completed -> Net Rs. 4,000) (Customer 2)
    const order7 = await createOrderHelper({
      user: customer2._id,
      orderId: 'ORD-REC-07',
      orderStatus: ORDER_STATUSES.DELIVERED,
      paymentStatus: 'Paid',
      totalAmount: 4000
    });
    await Refund.create({
      payment: new mongoose.Types.ObjectId(),
      order: order7._id,
      customer: customer2._id,
      provider: 'stripe',
      amount: 1000,
      currency: 'PKR',
      status: REFUND_STATUSES.PENDING,
      processedBy: adminUser._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID(),
      reason: 'Pending refund'
    });

    // 8. Paid order with a REJECTED refund: Rs. 1,200 (Rejected refund ignored -> Net Rs. 1,200) (Customer 2)
    const order8 = await createOrderHelper({
      user: customer2._id,
      orderId: 'ORD-REC-08',
      orderStatus: ORDER_STATUSES.DELIVERED,
      paymentStatus: 'Paid',
      totalAmount: 1200
    });
    await Refund.create({
      payment: new mongoose.Types.ObjectId(),
      order: order8._id,
      customer: customer2._id,
      provider: 'stripe',
      amount: 500,
      currency: 'PKR',
      status: REFUND_STATUSES.REJECTED,
      processedBy: adminUser._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID(),
      reason: 'Rejected refund'
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('proves 100% mathematical reconciliation across Dashboard, Reports, Analytics, Admin Stats, and Customer endpoints', async () => {
    // Expected Realized Net Revenue:
    // Order 1: Rs. 5,000
    // Order 2: Rs. 3,000 - 1,000 = Rs. 2,000
    // Order 3: Rs. 1,500 - 1,500 = Rs. 0
    // Order 7: Rs. 4,000
    // Order 8: Rs. 1,200
    // Total Expected Realized Revenue: 5000 + 2000 + 0 + 4000 + 1200 = Rs. 12,200
    const EXPECTED_TOTAL_REVENUE = 12200;

    // Customer 1 Realized Spend: 5,000 + 2,000 + 0 = Rs. 7,000
    // Customer 1 Total Orders: 5 orders
    // Customer 1 Realized Orders: 3 orders
    // Customer 1 AOV: 7000 / 3 = Rs. 2,333.33

    // Customer 2 Realized Spend: 4,000 + 1,200 = Rs. 5,200
    // Customer 2 Total Orders: 3 orders
    // Customer 2 Realized Orders: 2 orders
    // Customer 2 AOV: 5200 / 2 = Rs. 2,600

    // 1. Dashboard Stats
    const dashboardStats = await FinancialMetricsService.getDashboardStats();
    expect(dashboardStats.totalRevenue).toBe(EXPECTED_TOTAL_REVENUE);
    expect(dashboardStats.totalOrders).toBe(8);

    // 2. Sales Report
    const salesReport = await FinancialMetricsService.getSalesReport({});
    expect(salesReport.summary.totalRevenue).toBe(EXPECTED_TOTAL_REVENUE);

    // 3. Analytics Report
    const analyticsReport = await FinancialMetricsService.getAnalytics();
    expect(analyticsReport.thisMonth.revenue).toBe(EXPECTED_TOTAL_REVENUE);

    // 4. Admin Stats Endpoint (GET /api/admin/stats)
    const adminStatsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', adminAuth);
    expect(adminStatsRes.status).toBe(200);
    expect(adminStatsRes.body.data.totalRevenue).toBe(EXPECTED_TOTAL_REVENUE);

    // 5. Customer List & Global Summary (GET /api/customers)
    const customerListRes = await request(app)
      .get('/api/customers')
      .set('Authorization', adminAuth);
    expect(customerListRes.status).toBe(200);
    expect(customerListRes.body.summary.global.totalRealizedSpend).toBe(EXPECTED_TOTAL_REVENUE);
    expect(customerListRes.body.summary.global.totalCustomers).toBe(3); // Customer 1, 2, and zero-order

    // Find Customer 1 in list
    const c1Data = customerListRes.body.data.find((c) => c.id === customer1._id.toString());
    expect(c1Data).toBeDefined();
    expect(c1Data.totalOrders).toBe(5);
    expect(c1Data.realizedOrders).toBe(3);
    expect(c1Data.totalSpent).toBe(7000);
    expect(c1Data.averageOrderValue).toBe(2333.33);

    // Find Customer 2 in list
    const c2Data = customerListRes.body.data.find((c) => c.id === customer2._id.toString());
    expect(c2Data).toBeDefined();
    expect(c2Data.totalOrders).toBe(3);
    expect(c2Data.realizedOrders).toBe(2);
    expect(c2Data.totalSpent).toBe(5200);
    expect(c2Data.averageOrderValue).toBe(2600);

    // Find Zero-Order Customer in list
    const zeroData = customerListRes.body.data.find((c) => c.id === zeroOrderCustomer._id.toString());
    expect(zeroData).toBeDefined();
    expect(zeroData.totalOrders).toBe(0);
    expect(zeroData.realizedOrders).toBe(0);
    expect(zeroData.totalSpent).toBe(0);
    expect(zeroData.averageOrderValue).toBe(0);

    // 6. Individual Customer Detail Endpoints (GET /api/customers/:id)
    const c1DetailRes = await request(app)
      .get(`/api/customers/${customer1._id}`)
      .set('Authorization', adminAuth);
    expect(c1DetailRes.status).toBe(200);
    expect(c1DetailRes.body.data.totalOrders).toBe(5);
    expect(c1DetailRes.body.data.realizedOrders).toBe(3);
    expect(c1DetailRes.body.data.totalSpent).toBe(7000);
    expect(c1DetailRes.body.data.averageOrderValue).toBe(2333.33);

    const zeroDetailRes = await request(app)
      .get(`/api/customers/${zeroOrderCustomer._id}`)
      .set('Authorization', adminAuth);
    expect(zeroDetailRes.status).toBe(200);
    expect(zeroDetailRes.body.data.totalOrders).toBe(0);
    expect(zeroDetailRes.body.data.realizedOrders).toBe(0);
    expect(zeroDetailRes.body.data.totalSpent).toBe(0);
    expect(zeroDetailRes.body.data.averageOrderValue).toBe(0);
    expect(zeroDetailRes.body.data.recentOrders).toEqual([]);
  });
});
