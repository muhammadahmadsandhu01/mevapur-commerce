'use strict';

const mongoose = require('mongoose');
const FinancialMetricsService = require('../../../services/order/FinancialMetricsService');
const ReturnMoneyAllocationService = require('../../../services/ReturnMoneyAllocationService');
const { paymentAvailabilityQuerySchema } = require('../../../validators/paymentValidator');
const { SUPPORTED_PAYMENT_CURRENCIES } = require('../../../constants/paymentConstants');
const RefundService = require('../../../services/payment/RefundService');
const paymentProviderRegistry = require('../../../modules/payments/core/providerRegistry');
const Order = require('../../../models/Order');
const Product = require('../../../models/Product');
const Payment = require('../../../models/Payment');
const Refund = require('../../../models/Refund');
const { CurrencyRegistry } = require('../../../modules/commerce');

describe('Phase 4C Defect Closures (DEF-28 through DEF-32)', () => {
  afterEach(async () => {
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
  });

  describe('DEF-28: Financial metrics partition revenue by currency under byCurrency and never combine different currencies', () => {
    it('groups revenue strictly by currency and isolates PKR and USD metrics', async () => {
      const baseShippingAddress = {
        fullName: 'Test Customer',
        phone: '+923001234567',
        address: 'Street 1',
        city: 'Lahore',
        province: 'Punjab',
        country: 'Pakistan'
      };

      const baseTimeline = (userId) => [{
        status: 'Delivered',
        actor: userId,
        actorRole: 'customer',
        timestamp: new Date()
      }];

      const user1 = new mongoose.Types.ObjectId();
      const user2 = new mongoose.Types.ObjectId();
      const user3 = new mongoose.Types.ObjectId();

      // Create 2 completed PKR orders: 1000 PKR each
      const pkrOrder1 = await Order.create({
        orderId: 'ORD-PKR-001',
        user: user1,
        idempotencyKey: 'idem-pkr-1',
        requestHash: 'hash-pkr-1',
        totalAmount: 1000,
        subtotal: 1000,
        paymentMethod: 'cod',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        statusTimeline: baseTimeline(user1),
        shippingAddress: baseShippingAddress,
        currency: 'PKR',
        payment: { provider: 'Cash on Delivery', currency: 'PKR', paidAt: new Date() },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item 1', quantity: 1, price: 1000, lineTotal: 1000 }]
      });

      const pkrOrder2 = await Order.create({
        orderId: 'ORD-PKR-002',
        user: user2,
        idempotencyKey: 'idem-pkr-2',
        requestHash: 'hash-pkr-2',
        totalAmount: 500,
        subtotal: 500,
        paymentMethod: 'cod',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        statusTimeline: baseTimeline(user2),
        shippingAddress: baseShippingAddress,
        currency: 'PKR',
        payment: { provider: 'Cash on Delivery', currency: 'PKR', paidAt: new Date() },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item 2', quantity: 1, price: 500, lineTotal: 500 }]
      });

      // Create 1 completed USD order: 50 USD
      const usdOrder = await Order.create({
        orderId: 'ORD-USD-001',
        user: user3,
        idempotencyKey: 'idem-usd-1',
        requestHash: 'hash-usd-1',
        totalAmount: 50,
        subtotal: 50,
        paymentMethod: 'stripe',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        statusTimeline: baseTimeline(user3),
        shippingAddress: baseShippingAddress,
        currency: 'USD',
        payment: { provider: 'Stripe', currency: 'USD', paidAt: new Date() },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'USD Item', quantity: 1, price: 50, lineTotal: 50 }]
      });

      // Add payments
      await Payment.create([
        {
          order: pkrOrder1._id,
          user: pkrOrder1.user,
          provider: 'cod',
          idempotencyKey: 'idem-pay-pkr-1',
          requestHash: 'hash-pay-pkr-1',
          providerIdempotencyKey: 'prov-idem-pkr-1',
          status: 'Completed',
          amount: 1000,
          paidAmount: 1000,
          currency: 'PKR',
          providerPaymentId: 'cod-1'
        },
        {
          order: pkrOrder2._id,
          user: pkrOrder2.user,
          provider: 'cod',
          idempotencyKey: 'idem-pay-pkr-2',
          requestHash: 'hash-pay-pkr-2',
          providerIdempotencyKey: 'prov-idem-pkr-2',
          status: 'Completed',
          amount: 500,
          paidAmount: 500,
          currency: 'PKR',
          providerPaymentId: 'cod-2'
        },
        {
          order: usdOrder._id,
          user: usdOrder.user,
          provider: 'stripe',
          idempotencyKey: 'idem-pay-usd-1',
          requestHash: 'hash-pay-usd-1',
          providerIdempotencyKey: 'prov-idem-usd-1',
          status: 'Completed',
          amount: 50,
          paidAmount: 50,
          currency: 'USD',
          providerPaymentId: 'pi_test_usd'
        }
      ]);

      const metrics = await FinancialMetricsService.aggregateRealizedRevenue();

      // Top-level preserves PKR for backward compatibility
      expect(metrics.realizedRevenue).toBe(1500);
      expect(metrics.grossCaptured).toBe(1500);

      // byCurrency dictionary exposes isolated accounting totals
      expect(metrics.byCurrency).toBeDefined();
      expect(metrics.byCurrency.PKR).toBeDefined();
      expect(metrics.byCurrency.PKR.realizedRevenue).toBe(1500);
      expect(metrics.byCurrency.PKR.orderCount).toBe(2);

      expect(metrics.byCurrency.USD).toBeDefined();
      expect(metrics.byCurrency.USD.realizedRevenue).toBe(50);
      expect(metrics.byCurrency.USD.orderCount).toBe(1);

      // Proves 1500 PKR was NEVER summed with 50 USD into 1550
      expect(metrics.byCurrency.PKR.realizedRevenue).not.toBe(1550);
      expect(metrics.byCurrency.USD.realizedRevenue).not.toBe(1550);
    });

    it('partitions getSalesReport, getProductStats, getCustomerStats, and getCustomerFinancialSummary across multiple currencies', async () => {
      const baseShippingAddress = {
        fullName: 'Global Customer',
        phone: '+923001234567',
        address: 'Street 1',
        city: 'Lahore',
        province: 'Punjab',
        country: 'Pakistan'
      };

      const User = require('../../../models/User');
      const uDoc1 = await User.create({
        fullName: 'Customer One',
        email: `c1-${Date.now()}@example.com`,
        password: 'Password123!',
        phone: '+923001111111',
        role: 'customer'
      });
      const uDoc2 = await User.create({
        fullName: 'Customer Two',
        email: `c2-${Date.now()}@example.com`,
        password: 'Password123!',
        phone: '+923002222222',
        role: 'customer'
      });
      const user1 = uDoc1._id;
      const user2 = uDoc2._id;
      const catId = new mongoose.Types.ObjectId();

      const Category = require('../../../models/Category');
      await Category.create({ _id: catId, name: 'Premium Nuts', slug: 'premium-nuts', isActive: true });

      const prod1 = await Product.create({
        name: 'Pistachios',
        slug: 'pistachios',
        category: catId,
        price: 2000,
        stock: 50,
        status: 'published',
        isActive: true
      });

      const prod2 = await Product.create({
        name: 'Almonds USD',
        slug: 'almonds-usd',
        category: catId,
        price: 30,
        stock: 50,
        status: 'published',
        isActive: true
      });

      const baseTimeline = (userId) => [{
        status: 'Delivered',
        actor: userId,
        actorRole: 'customer',
        timestamp: new Date()
      }];

      // PKR Order: 2000 PKR
      await Order.create({
        orderId: 'ORD-PKR-REP',
        user: user1,
        idempotencyKey: 'idem-pkr-rep',
        requestHash: 'hash-pkr-rep',
        totalAmount: 2000,
        subtotal: 2000,
        paymentMethod: 'cod',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        currency: 'PKR',
        statusTimeline: baseTimeline(user1),
        payment: { provider: 'Cash on Delivery', currency: 'PKR', paidAt: new Date() },
        items: [{ product: prod1._id, name: 'Pistachios', quantity: 1, price: 2000, lineTotal: 2000 }],
        shippingAddress: baseShippingAddress
      });

      // USD Order: 60 USD
      await Order.create({
        orderId: 'ORD-USD-REP',
        user: user2,
        idempotencyKey: 'idem-usd-rep',
        requestHash: 'hash-usd-rep',
        totalAmount: 60,
        subtotal: 60,
        paymentMethod: 'stripe',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        currency: 'USD',
        statusTimeline: baseTimeline(user2),
        payment: { provider: 'Stripe', currency: 'USD', paidAt: new Date() },
        items: [{ product: prod2._id, name: 'Almonds USD', quantity: 2, price: 30, lineTotal: 60 }],
        shippingAddress: baseShippingAddress
      });

      // 1. Sales Report
      const salesReport = await FinancialMetricsService.getSalesReport();
      expect(salesReport.byCurrency).toBeDefined();
      expect(salesReport.byCurrency.PKR.realizedRevenue).toBe(2000);
      expect(salesReport.byCurrency.USD.realizedRevenue).toBe(60);
      expect(salesReport.chartDataByCurrency.PKR).toBeDefined();
      expect(salesReport.chartDataByCurrency.USD).toBeDefined();
      expect(salesReport.paymentMethodsByCurrency.PKR).toBeDefined();
      expect(salesReport.paymentMethodsByCurrency.USD).toBeDefined();

      // 2. Product Stats
      const productStats = await FinancialMetricsService.getProductStats();
      expect(productStats.categoryStatsByCurrency).toBeDefined();
      expect(productStats.categoryStatsByCurrency.PKR).toBeDefined();
      expect(productStats.categoryStatsByCurrency.PKR[0].totalRevenue).toBe(2000);
      expect(productStats.categoryStatsByCurrency.USD).toBeDefined();
      expect(productStats.categoryStatsByCurrency.USD[0].totalRevenue).toBe(60);

      // 3. Customer Stats
      const customerStats = await FinancialMetricsService.getCustomerStats();
      expect(customerStats.topSpendersByCurrency).toBeDefined();
      expect(customerStats.topSpendersByCurrency.PKR).toBeDefined();
      expect(customerStats.topSpendersByCurrency.PKR[0].totalSpent).toBe(2000);
      expect(customerStats.topSpendersByCurrency.USD).toBeDefined();
      expect(customerStats.topSpendersByCurrency.USD[0].totalSpent).toBe(60);

      // 4. Customer Financial Summary
      const summaryMap = await FinancialMetricsService.getCustomerFinancialSummary([user1, user2]);
      const u1Summary = summaryMap.get(user1.toString());
      const u2Summary = summaryMap.get(user2.toString());
      expect(u1Summary.byCurrency.PKR.totalSpent).toBe(2000);
      expect(u2Summary.byCurrency.USD.totalSpent).toBe(60);
    });
  });

  describe('DEF-29: Return allocation does not assume two-decimal currencies', () => {
    it('allocates return merchandise correctly for 0-decimal currency (JPY)', () => {
      const jpyOrder = {
        currency: 'JPY',
        subtotal: 10000, // 10,000 JPY
        discount: 1000,  // 1,000 JPY
        totalAmount: 9000,
        items: [
          { product: 'P1', quantity: 2, price: 3000, lineTotal: 6000 },
          { product: 'P2', quantity: 1, price: 4000, lineTotal: 4000 }
        ]
      };

      const allocation = ReturnMoneyAllocationService.allocateOrderMerchandise(jpyOrder);

      expect(allocation.grossMinor).toBe(10000);
      expect(allocation.discountMinor).toBe(1000);
      expect(allocation.allocatableMinor).toBe(9000);

      // Verify line allocation sums to 9000 JPY
      const totalRefundable = allocation.lines.reduce((s, l) => s + l.refundableMinor, 0);
      expect(totalRefundable).toBe(9000);

      // Line 1 (60% weight): 9000 * 0.6 = 5400
      expect(allocation.lines[0].refundableMinor).toBe(5400);
      // Line 2 (40% weight): 9000 * 0.4 = 3600
      expect(allocation.lines[1].refundableMinor).toBe(3600);
    });

    it('allocates return merchandise correctly for 3-decimal currency (KWD)', () => {
      const kwdOrder = {
        currency: 'KWD',
        subtotal: 15.500, // 15.500 KWD = 15500 fils
        discount: 1.500,  // 1.500 KWD = 1500 fils
        totalAmount: 14.000,
        items: [
          { product: 'P1', quantity: 1, price: 10.000, lineTotal: 10.000 },
          { product: 'P2', quantity: 1, price: 5.500, lineTotal: 5.500 }
        ]
      };

      const allocation = ReturnMoneyAllocationService.allocateOrderMerchandise(kwdOrder);

      expect(allocation.grossMinor).toBe(15500);
      expect(allocation.discountMinor).toBe(1500);
      expect(allocation.allocatableMinor).toBe(14000);

      const totalRefundable = allocation.lines.reduce((s, l) => s + l.refundableMinor, 0);
      expect(totalRefundable).toBe(14000);
    });
  });

