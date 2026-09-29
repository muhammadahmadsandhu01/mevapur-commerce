const crypto = require('crypto');
const FinancialMetricsService = require('../../../services/order/FinancialMetricsService');
const Order = require('../../../models/Order');
const Product = require('../../../models/Product');
const Payment = require('../../../models/Payment');
const Refund = require('../../../models/Refund');
const User = require('../../../models/User');
const { ORDER_STATUSES } = require('../../../constants/orderConstants');
const { PAYMENT_STATUSES, REFUND_STATUSES } = require('../../../constants/paymentConstants');

describe('FinancialMetricsService Unit Tests', () => {
  describe('roundMoney', () => {
    it('accurately rounds to 2 decimal places using deterministic half-up rounding', () => {
      expect(FinancialMetricsService.roundMoney(10.555)).toBe(10.56);
      expect(FinancialMetricsService.roundMoney(10.554)).toBe(10.55);
      expect(FinancialMetricsService.roundMoney(100)).toBe(100);
      expect(FinancialMetricsService.roundMoney(0)).toBe(0);
      expect(FinancialMetricsService.roundMoney(null)).toBe(0);
      expect(FinancialMetricsService.roundMoney(undefined)).toBe(0);
      expect(FinancialMetricsService.roundMoney(NaN)).toBe(0);
      expect(FinancialMetricsService.roundMoney('invalid')).toBe(0);
    });

    it('avoids floating point subtraction artifacts', () => {
      const floatDiff = 0.3 - 0.2; // 0.09999999999999998 in standard JS IEEE 754
      expect(FinancialMetricsService.roundMoney(floatDiff)).toBe(0.1);
    });
  });

  describe('parseDateRange', () => {
    it('creates deterministic half-open interval [start, endExclusive) for YYYY-MM-DD dates', () => {
      const { start, end } = FinancialMetricsService.parseDateRange('2026-01-01', '2026-01-31');
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(0); // Jan
      expect(start.getDate()).toBe(1);

      // End must be advanced to next day at 00:00:00 for half-open interval
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(1); // Feb
      expect(end.getDate()).toBe(1);
      expect(end.getHours()).toBe(0);
      expect(end.getMinutes()).toBe(0);
    });

    it('defaults to 30 days interval when dates are omitted', () => {
      const { start, end } = FinancialMetricsService.parseDateRange(null, null, 30);
      expect(start instanceof Date).toBe(true);
      expect(end instanceof Date).toBe(true);
      expect(end.getTime() - start.getTime()).toBeGreaterThanOrEqual(29 * 24 * 60 * 60 * 1000);
    });
  });

  describe('computeGrowthRate', () => {
    it('calculates positive increase and negative change correctly', () => {
      expect(FinancialMetricsService.computeGrowthRate(150, 100)).toBe(50.0);
      expect(FinancialMetricsService.computeGrowthRate(80, 100)).toBe(-20.0);
      expect(FinancialMetricsService.computeGrowthRate(100, 100)).toBe(0.0);
    });

    it('returns -100.0% when activity drops from positive baseline to zero', () => {
      expect(FinancialMetricsService.computeGrowthRate(0, 100)).toBe(-100.0);
    });

    it('returns null for undefined growth when previous baseline is zero or negative', () => {
      expect(FinancialMetricsService.computeGrowthRate(500, 0)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(0, 0)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(500, -10)).toBeNull();
    });

    it('returns null for non-numeric or invalid inputs', () => {
      expect(FinancialMetricsService.computeGrowthRate(null, 100)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(100, null)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(undefined, undefined)).toBeNull();
    });
  });

  describe('date interval helpers', () => {
    it('getTodayInterval returns today 00:00 to tomorrow 00:00', () => {
      const { start, end } = FinancialMetricsService.getTodayInterval();
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('getThisMonthInterval and getLastMonthInterval are non-overlapping adjacent periods', () => {
      const thisMonth = FinancialMetricsService.getThisMonthInterval();
      const lastMonth = FinancialMetricsService.getLastMonthInterval();

      expect(lastMonth.end.getTime()).toBe(thisMonth.start.getTime());
      expect(lastMonth.start.getTime()).toBeLessThan(lastMonth.end.getTime());
      expect(thisMonth.start.getTime()).toBeLessThan(thisMonth.end.getTime());
    });
  });

  describe('Batch 2: Server-Side COGS Aggregation & Financial Reporting Fixes', () => {
    let testUser;
    let productWithCost;
    let productUncosted;

    const createOrder = async ({
      orderStatus = ORDER_STATUSES.DELIVERED,
      paymentStatus = 'Paid',
      paymentMethod = 'stripe',
      items = [],
      totalAmount = 1000,
      createdAt = new Date()
    } = {}) => {
      const order = await Order.create({
        orderId: `HZ-TEST-${crypto.randomUUID().slice(0, 8)}`,
        user: testUser._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        orderStatus,
        paymentStatus,
        paymentMethod,
        subtotal: totalAmount,
        totalAmount,
        shippingCost: 0,
        createdAt,
        items,
        shippingAddress: {
          fullName: 'Test Customer',
          phone: '03001234567',
          address: '123 Main Street',
          city: 'Lahore',
          country: 'Pakistan'
        },
        statusTimeline: [{
          status: orderStatus,
          actor: testUser._id,
          actorRole: 'system',
          timestamp: createdAt,
          note: 'Test order creation'
        }]
      });

      if (paymentStatus === 'Paid' || paymentStatus === 'PartiallyRefunded') {
        await Payment.create({
          order: order._id,
          user: testUser._id,
          provider: paymentMethod === 'cod' ? 'Cash on Delivery' : 'stripe',
          providerPaymentId: `pi_test_${crypto.randomUUID()}`,
          amount: totalAmount,
          currency: 'PKR',
          status: PAYMENT_STATUSES.COMPLETED,
          idempotencyKey: crypto.randomUUID(),
          requestHash: crypto.randomBytes(32).toString('hex'),
          providerIdempotencyKey: crypto.randomUUID(),
          createdAt
        });
      }

      return order;
    };

    beforeEach(async () => {
      await Order.deleteMany({});
      await Product.deleteMany({});
      await Payment.deleteMany({});
      await Refund.deleteMany({});
      await User.deleteMany({});

      testUser = await User.create({
        fullName: 'Test Auditor',
        email: `auditor_${crypto.randomUUID().slice(0, 8)}@mevapur.test`,
        password: 'Password123!',
        role: 'admin',
        isVerified: true
      });

      productWithCost = await Product.create({
        name: 'Organic Walnuts',
        slug: `walnuts-${crypto.randomUUID().slice(0, 8)}`,
        price: 1000,
        costPrice: 400,
        stock: 50
      });

      productUncosted = await Product.create({
        name: 'Heritage Apricots',
        slug: `apricots-${crypto.randomUUID().slice(0, 8)}`,
        price: 500,
        costPrice: 0,
        stock: 30
      });
    });

    it('calculates COGS accurately using server-side aggregation for paid orders', async () => {
      await createOrder({
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 2,
          lineTotal: 2000
        }],
        totalAmount: 2000
      });

      const result = await FinancialMetricsService.aggregateCogs();
      // 2 units * 400 costPrice = 800 COGS
      expect(result.cogs).toBe(800);
      expect(result.uncostedItemsCount).toBe(0);
    });

    it('honors order item snapshot costPrice over product.costPrice', async () => {
      await createOrder({
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          costPrice: 350,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000
      });

      const result = await FinancialMetricsService.aggregateCogs();
      expect(result.cogs).toBe(350);
      expect(result.uncostedItemsCount).toBe(0);
    });

    it('treats missing/zero costPrice as 0 COGS without synthetic heuristic fallback and flags uncostedItemsCount', async () => {
      await createOrder({
        items: [{
          product: productUncosted._id,
          name: productUncosted.name,
          price: 500,
          quantity: 2,
          lineTotal: 1000
        }],
        totalAmount: 1000
      });

      const result = await FinancialMetricsService.aggregateCogs();
      // Arbitrary heuristic (price * 0.6 = 300 * 2 = 600) MUST NOT be applied.
      expect(result.cogs).toBe(0);
      expect(result.uncostedItemsCount).toBe(1);
    });

    it('excludes 100% refunded orders from COGS so returned inventory does not penalize profit', async () => {
      // Order 1: Marked Refunded
      await createOrder({
        paymentStatus: 'Refunded',
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 2,
          lineTotal: 2000
        }],
        totalAmount: 2000
      });

      // Order 2: Marked Paid but has 100% completed refund records
      const fullRefundOrder = await createOrder({
        paymentStatus: 'Paid',
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000
      });

      const payment = await Payment.findOne({ order: fullRefundOrder._id });
      await Refund.create({
        order: fullRefundOrder._id,
        payment: payment._id,
        customer: testUser._id,
        processedBy: testUser._id,
        provider: 'stripe',
        amount: 1000,
        currency: 'PKR',
        status: REFUND_STATUSES.COMPLETED,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: crypto.randomUUID()
      });

      const result = await FinancialMetricsService.aggregateCogs();
      // Both orders are 100% refunded and must contribute 0 to COGS
      expect(result.cogs).toBe(0);
      expect(result.uncostedItemsCount).toBe(0);
    });

    it('adjusts COGS proportionally for partially refunded orders', async () => {
      const order = await createOrder({
        paymentStatus: 'PartiallyRefunded',
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 2, // Total base cost = 2 * 400 = 800
          lineTotal: 2000
        }],
        totalAmount: 2000
      });

      const payment = await Payment.findOne({ order: order._id });
      // 500 refunded out of 2000 => 25% refund, retained ratio = 1500 / 2000 = 0.75
      await Refund.create({
        order: order._id,
        payment: payment._id,
        customer: testUser._id,
        processedBy: testUser._id,
        provider: 'stripe',
        amount: 500,
        currency: 'PKR',
        status: REFUND_STATUSES.COMPLETED,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: crypto.randomUUID()
      });

      const result = await FinancialMetricsService.aggregateCogs();
      // Expected adjusted COGS: 800 * 0.75 = 600
      expect(result.cogs).toBe(600);
      expect(result.uncostedItemsCount).toBe(0);
    });

    it('ignores cancelled orders and pending unpaid orders', async () => {
      // Cancelled order (even if previously paid)
      await createOrder({
        orderStatus: ORDER_STATUSES.CANCELLED,
        paymentStatus: 'Paid',
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000
      });

      // Pending unpaid order
      await createOrder({
        orderStatus: ORDER_STATUSES.PENDING,
        paymentStatus: 'Pending',
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000
      });

      const result = await FinancialMetricsService.aggregateCogs();
      expect(result.cogs).toBe(0);
      expect(result.uncostedItemsCount).toBe(0);
    });

    it('returns zero COGS and zero uncostedItemsCount when database has no matching orders', async () => {
      const result = await FinancialMetricsService.aggregateCogs();
      expect(result.cogs).toBe(0);
      expect(result.uncostedItemsCount).toBe(0);
    });

    it('filters COGS aggregation within dateRange interval', async () => {
      const now = new Date();
      const pastDate = new Date(now.getFullYear(), now.getMonth() - 2, 15);
      const currentDate = new Date(now.getFullYear(), now.getMonth(), 10);

      // Past order
      await createOrder({
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000,
        createdAt: pastDate
      });

      // Current order
      await createOrder({
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000,
        createdAt: currentDate
      });

      const thisMonthInterval = FinancialMetricsService.getThisMonthInterval();
      const result = await FinancialMetricsService.aggregateCogs(thisMonthInterval);
      // Only the current order in thisMonth is counted
      expect(result.cogs).toBe(400);
      expect(result.uncostedItemsCount).toBe(0);
    });

    it('integrates cleanly into getDashboardStats() with zero in-memory heap loading', async () => {
      // 1. Paid order with cost
      await createOrder({
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 2,
          lineTotal: 2000
        }],
        totalAmount: 2000
      });

      // 2. Paid order with uncosted product
      await createOrder({
        items: [{
          product: productUncosted._id,
          name: productUncosted.name,
          price: 500,
          quantity: 1,
          lineTotal: 500
        }],
        totalAmount: 500
      });

      // 3. Pending COD order
      await createOrder({
        orderStatus: ORDER_STATUSES.PROCESSING,
        paymentStatus: 'Pending',
        paymentMethod: 'cod',
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000
      });

      const stats = await FinancialMetricsService.getDashboardStats();

      // Total realized: 2000 + 500 = 2500
      expect(stats.totalRevenue).toBe(2500);
      // COGS: (2 * 400) + 0 = 800
      expect(stats.cogs).toBe(800);
      // Net Profit: 2500 - 800 = 1700
      expect(stats.netProfit).toBe(1700);
      // Profit Margin: (1700 / 2500) * 100 = 68%
      expect(stats.profitMargin).toBe(68);
      // Uncosted items count: 1 (productUncosted)
      expect(stats.uncostedItemsCount).toBe(1);
      // Uncollected COD: 1000
      expect(stats.uncollectedCod).toBe(1000);
    });

    it('integrates into getAnalytics() providing cogs and uncostedItemsCount across monthly periods', async () => {
      const now = new Date();
      const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 5);

      await createOrder({
        items: [{
          product: productWithCost._id,
          name: productWithCost.name,
          price: 1000,
          quantity: 1,
          lineTotal: 1000
        }],
        totalAmount: 1000,
        createdAt: thisMonthDate
      });

      const analytics = await FinancialMetricsService.getAnalytics();
      expect(analytics.thisMonth.revenue).toBe(1000);
      expect(analytics.thisMonth.cogs).toBe(400);
      expect(analytics.thisMonth.uncostedItemsCount).toBe(0);
      expect(typeof analytics.lastMonth.cogs).toBe('number');
      expect(typeof analytics.lastMonth.uncostedItemsCount).toBe('number');
    });
  });
});
