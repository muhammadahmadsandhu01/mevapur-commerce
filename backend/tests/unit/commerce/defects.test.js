'use strict';

const mongoose = require('mongoose');
const FinancialMetricsService = require('../../../services/order/FinancialMetricsService');
const ReturnMoneyAllocationService = require('../../../services/ReturnMoneyAllocationService');
const { paymentAvailabilityQuerySchema } = require('../../../validators/paymentValidator');
const { SUPPORTED_PAYMENT_CURRENCIES } = require('../../../constants/paymentConstants');
const RefundService = require('../../../services/payment/RefundService');
const paymentProviderRegistry = require('../../../modules/payments/core/providerRegistry');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const Refund = require('../../../models/Refund');
const { CurrencyRegistry } = require('../../../modules/commerce');

describe('Phase 4C Defect Closures (DEF-28 through DEF-32)', () => {
  afterEach(async () => {
    await Order.deleteMany({});
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

  describe('DEF-30: Payment request validation accepts commercial currencies beyond PKR', () => {
    it('accepts valid active commercial currencies (USD, EUR, GBP, AED, SAR)', () => {
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

    it('defaults to PKR when currency is omitted', () => {
      const parseDefault = paymentAvailabilityQuerySchema.safeParse({});
      expect(parseDefault.success).toBe(true);
      expect(parseDefault.data.currency).toBe('PKR');
    });

    it('rejects invalid or non-commercial currencies (XYZ, XAU, BGN)', () => {
      const parseInvalid = paymentAvailabilityQuerySchema.safeParse({ currency: 'XYZ' });
      expect(parseInvalid.success).toBe(false);

      const parseMetal = paymentAvailabilityQuerySchema.safeParse({ currency: 'XAU' });
      expect(parseMetal.success).toBe(false);

      const parseDeprecated = paymentAvailabilityQuerySchema.safeParse({ currency: 'BGN' });
      expect(parseDeprecated.success).toBe(false);
    });
  });

  describe('DEF-31: paymentConstants exports verified active commercial registry currencies', () => {
    it('includes active commercial currencies and excludes non-commercial / deprecated', () => {
      expect(Array.isArray(SUPPORTED_PAYMENT_CURRENCIES)).toBe(true);
      expect(SUPPORTED_PAYMENT_CURRENCIES.length).toBeGreaterThan(100);

      expect(SUPPORTED_PAYMENT_CURRENCIES).toContain('PKR');
      expect(SUPPORTED_PAYMENT_CURRENCIES).toContain('USD');
      expect(SUPPORTED_PAYMENT_CURRENCIES).toContain('EUR');
      expect(SUPPORTED_PAYMENT_CURRENCIES).toContain('GBP');
      expect(SUPPORTED_PAYMENT_CURRENCIES).toContain('AED');
      expect(SUPPORTED_PAYMENT_CURRENCIES).toContain('JPY');

      // Excludes deprecated / non-commercial
      expect(SUPPORTED_PAYMENT_CURRENCIES).not.toContain('BGN');
      expect(SUPPORTED_PAYMENT_CURRENCIES).not.toContain('XAU');
      expect(SUPPORTED_PAYMENT_CURRENCIES).not.toContain('XYZ');
    });
  });

  describe('DEF-32: Refund provider resolution receives payment actual currency', () => {
    it('passes payment actual currency to paymentProviderRegistry.resolve', () => {
      const mockProvider = {
        getCapabilities: () => ({ refund: true })
      };
      const resolveSpy = jest.spyOn(paymentProviderRegistry, 'resolve').mockReturnValue(mockProvider);

      RefundService.getProvider('stripe', 'USD');

      expect(resolveSpy).toHaveBeenCalledWith('stripe', {
        currency: 'USD'
      });

      RefundService.getProvider('stripe', 'EUR');
      expect(resolveSpy).toHaveBeenCalledWith('stripe', {
        currency: 'EUR'
      });

      resolveSpy.mockRestore();
    });
  });
});