const {
  paymentAvailabilityQuerySchema,
  createRefundSchema,
  createPaymentSchema
} = require('../../../validators/paymentValidator');
const {
  VALID_COMMERCE_CURRENCIES,
  PROVIDER_SUPPORTED_CURRENCIES,
  SUPPORTED_PAYMENT_CURRENCIES
} = require('../../../constants/paymentConstants');
const PaymentService = require('../../../services/payment/PaymentService');
const MarketService = require('../../../services/MarketService');

  describe('DEF-30: All active payment validators accept commercial currencies beyond PKR and allow optional currency', () => {
    it('accepts valid active commercial currencies (USD, EUR, GBP, AED, SAR) in payment availability schema', () => {
      const parseUsd = paymentAvailabilityQuerySchema.safeParse({ currency: 'USD' });
      expect(parseUsd.success).toBe(true);
      expect(parseUsd.data.currency).toBe('USD');

      const parseEur = paymentAvailabilityQuerySchema.safeParse({ currency: 'EUR' });
      expect(parseEur.success).toBe(true);
      expect(parseEur.data.currency).toBe('EUR');

      const parseAed = paymentAvailabilityQuerySchema.safeParse({ currency: 'aed' });
      expect(parseAed.success).toBe(true);
      expect(parseAed.data.currency).toBe('AED');
    });

    it('allows currency to be omitted so MarketService can resolve authoritative market base currency', () => {
      const parseOmitted = paymentAvailabilityQuerySchema.safeParse({});
      expect(parseOmitted.success).toBe(true);
      expect(parseOmitted.data.currency).toBeUndefined();
    });

    it('rejects invalid or non-commercial currencies (XYZ, XAU, BGN)', () => {
      const parseInvalid = paymentAvailabilityQuerySchema.safeParse({ currency: 'XYZ' });
      expect(parseInvalid.success).toBe(false);

      const parseMetal = paymentAvailabilityQuerySchema.safeParse({ currency: 'XAU' });
      expect(parseMetal.success).toBe(false);

      const parseDeprecated = paymentAvailabilityQuerySchema.safeParse({ currency: 'BGN' });
      expect(parseDeprecated.success).toBe(false);
    });

    it('validates refund and payment creation schemas with exact domain amount bounds', () => {
      const validRefund = createRefundSchema.safeParse({ amount: 150.50, reason: 'Customer return' });
      expect(validRefund.success).toBe(true);

      const negativeRefund = createRefundSchema.safeParse({ amount: -10 });
      expect(negativeRefund.success).toBe(false);

      const excessiveRefund = createRefundSchema.safeParse({ amount: 100000001 }); // > 100M
      expect(excessiveRefund.success).toBe(false);
    });
  });

  describe('DEF-31: CurrencyRegistry validity is separated from MarketConfig and provider capabilities', () => {
    it('distinguishes VALID_COMMERCE_CURRENCIES from provider-specific capabilities', () => {
      expect(Array.isArray(VALID_COMMERCE_CURRENCIES)).toBe(true);
      expect(VALID_COMMERCE_CURRENCIES.length).toBeGreaterThan(100);

      expect(VALID_COMMERCE_CURRENCIES).toContain('PKR');
      expect(VALID_COMMERCE_CURRENCIES).toContain('USD');
      expect(VALID_COMMERCE_CURRENCIES).toContain('EUR');
      expect(VALID_COMMERCE_CURRENCIES).toContain('GBP');
      expect(VALID_COMMERCE_CURRENCIES).toContain('AED');
      expect(VALID_COMMERCE_CURRENCIES).toContain('JPY');

      // Excludes deprecated / non-commercial
      expect(VALID_COMMERCE_CURRENCIES).not.toContain('BGN');
      expect(VALID_COMMERCE_CURRENCIES).not.toContain('XAU');
      expect(VALID_COMMERCE_CURRENCIES).not.toContain('XYZ');

      // Provider-specific capabilities
      expect(PROVIDER_SUPPORTED_CURRENCIES.cod).toEqual(['PKR']);
      expect(PROVIDER_SUPPORTED_CURRENCIES.bank_transfer).toEqual(['PKR']);
      expect(PROVIDER_SUPPORTED_CURRENCIES.raast).toEqual(['PKR']);
    });

    it('resolves market-aware currency when currency is omitted (legacy PK -> PKR, UAE -> AED, UK -> GBP)', async () => {
      // 1. Default PK Market
      const defaultMethods = await PaymentService.getAvailableMethods();
      expect(defaultMethods.currency).toBe('PKR');

      // 2. UAE Market configured
      const config = await MarketService.getConfig();
      config.baseCurrency = 'AED';
      config.defaultCurrency = 'AED';
      config.enabledCurrencies = ['PKR', 'AED'];
      config.merchantCountry = 'AE';
      config.homeCountry = 'AE';
      await config.save();

      const uaeMethods = await PaymentService.getAvailableMethods();
      expect(uaeMethods.currency).toBe('AED');

      // 3. UK Market configured
      config.baseCurrency = 'GBP';
      config.defaultCurrency = 'GBP';
      config.enabledCurrencies = ['PKR', 'GBP'];
      config.merchantCountry = 'GB';
      config.homeCountry = 'GB';
      await config.save();

      const ukMethods = await PaymentService.getAvailableMethods();
      expect(ukMethods.currency).toBe('GBP');

      // 4. Reset back to PK
      config.baseCurrency = 'PKR';
      config.defaultCurrency = 'PKR';
      config.enabledCurrencies = ['PKR'];
      config.merchantCountry = 'PK';
      config.homeCountry = 'PK';
      await config.save();
    });

    it('rejects market-disabled currency during availability check', async () => {
      await expect(PaymentService.getAvailableMethods({ currency: 'JPY' }))
        .rejects
        .toThrow(/Currency 'JPY' is not enabled for this market/);
    });

    it('proves that offline/COD rejects non-PKR currencies while PKR remains active', async () => {
      const codAvailabilityPkr = await PaymentService.getAvailableMethods({ country: 'Pakistan', currency: 'PKR' });
      expect(codAvailabilityPkr.methods.some((m) => m.code === 'cod')).toBe(true);

      const config = await MarketService.getConfig();
      config.enabledCurrencies.push('USD');
      await config.save();

      const codAvailabilityUsd = await PaymentService.getAvailableMethods({ country: 'Pakistan', currency: 'USD' });
      // COD is not eligible for USD
      expect(codAvailabilityUsd.methods.some((m) => m.code === 'cod')).toBe(false);

      config.enabledCurrencies = ['PKR'];
      await config.save();
    });

    it('proves that unconfigured/dormant providers (Stripe) remain unavailable for checkout', async () => {
      const config = await MarketService.getConfig();
      config.enabledCurrencies.push('USD');
      config.enabledCountries.push('US');
      await config.save();

      const available = await PaymentService.getAvailableMethods({ country: 'United States', currency: 'USD' });
      // Stripe is dormant/unconfigured, so no automated provider is exposed as active
      expect(available.methods.some((m) => m.code === 'stripe')).toBe(false);

      config.enabledCurrencies = ['PKR'];
      config.enabledCountries = ['PK'];
      await config.save();
    });
  });

  describe('DEF-32: Refund currency resolution without blind PKR fallback', () => {
    it('passes payment actual currency (USD, EUR, AED, GBP) to paymentProviderRegistry.resolve', () => {
      const mockProvider = {
        getCapabilities: () => ({ refund: true })
      };
      const resolveSpy = jest.spyOn(paymentProviderRegistry, 'resolve').mockReturnValue(mockProvider);

      RefundService.getProvider('stripe', 'USD');
      expect(resolveSpy).toHaveBeenCalledWith('stripe', { currency: 'USD' });

      RefundService.getProvider('stripe', 'EUR');
      expect(resolveSpy).toHaveBeenCalledWith('stripe', { currency: 'EUR' });

      RefundService.getProvider('stripe', 'AED');
      expect(resolveSpy).toHaveBeenCalledWith('stripe', { currency: 'AED' });

      RefundService.getProvider('stripe', 'GBP');
      expect(resolveSpy).toHaveBeenCalledWith('stripe', { currency: 'GBP' });

      resolveSpy.mockRestore();
    });

    it('authoritatively resolves currency for valid stored payment currency', async () => {
      const payment = { currency: 'USD' };
      const resolved = await RefundService.resolveAuthoritativeCurrency(payment);
      expect(resolved).toBe('USD');
    });

    it('fails closed when payment and order currencies conflict', async () => {
      const payment = { currency: 'USD', order: new mongoose.Types.ObjectId() };
      const order = { currency: 'EUR' };

      await expect(RefundService.resolveAuthoritativeCurrency(payment, order))
        .rejects
        .toThrow(/Payment currency \(USD\) does not match order currency \(EUR\)/);
    });

    it('resolves legacy PKR only when verified by legacy proof', async () => {
      const payment = { currency: null };
      const legacyOrder = {
        currency: 'PKR',
        shippingAddress: { country: 'Pakistan', countryCode: 'PK' },
        paymentMethod: 'cod'
      };

      const resolved = await RefundService.resolveAuthoritativeCurrency(payment, legacyOrder);
      expect(resolved).toBe('PKR');
    });

    it('fails closed when currency is missing without legacy proof', async () => {
      const payment = { currency: null, order: null };

      await expect(RefundService.resolveAuthoritativeCurrency(payment, null))
        .rejects
        .toThrow(/Unable to authoritatively resolve payment currency for refund/);
    });
  });
});
