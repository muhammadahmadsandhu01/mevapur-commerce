'use strict';

const mongoose = require('mongoose');
const Product = require('../../../models/Product');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const Refund = require('../../../models/Refund');
const Return = require('../../../models/Return');
const Coupon = require('../../../models/Coupon');
const ShippingZone = require('../../../models/ShippingZone');
const User = require('../../../models/User');
const MigrationState = require('../../../models/MigrationState');
const MigrationJournal = require('../../../models/MigrationJournal');

const {
  ExactMoneyMigrationRegistry,
  ExactMoneyMigrationService,
  CANONICAL_MIGRATION_ID,
  MIGRATION_TOOL_VERSION
} = require('../../../modules/commerce/migration');
const { RolloutAuthority, CurrencyRegistry, CountryRegistry } = require('../../../modules/commerce');
const { runCli } = require('../../../scripts/migrations/phase4d-exact-money-migration');
const { MigrationGuardError } = require('../../../scripts/lib/migrationRuntimeGuard');

describe('Phase 4D-1 R1 Exact-Money & Legacy Identity Migration Suite', () => {
  beforeEach(async () => {
    // Clear collections
    await Product.deleteMany({});
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
    await Return.deleteMany({});
    await Coupon.deleteMany({});
    await ShippingZone.deleteMany({});
    await User.deleteMany({});
    await MigrationState.deleteMany({});
    await MigrationJournal.deleteMany({});
  });

  describe('1. CLI & Runtime Guard Contracts', () => {
    it('denies execution when no arguments are provided', async () => {
      await expect(runCli([])).rejects.toThrow(MigrationGuardError);
      await expect(runCli([])).rejects.toThrow(/Explicit target parameter is required/);
    });

    it('denies execution when invalid target is provided', async () => {
      await expect(runCli(['--target=invalid_target', '--inventory'])).rejects.toThrow(MigrationGuardError);
      await expect(runCli(['--target=invalid_target', '--inventory'])).rejects.toThrow(/Invalid --target/);
    });

    it('denies execution when multiple conflicting modes are supplied', async () => {
      await expect(
        runCli(['--target=local', '--allow-local', '--inventory', '--apply', '--confirm-phase4d-apply'])
      ).rejects.toThrow(/Conflicting execution modes specified/);
    });

    it('denies apply mode when confirmation token is missing', async () => {
      await expect(
        runCli(['--target=local', '--allow-local', '--apply'])
      ).rejects.toThrow(/requires explicit confirmation token: --confirm-phase4d-apply/);
    });

    it('denies finalize mode when confirmation token is missing', async () => {
      await expect(
        runCli(['--target=local', '--allow-local', '--finalize'])
      ).rejects.toThrow(/requires explicit confirmation token: --confirm-phase4d-finalize/);
    });

    it('denies rollback mode when confirmation token is missing', async () => {
      await expect(
        runCli(['--target=local', '--allow-local', '--rollback'])
      ).rejects.toThrow(/requires explicit confirmation token: --confirm-phase4d-rollback/);
    });

    it('denies execution if legacy currency flag is not in CurrencyRegistry', async () => {
      await expect(
        runCli(['--target=local', '--allow-local', '--inventory', '--legacy-currency=INVALID_XYZ'])
      ).rejects.toThrow(/is not recognized in CurrencyRegistry/);
    });

    it('denies execution if expected registry snapshot does not match', async () => {
      await expect(
        runCli(['--target=local', '--allow-local', '--inventory', '--expected-registry-snapshot=wrong-snapshot-v999'])
      ).rejects.toThrow(/CurrencyRegistry snapshot mismatch/);
    });

    it('denies execution if expected database fingerprint does not match', async () => {
      await expect(
        runCli(['--target=local', '--allow-local', '--inventory', '--expected-db-fingerprint=sha256:000000000000'])
      ).rejects.toThrow(/Database fingerprint mismatch/);
    });
  });

  describe('2. Deterministic Field Mapping & Conversion across Currencies', () => {
    it('correctly maps and converts Products with variants across PKR and USD', () => {
      const pkrProduct = {
        price: 1500,
        costPrice: 1000,
        originalPrice: 1800,
        variants: [
          { sku: 'VAR-1', price: 1500, salePrice: 1400 },
          { sku: 'VAR-2', price: 2000, salePrice: 0 }
        ]
      };

      const resPKR = ExactMoneyMigrationRegistry.evaluateDocument(pkrProduct, 'products', {
        legacyCurrency: 'PKR'
      });

      expect(resPKR.status).toBe('would_update');
      expect(resPKR.exactUpdates.priceExact.amountMinor.toString()).toBe('150000');
      expect(resPKR.exactUpdates.priceExact.currency).toBe('PKR');
      expect(resPKR.exactUpdates.priceExact.exponent).toBe(2);
      expect(resPKR.exactUpdates.costPriceExact.amountMinor.toString()).toBe('100000');
      expect(resPKR.exactUpdates.variants[0].priceExact.amountMinor.toString()).toBe('150000');
      expect(resPKR.exactUpdates.variants[0].salePriceExact.amountMinor.toString()).toBe('140000');
      expect(resPKR.exactUpdates.variants[1].priceExact.amountMinor.toString()).toBe('200000');
    });

    it('handles zero-decimal currencies (JPY) and three-decimal currencies (KWD)', () => {
      const jpyProduct = { price: 5000, costPrice: 3000 };
      const resJPY = ExactMoneyMigrationRegistry.evaluateDocument(jpyProduct, 'products', {
        legacyCurrency: 'JPY'
      });
      expect(resJPY.exactUpdates.priceExact.amountMinor.toString()).toBe('5000');
      expect(resJPY.exactUpdates.priceExact.exponent).toBe(0);

      const kwdOrder = { subtotal: 12.345, totalAmount: 12.345, currency: 'KWD' };
      const resKWD = ExactMoneyMigrationRegistry.evaluateDocument(kwdOrder, 'orders');
      expect(resKWD.exactUpdates.subtotalExact.amountMinor.toString()).toBe('12345');
      expect(resKWD.exactUpdates.subtotalExact.exponent).toBe(3);
    });

    it('converts fixed coupons into valueExact, but marks percentage coupons as inapplicable', () => {
      const fixedCoupon = { type: 'fixed', value: 500, minOrderAmount: 2000, currency: 'PKR' };
      const resFixed = ExactMoneyMigrationRegistry.evaluateDocument(fixedCoupon, 'coupons');
      expect(resFixed.exactUpdates.valueExact.amountMinor.toString()).toBe('50000');
      expect(resFixed.exactUpdates.minOrderAmountExact.amountMinor.toString()).toBe('200000');

      const percentCoupon = { type: 'percentage', value: 15, minOrderAmount: 1000, currency: 'PKR' };
      const resPercent = ExactMoneyMigrationRegistry.evaluateDocument(percentCoupon, 'coupons');
      expect(resPercent.exactUpdates.valueExact).toBeUndefined();
      expect(resPercent.fieldStats.inapplicable).toBe(1);
      expect(resPercent.exactUpdates.minOrderAmountExact.amountMinor.toString()).toBe('100000');
    });

    it('handles USD, EUR, GBP, AED and multi-currency orders/payments', () => {
      const gbpProduct = { price: 25.99, costPrice: 15.50 };
      const resGBP = ExactMoneyMigrationRegistry.evaluateDocument(gbpProduct, 'products', {
        legacyCurrency: 'GBP'
      });
      expect(resGBP.exactUpdates.priceExact.amountMinor.toString()).toBe('2599');
      expect(resGBP.exactUpdates.priceExact.currency).toBe('GBP');

      const aedPayment = { amount: 150.00, paidAmount: 150.00, currency: 'AED' };
      const resAED = ExactMoneyMigrationRegistry.evaluateDocument(aedPayment, 'payments');
      expect(resAED.exactUpdates.amountExact.amountMinor.toString()).toBe('15000');
      expect(resAED.exactUpdates.paidAmountExact.amountMinor.toString()).toBe('15000');

      const eurRefund = { amount: 45.50, currency: 'EUR' };
      const resEUR = ExactMoneyMigrationRegistry.evaluateDocument(eurRefund, 'refunds');
      expect(resEUR.exactUpdates.amountExact.amountMinor.toString()).toBe('4550');
      expect(resEUR.exactUpdates.amountExact.currency).toBe('EUR');
    });

    it('correctly maps ShippingZone rates and Return item amounts', () => {
      const zone = { normalRate: 150, freeShippingThreshold: 3000, remoteRate: 250, currency: 'PKR' };
      const resZone = ExactMoneyMigrationRegistry.evaluateDocument(zone, 'shipping_zones');
      expect(resZone.exactUpdates.normalRateExact.amountMinor.toString()).toBe('15000');
      expect(resZone.exactUpdates.freeShippingThresholdExact.amountMinor.toString()).toBe('300000');
      expect(resZone.exactUpdates.remoteRateExact.amountMinor.toString()).toBe('25000');

      const ret = {
        refundAmount: 1000,
        shippingCost: 150,
        items: [{ price: 1000, refundAmount: 1000 }],
        currency: 'PKR'
      };
      const resReturn = ExactMoneyMigrationRegistry.evaluateDocument(ret, 'returns');
      expect(resReturn.exactUpdates.refundAmountExact.amountMinor.toString()).toBe('100000');
      expect(resReturn.exactUpdates.items[0].priceExact.amountMinor.toString()).toBe('100000');
    });

    it('normalizes legacy address and phone data without discarding country or postal information', () => {
      const user = {
        addresses: [
          {
            fullName: 'Ali Khan',
            phone: '03001234567',
            address: 'Main Boulevard, Gulberg',
            city: 'Lahore',
            state: 'Punjab',
            country: 'Pakistan',
            postalCode: '54000'
          },
          {
            fullName: 'John Smith',
            phone: '+44 7911 123456',
            address: '10 Downing Street',
            city: 'London',
            state: 'Greater London',
            country: 'United Kingdom',
            postalCode: 'SW1A 2AA'
          }
        ]
      };

      const resUser = ExactMoneyMigrationRegistry.evaluateDocument(user, 'users');
      expect(resUser.status).toBe('would_update');
      expect(resUser.exactUpdates.addresses[0].countryCode).toBe('PK');
      expect(resUser.exactUpdates.addresses[0].administrativeArea).toBe('Punjab');
      expect(resUser.exactUpdates.addresses[0].phoneE164).toBe('+923001234567');

      expect(resUser.exactUpdates.addresses[1].countryCode).toBe('GB');
      expect(resUser.exactUpdates.addresses[1].administrativeArea).toBe('Greater London');
      expect(resUser.exactUpdates.addresses[1].phoneE164).toBe('+447911123456');
    });
  });

  describe('3. Inventory & Dry-Run Non-Mutating Execution', () => {
    it('evaluates compliance counts truthfully without mutating documents', async () => {
      await Product.create({
        name: 'Organic Almonds',
        slug: 'organic-almonds',
        price: 1200,
        stock: 50,
        sku: 'ALM-001',
        status: 'published',
        isActive: true
      });

      const inv = await ExactMoneyMigrationService.inventory({ legacyCurrency: 'PKR', legacyCountry: 'PK' });
      expect(inv.models.products.totalDocuments).toBe(1);
      expect(inv.models.products.alreadyCompliantDocs).toBe(0);
      expect(inv.models.products.wouldUpdateDocs).toBe(1);
      expect(inv.models.products.totalEligibleFields).toBe(1);
      expect(inv.models.products.wouldBackfillFields).toBe(1);
      expect(inv.summary.wouldUpdateDocs).toBe(1);

      // Verify product in database was NOT changed
      const pAfter = await Product.findOne({ sku: 'ALM-001' });
      expect(pAfter.priceExact).toBeNull();
    });

    it('flags unresolvable records when currency cannot be inferred', async () => {
      await Product.create({
        name: 'Ambiguous Item',
        slug: 'ambiguous-item',
        price: 500,
        stock: 10,
        sku: 'AMB-001',
        status: 'published',
        isActive: true
      });

      const inv = await ExactMoneyMigrationService.inventory({});
      expect(inv.models.products.unresolvedDocs).toBe(1);
      expect(inv.models.products.unresolvedFields).toBe(1);
      expect(inv.models.products.wouldUpdateDocs).toBe(0);
    });
  });

  describe('4. Apply, CAS Updates, Transactions & Concurrency', () => {
    it('applies exact-money backfill across all models and records journal entries in transactions', async () => {
      const user = await User.create({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
        phone: '03001234567',
        addresses: [{
          fullName: 'Test User',
          phone: '03001234567',
          address: 'Street 1',
          city: 'Lahore',
          country: 'Pakistan'
        }]
      });

      const product = await Product.create({
        name: 'Walnuts',
        slug: 'walnuts',
        price: 2500,
        costPrice: 2000,
        stock: 100,
        sku: 'WAL-001',
        status: 'published',
        isActive: true
      });

      const order = await Order.create({
        orderId: 'ORD-20260912-A1B2C3',
        user: user._id,
        idempotencyKey: 'idemp-order-1',
        requestHash: 'hash-order-1',
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        payment: { currency: 'PKR' },
        subtotal: 2500,
        totalAmount: 2500,
        items: [{
          product: product._id,
          name: 'Walnuts',
          price: 2500,
          quantity: 1,
          lineTotal: 2500
        }],
        shippingAddress: {
          fullName: 'Test User',
          phone: '03001234567',
          address: 'Street 1',
          city: 'Lahore',
          province: 'Punjab',
          country: 'Pakistan'
        },
        statusTimeline: [{
          status: 'Pending',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const payment = await Payment.create({
        order: order._id,
        user: user._id,
        provider: 'cod',
        amount: 2500,
        currency: 'PKR',
        idempotencyKey: 'idemp-pay-1',
        requestHash: 'hash-pay-1',
        providerIdempotencyKey: 'prov-idemp-1',
        status: 'Pending'
      });

      const shippingZone = await ShippingZone.create({
        name: 'Punjab Standard',
        countries: ['PK'],
        regions: ['Punjab'],
        normalRate: 200,
        freeShippingThreshold: 5000,
        deliveryMinDays: 2,
        deliveryMaxDays: 4,
        currency: 'PKR'
      });

      const coupon = await Coupon.create({
        code: 'WELCOME500',
        type: 'fixed',
        value: 500,
        minOrderAmount: 2000,
        currency: 'PKR',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      // Apply migration
      const applyRes = await ExactMoneyMigrationService.apply({
        legacyCurrency: 'PKR',
        legacyCountry: 'PK'
      });

      expect(applyRes.updatedCount).toBeGreaterThanOrEqual(6);
      expect(applyRes.conflictCount).toBe(0);

      // Verify exact fields persisted
      const pUpdated = await Product.findById(product._id);
      expect(pUpdated.priceExact.amountMinor.toString()).toBe('250000');
      expect(pUpdated.priceExact.currency).toBe('PKR');

      const oUpdated = await Order.findById(order._id);
      expect(oUpdated.totalAmountExact.amountMinor.toString()).toBe('250000');
      expect(oUpdated.items[0].unitPriceExact.amountMinor.toString()).toBe('250000');
      expect(oUpdated.shippingAddress.countryCode).toBe('PK');
      expect(oUpdated.shippingAddress.phoneE164).toBe('+923001234567');

      const payUpdated = await Payment.findById(payment._id);
      expect(payUpdated.amountExact.amountMinor.toString()).toBe('250000');

      const zoneUpdated = await ShippingZone.findById(shippingZone._id);
      expect(zoneUpdated.normalRateExact.amountMinor.toString()).toBe('20000');

      const couponUpdated = await Coupon.findById(coupon._id);
      expect(couponUpdated.valueExact.amountMinor.toString()).toBe('50000');

      // Verify journal recorded entries with status applied
      const journals = await MigrationJournal.find({ migrationId: CANONICAL_MIGRATION_ID });
      expect(journals.length).toBeGreaterThanOrEqual(6);
      expect(journals.every(j => j.status === 'applied')).toBe(true);

      // Verify idempotency: running apply again updates 0 records
      const secondApply = await ExactMoneyMigrationService.apply({
        legacyCurrency: 'PKR',
        legacyCountry: 'PK'
      });
      expect(secondApply.updatedCount).toBe(0);
      expect(secondApply.conflictCount).toBe(0);
    });

    it('blocks concurrent apply worker when lease is held', async () => {
      const lease1 = await ExactMoneyMigrationService.acquireLease(CANONICAL_MIGRATION_ID, 'worker-1');
      expect(lease1.acquired).toBe(true);
      expect(lease1.leaseId).toBeDefined();

      const lease2 = await ExactMoneyMigrationService.acquireLease(CANONICAL_MIGRATION_ID, 'worker-2');
      expect(lease2.acquired).toBe(false);
      expect(lease2.workerId).toBe('worker-1');

      await ExactMoneyMigrationService.releaseLease(CANONICAL_MIGRATION_ID, lease1.leaseId);
      const lease3 = await ExactMoneyMigrationService.acquireLease(CANONICAL_MIGRATION_ID, 'worker-2');
      expect(lease3.acquired).toBe(true);
      await ExactMoneyMigrationService.releaseLease(CANONICAL_MIGRATION_ID, lease3.leaseId);
    });

    it('detects existing parity conflict and fails closed without overwriting', async () => {
      await Product.create({
        name: 'Conflicting Product',
        slug: 'conflicting-product',
        price: 1000,
        priceExact: {
          amountMinor: mongoose.Types.Decimal128.fromString('999999'),
          currency: 'PKR',
          exponent: 2,
          registrySnapshot: 'currency-registry-v1'
        },
        stock: 10,
        sku: 'CONF-001',
        status: 'published',
        isActive: true
      });

      const inv = await ExactMoneyMigrationService.inventory({ legacyCurrency: 'PKR' });
      expect(inv.models.products.conflictDocs).toBe(1);
      expect(inv.models.products.conflictingFields).toBe(1);

      const applyRes = await ExactMoneyMigrationService.apply({ legacyCurrency: 'PKR' });
      expect(applyRes.conflictCount).toBe(1);

      // Ensure exact field was not mutated
      const p = await Product.findOne({ sku: 'CONF-001' });
      expect(p.priceExact.amountMinor.toString()).toBe('999999');
    });

    it('strong CAS update predicate blocks out-of-band price edits that do not increment version', async () => {
      const p = await Product.create({
        name: 'CAS Test Product',
        slug: 'cas-test-product',
        price: 1500,
        stock: 10,
        sku: 'CAS-001',
        status: 'published',
        isActive: true
      });

      // Construct evaluator with original price 1500
      const evalRes = ExactMoneyMigrationRegistry.evaluateDocument(p, 'products', { legacyCurrency: 'PKR' });

      // Simulate out-of-band update that alters price to 2000 without incrementing __v
      await Product.collection.updateOne({ _id: p._id }, { $set: { price: 2000 } });

      // Attempt update using stale CAS filter (which expects price: 1500)
      const updateRes = await Product.collection.updateOne(evalRes.casFilter, { $set: evalRes.exactUpdates });
      expect(updateRes.modifiedCount).toBe(0); // CAS prevented clobbering!

      // Product price remains 2000, and exact price is still null
      const pAfter = await Product.findById(p._id);
      expect(pAfter.price).toBe(2000);
      expect(pAfter.priceExact).toBeNull();
    });
  });

  describe('5. Authoritative Cross-Document Provenance', () => {
    it('Payment resolves currency from real linked Order document', async () => {
      const user = await User.create({
        fullName: 'Provenance User',
        email: 'prov@example.com',
        password: 'Password123!',
        phone: '03001234567'
      });

      const order = await Order.create({
        orderId: 'ORD-PROV-001',
        user: user._id,
        idempotencyKey: 'idemp-order-prov',
        requestHash: 'hash-order-prov',
        paymentMethod: 'stripe',
        paymentStatus: 'Pending',
        payment: { currency: 'USD' },
        subtotal: 100,
        totalAmount: 100,
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Item',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        shippingAddress: {
          fullName: 'Prov User',
          phone: '03001234567',
          address: 'Street 1',
          city: 'City',
          province: 'Province',
          country: 'Pakistan'
        },
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      // Payment missing currency field
      const payment = await Payment.create({
        order: order._id,
        user: user._id,
        provider: 'stripe',
        amount: 100,
        idempotencyKey: 'idemp-pay-prov',
        requestHash: 'hash-pay-prov',
        providerIdempotencyKey: 'prov-idemp-prov',
        status: 'Pending'
      });

      // Manually unset currency to simulate legacy record missing currency
      await Payment.collection.updateOne({ _id: payment._id }, { $unset: { currency: 1 } });

      const resolved = await ExactMoneyMigrationService.resolveLinkedCurrency({ _id: payment._id, order: order._id }, 'payments');
      expect(resolved).toBe('USD');

      await ExactMoneyMigrationService.apply({});
      const pAfter = await Payment.findById(payment._id);
      expect(pAfter.amountExact.currency).toBe('USD');
      expect(pAfter.amountExact.amountMinor.toString()).toBe('10000');
    });

    it('Refund resolves currency from linked Payment document', async () => {
      const user = await User.create({
        fullName: 'Refund User',
        email: 'refund@example.com',
        password: 'Password123!',
        phone: '03001234567'
      });

      const order = await Order.create({
        orderId: 'ORD-REF-001',
        user: user._id,
        idempotencyKey: 'idemp-order-ref',
        requestHash: 'hash-order-ref',
        paymentMethod: 'stripe',
        paymentStatus: 'Paid',
        payment: { currency: 'EUR' },
        subtotal: 50,
        totalAmount: 50,
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Item',
          price: 50,
          quantity: 1,
          lineTotal: 50
        }],
        shippingAddress: {
          fullName: 'Ref User',
          phone: '03001234567',
          address: 'Street 1',
          city: 'City',
          province: 'Province',
          country: 'Pakistan'
        },
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const payment = await Payment.create({
        order: order._id,
        user: user._id,
        provider: 'stripe',
        amount: 50,
        currency: 'EUR',
        idempotencyKey: 'idemp-pay-ref',
        requestHash: 'hash-pay-ref',
        providerIdempotencyKey: 'prov-idemp-ref',
        status: 'Completed'
      });

      const refund = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 50,
        currency: 'EUR',
        processedBy: user._id,
        idempotencyKey: 'idemp-refund-001',
        requestHash: 'hash-refund-001',
        providerIdempotencyKey: 'prov-idemp-refund-001',
        status: 'Pending'
      });

      await Refund.collection.updateOne({ _id: refund._id }, { $unset: { currency: 1 } });

      const resolved = await ExactMoneyMigrationService.resolveLinkedCurrency({ _id: refund._id, payment: payment._id, order: order._id }, 'refunds');
      expect(resolved).toBe('EUR');

      await ExactMoneyMigrationService.apply({});
      const rAfter = await Refund.findById(refund._id);
      expect(rAfter.amountExact.currency).toBe('EUR');
      expect(rAfter.amountExact.amountMinor.toString()).toBe('5000');
    });
  });

  describe('6. Safe Rollback', () => {
    it('recovers from stale expired lease cleanly', async () => {
      await MigrationState.create({
        migrationId: CANONICAL_MIGRATION_ID,
        status: 'pending',
        metadata: {
          lease: {
            leaseId: 'stale-lease-1',
            workerId: 'stale-worker-999',
            acquiredAt: new Date(Date.now() - 600000),
            expiresAt: new Date(Date.now() - 300000)
          }
        }
      });

      const newLease = await ExactMoneyMigrationService.acquireLease(CANONICAL_MIGRATION_ID, 'new-worker');
      expect(newLease.acquired).toBe(true);
      expect(newLease.workerId).toBe('new-worker');
      await ExactMoneyMigrationService.releaseLease(CANONICAL_MIGRATION_ID, newLease.leaseId);
    });

    it('preserves pre-existing exact fields created by application code during rollback', async () => {
      const existingProduct = await Product.create({
        name: 'Pre-existing Exact Product',
        slug: 'pre-existing-exact-product',
        price: 1500,
        priceExact: {
          amountMinor: mongoose.Types.Decimal128.fromString('150000'),
          currency: 'PKR',
          exponent: 2,
          registrySnapshot: CurrencyRegistry.getProvenance().snapshotName
        },
        costPrice: 0,
        costPriceExact: {
          amountMinor: mongoose.Types.Decimal128.fromString('0'),
          currency: 'PKR',
          exponent: 2,
          registrySnapshot: CurrencyRegistry.getProvenance().snapshotName
        },
        originalPrice: 0,
        originalPriceExact: {
          amountMinor: mongoose.Types.Decimal128.fromString('0'),
          currency: 'PKR',
          exponent: 2,
          registrySnapshot: CurrencyRegistry.getProvenance().snapshotName
        },
        stock: 20,
        sku: 'PRE-001',
        status: 'published',
        isActive: true
      });

      const migrateProduct = await Product.create({
        name: 'Cashews',
        slug: 'cashews',
        price: 3000,
        costPrice: 2400,
        stock: 50,
        sku: 'CSH-001',
        status: 'published',
        isActive: true
      });

      await ExactMoneyMigrationService.apply({ legacyCurrency: 'PKR' });

      // Rollback
      const rollbackRes = await ExactMoneyMigrationService.rollback();
      expect(rollbackRes.rolledBackCount).toBe(1);

      // Pre-existing product priceExact remains untouched
      const preAfter = await Product.findById(existingProduct._id);
      expect(preAfter.priceExact).not.toBeNull();
      expect(preAfter.priceExact.amountMinor.toString()).toBe('150000');

      // Migrated product was rolled back
      const cshAfter = await Product.findById(migrateProduct._id);
      expect(cshAfter.priceExact).toBeNull();
      expect(cshAfter.price).toBe(3000);
    });

    it('unsets only migration-owned fields, updates journal status to rolled_back, and preserves legacy data', async () => {
      const product = await Product.create({
        name: 'Cashews',
        slug: 'cashews',
        price: 3000,
        costPrice: 2400,
        stock: 50,
        sku: 'CSH-001',
        status: 'published',
        isActive: true
      });

      await ExactMoneyMigrationService.apply({ legacyCurrency: 'PKR' });

      let p = await Product.findById(product._id);
      expect(p.priceExact).not.toBeNull();

      // Rollback
      const rollbackRes = await ExactMoneyMigrationService.rollback();
      expect(rollbackRes.rolledBackCount).toBeGreaterThanOrEqual(1);

      p = await Product.findById(product._id);
      expect(p.priceExact).toBeNull();
      expect(p.price).toBe(3000);
      expect(p.stock).toBe(50);
      expect(p.sku).toBe('CSH-001');

      // Journal entry retained with status rolled_back
      const journal = await MigrationJournal.findOne({ documentId: product._id });
      expect(journal).not.toBeNull();
      expect(journal.status).toBe('rolled_back');
      expect(journal.rolledBackAt).toBeInstanceOf(Date);
    });
  });

  describe('7. Read-Only Verification vs Mutating Finalize Authority', () => {
    it('verify mode is strictly read-only and writes zero records', async () => {
      await Product.create({
        name: 'Item 1',
        slug: 'item-1',
        price: 500,
        stock: 10,
        sku: 'ITM-001',
        status: 'published',
        isActive: true
      });

      const verifyRes = await ExactMoneyMigrationService.verify({ legacyCurrency: 'PKR' });
      expect(verifyRes.verified).toBe(false);

      // Verify NO MigrationState record created by verify()
      const stateCount = await MigrationState.countDocuments({});
      expect(stateCount).toBe(0);

      // Verify NO MigrationJournal record created by verify()
      const journalCount = await MigrationJournal.countDocuments({});
      expect(journalCount).toBe(0);
    });

    it('finalize before apply is rejected', async () => {
      await expect(
        ExactMoneyMigrationService.finalize({ legacyCurrency: 'PKR' })
      ).rejects.toThrow(/Apply must run before finalization/);
    });

    it('refuses finalize when field coverage is incomplete or conflicts exist', async () => {
      await Product.create({
        name: 'Unmigrated Item',
        slug: 'unmigrated-item',
        price: 500,
        stock: 10,
        sku: 'UNM-001',
        status: 'published',
        isActive: true
      });

      // Mark state as applied manually to test finalize boundary
      await MigrationState.create({
        migrationId: CANONICAL_MIGRATION_ID,
        status: 'applied',
        processedCount: 1
      });

      await expect(
        ExactMoneyMigrationService.finalize({ legacyCurrency: 'PKR' })
      ).rejects.toThrow(/Migration finalization rejected/);

      const state = await MigrationState.findOne({ migrationId: CANONICAL_MIGRATION_ID });
      expect(state.status).toBe('failed');

      // Readiness authority rejects failed state
      const isReady = RolloutAuthority.verifyReadinessEvidence(state);
      expect(isReady).toBe(false);
    });

    it('authorized finalize records completed MigrationState evidence that satisfies RolloutAuthority exact-read readiness', async () => {
      await Product.create({
        name: 'Fully Compliant Item',
        slug: 'fully-compliant-item',
        price: 1000,
        costPrice: 800,
        originalPrice: 1200,
        stock: 10,
        sku: 'FCI-001',
        status: 'published',
        isActive: true
      });

      // 1. Apply
      await ExactMoneyMigrationService.apply({ legacyCurrency: 'PKR', legacyCountry: 'PK' });

      // 2. Read-only verify
      const verifyRes = await ExactMoneyMigrationService.verify({ legacyCurrency: 'PKR', legacyCountry: 'PK' });
      expect(verifyRes.verified).toBe(true);

      // 3. Finalize
      const finalizeRes = await ExactMoneyMigrationService.finalize({ legacyCurrency: 'PKR', legacyCountry: 'PK' });
      expect(finalizeRes.finalized).toBe(true);
      expect(finalizeRes.state.status).toBe('completed');
      expect(finalizeRes.state.conflictCount).toBe(0);
      expect(finalizeRes.state.metadata.fieldCoverage).toBe(100);
      expect(finalizeRes.state.metadata.unresolvedParityFailures).toBe(0);
      expect(finalizeRes.state.metadata.scope).toEqual(RolloutAuthority.REQUIRED_MODEL_SCOPE);

      // 4. RolloutAuthority accepts evidence
      const isReady = RolloutAuthority.verifyReadinessEvidence(finalizeRes.state);
      expect(isReady).toBe(true);

      // 5. RolloutAuthority elevates to exact_read when requested
      const effectiveMode = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'exact_read',
        requestedMode: 'exact_read',
        readinessEvidence: finalizeRes.state
      });
      expect(effectiveMode).toBe('exact_read');
    });
  });
});
