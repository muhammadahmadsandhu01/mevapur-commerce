/**
 * @file order-currency-provenance.integration.test.js
 * @description Real Persisted-Record Integration Tests for Order & Payment Currency Provenance.
 */

'use strict';

const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Session = require('../../models/Session');
const TokenService = require('../../services/TokenService');
const PaymentService = require('../../services/payment/PaymentService');
const RefundService = require('../../services/payment/RefundService');
const { MoneyMapper, RolloutAuthority, OrderCurrencyResolver } = require('../../modules/commerce');

let sequence = 0;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `provenance-test-${sequence}@example.com`,
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
  const accessToken = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  });
  return {
    user,
    authorization: `Bearer ${accessToken}`
  };
};

describe('Phase 5A: Persisted Legacy Provenance & Shared Resolver Integration', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Payment.syncIndexes()
    ]);
  });

  describe('1. Real Persisted Order Provenance & Hydration', () => {
    test('1. Historical order with persisted payment.currency PKR survives hydration and resolves to PKR', async () => {
      const auth = await createAuth('customer');
      const order = await Order.create({
        user: auth.user._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Historical Basmati Rice',
          sku: `HIST-${++sequence}`,
          price: 500,
          quantity: 1,
          lineTotal: 500
        }],
        shippingAddress: {
          fullName: 'Historical Customer',
          phone: '03001234567',
          address: '12 Old Mall Road',
          city: 'Lahore',
          province: 'Punjab',
          country: 'Pakistan'
        },
        paymentMethod: 'cod',
        payment: {
          provider: 'Cash on Delivery',
          currency: 'PKR'
        },
        subtotal: 500,
        totalAmount: 500,
        statusTimeline: [{
          status: 'Pending',
          actor: auth.user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      // Reload through actual Mongoose Order query used by PaymentService
      const reloadedOrder = await Order.findById(order._id);
      expect(reloadedOrder.payment.currency).toBe('PKR');

      const paymentResolved = PaymentService.resolveAuthoritativeOrderCurrency(reloadedOrder);
      expect(paymentResolved).toBe('PKR');

      // Create linked payment and prove RefundService resolves identical currency
      const payment = await Payment.create({
        order: reloadedOrder._id,
        user: auth.user._id,
        provider: 'cod',
        amount: 500,
        currency: 'PKR',
        idempotencyKey: crypto.randomUUID(),
        providerIdempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex')
      });

      const refundResolved = await RefundService.resolveAuthoritativeCurrency(payment, reloadedOrder);
      expect(refundResolved).toBe('PKR');
      expect(refundResolved).toBe(paymentResolved);
    });

    test('2. Migrated exact-money Order survives hydration and resolves exact currency', async () => {
      const auth = await createAuth('customer');
      const order = await Order.create({
        user: auth.user._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Migrated Exact Product',
          sku: `EXACT-${++sequence}`,
          price: 750,
          unitPriceExact: MoneyMapper.fromLegacy(750, 'PKR'),
          quantity: 1,
          lineTotal: 750,
          lineTotalExact: MoneyMapper.fromLegacy(750, 'PKR')
        }],
        shippingAddress: {
          fullName: 'Exact Customer',
          phone: '03007654321',
          address: '45 Exact Way',
          city: 'Karachi',
          province: 'Sindh',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        paymentMethod: 'bank_transfer',
        payment: {
          provider: 'Bank Transfer',
          currency: 'PKR'
        },
        subtotal: 750,
        subtotalExact: MoneyMapper.fromLegacy(750, 'PKR'),
        totalAmount: 750,
        totalAmountExact: MoneyMapper.fromLegacy(750, 'PKR'),
        statusTimeline: [{
          status: 'Pending',
          actor: auth.user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const reloadedOrder = await Order.findById(order._id);
      expect(reloadedOrder.totalAmountExact.currency).toBe('PKR');
      expect(reloadedOrder.totalAmountExact.amountMinor.toString()).toBe('75000');

      const resolved = PaymentService.resolveAuthoritativeOrderCurrency(reloadedOrder);
      expect(resolved).toBe('PKR');
    });

    test('3. Unmarked raw record without persisted currency fails closed on reload', async () => {
      const auth = await createAuth('customer');
      const rawOrderId = new mongoose.Types.ObjectId();

      // Directly insert an un-schema'd raw document into MongoDB collection without currency
      await Order.collection.insertOne({
        _id: rawOrderId,
        orderId: `ORD-RAW-${Date.now()}`,
        user: auth.user._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Unmarked Raw Item',
          sku: `RAW-${++sequence}`,
          price: 300,
          quantity: 1,
          lineTotal: 300
        }],
        shippingAddress: {
          fullName: 'Unmarked Customer',
          phone: '03001112233',
          address: '99 Raw Street',
          city: 'Lahore',
          country: 'Pakistan'
        },
        paymentMethod: 'cod',
        payment: {
          provider: 'Cash on Delivery',
          currency: ''
        },
        currency: '',
        subtotal: 300,
        totalAmount: 300,
        orderStatus: 'Pending',
        statusTimeline: [{
          status: 'Pending',
          actor: auth.user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const reloaded = await Order.findById(rawOrderId);
      expect(() => PaymentService.resolveAuthoritativeOrderCurrency(reloaded))
        .toThrow(expect.objectContaining({
          statusCode: 422,
          code: 'PAYMENT_CURRENCY_REQUIRED'
        }));
    });

    test('4. Arbitrary phantom properties are stripped by Mongoose and ignored by resolver', async () => {
      const auth = await createAuth('customer');
      const rawId = new mongoose.Types.ObjectId();

      // Insert record with phantom fields in MongoDB collection
      await Order.collection.insertOne({
        _id: rawId,
        orderId: `ORD-PHANTOM-${Date.now()}`,
        user: auth.user._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        isLegacyRecord: true, // PHANTOM PROPERTY
        legacyMode: true, // PHANTOM PROPERTY
        schemaVersion: '1.0.0', // PHANTOM PROPERTY
        migrationId: 'phase4d-exact-money-migration', // PHANTOM PROPERTY
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Phantom Item',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        paymentMethod: 'cod',
        payment: { provider: 'Cash on Delivery', currency: '' },
        currency: '',
        subtotal: 100,
        totalAmount: 100,
        statusTimeline: [{ status: 'Pending', actor: auth.user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      // Reload via Mongoose: non-schema fields are stripped
      const hydrated = await Order.findById(rawId);
      expect(hydrated.isLegacyRecord).toBeUndefined();
      expect(hydrated.schemaVersion).toBeUndefined();
      expect(hydrated.migrationId).toBeUndefined();

      // Fails closed deterministically
      expect(() => PaymentService.resolveAuthoritativeOrderCurrency(hydrated))
        .toThrow(expect.objectContaining({
          statusCode: 422,
          code: 'PAYMENT_CURRENCY_REQUIRED'
        }));

      // Even on a plain object with phantom properties, resolver ignores phantom keys
      const plainMockWithPhantom = {
        isLegacyRecord: true,
        schemaVersion: '1.0.0',
        migrationId: 'phase4d-exact-money-migration',
        totalAmount: 100
      };
      expect(() => OrderCurrencyResolver.resolveOrderCurrency(plainMockWithPhantom))
        .toThrow(expect.objectContaining({
          statusCode: 422,
          code: 'PAYMENT_CURRENCY_REQUIRED'
        }));
    });

    test('5. Client payload cannot alter or supply Order currency during payment creation', async () => {
      const auth = await createAuth('customer');
      const order = await Order.create({
        user: auth.user._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Tamper Item',
          price: 250,
          quantity: 1,
          lineTotal: 250
        }],
        shippingAddress: {
          fullName: 'Test Customer',
          phone: '03001234567',
          address: '123 St',
          city: 'Lahore',
          province: 'Punjab',
          country: 'Pakistan'
        },
        paymentMethod: 'bank_transfer',
        payment: { provider: 'bank_transfer', currency: 'PKR' },
        subtotal: 250,
        totalAmount: 250,
        statusTimeline: [{ status: 'Pending', actor: auth.user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      // Client attempts to supply currency or override amount
      const response = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'bank_transfer',
          currency: 'USD',
          amount: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PAYMENT_VALIDATION_FAILED');
    });

    test('6. International domestic orders (GB, AE, US, DE) preserve exact currency and cannot become PKR', async () => {
      const auth = await createAuth('customer');
      const internationalCases = [
        { country: 'United Kingdom', countryCode: 'GB', currency: 'GBP', method: 'cod' },
        { country: 'United Arab Emirates', countryCode: 'AE', currency: 'AED', method: 'cod' },
        { country: 'United States', countryCode: 'US', currency: 'USD', method: 'bank_transfer' },
        { country: 'Germany', countryCode: 'DE', currency: 'EUR', method: 'cod' }
      ];

      for (const tc of internationalCases) {
        const order = await Order.create({
          user: auth.user._id,
          idempotencyKey: crypto.randomUUID(),
          requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
          items: [{
            product: new mongoose.Types.ObjectId(),
            name: `${tc.country} Product`,
            price: 100,
            unitPriceExact: MoneyMapper.fromLegacy(100, tc.currency),
            quantity: 1,
            lineTotal: 100,
            lineTotalExact: MoneyMapper.fromLegacy(100, tc.currency)
          }],
          shippingAddress: {
            fullName: `${tc.country} Customer`,
            phone: '03001234567',
            address: '100 Main St',
            city: 'Capital City',
            province: 'Province',
            country: tc.country,
            countryCode: tc.countryCode
          },
          paymentMethod: tc.method,
          payment: { provider: tc.method, currency: tc.currency },
          subtotal: 100,
          subtotalExact: MoneyMapper.fromLegacy(100, tc.currency),
          totalAmount: 100,
          totalAmountExact: MoneyMapper.fromLegacy(100, tc.currency),
          statusTimeline: [{ status: 'Pending', actor: auth.user._id, actorRole: 'customer', timestamp: new Date() }]
        });

        const reloaded = await Order.findById(order._id);
        const resolved = PaymentService.resolveAuthoritativeOrderCurrency(reloaded);
        expect(resolved).toBe(tc.currency);
        expect(resolved).not.toBe('PKR');
      }
    });

    test('7. Conflicting authoritative snapshots fail closed on persisted reload', async () => {
      const auth = await createAuth('customer');
      const order = await Order.create({
        user: auth.user._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Conflict Item',
          price: 50,
          unitPriceExact: MoneyMapper.fromLegacy(50, 'EUR'),
          quantity: 1,
          lineTotal: 50,
          lineTotalExact: MoneyMapper.fromLegacy(50, 'EUR')
        }],
        shippingAddress: {
          fullName: 'Conflict Customer',
          phone: '03001234567',
          address: '100 St',
          city: 'Berlin',
          province: 'Berlin',
          country: 'Germany',
          countryCode: 'DE'
        },
        paymentMethod: 'cod',
        payment: { provider: 'Cash on Delivery', currency: 'USD' }, // CONFLICT: USD vs EUR
        subtotal: 50,
        subtotalExact: MoneyMapper.fromLegacy(50, 'EUR'),
        totalAmount: 50,
        totalAmountExact: MoneyMapper.fromLegacy(50, 'EUR'),
        statusTimeline: [{ status: 'Pending', actor: auth.user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const reloaded = await Order.findById(order._id);
      expect(() => PaymentService.resolveAuthoritativeOrderCurrency(reloaded))
        .toThrow(expect.objectContaining({
          statusCode: 409,
          code: 'PAYMENT_ORDER_CURRENCY_MISMATCH'
        }));
    });
  });
});
