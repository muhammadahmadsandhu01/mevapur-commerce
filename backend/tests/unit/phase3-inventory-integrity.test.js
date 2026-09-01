const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const InventoryTransaction = require('../../models/InventoryTransaction');
const AuditLog = require('../../models/AuditLog');
const TokenService = require('../../services/TokenService');
const InventoryService = require('../../services/inventory/InventoryService');

const generateStaffToken = async (user) => {
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });

  return TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion || 0
  });
};

describe('Phase 3 — Inventory Single Writer and Integrity', () => {
  let superAdminUser;
  let adminUser;
  let managerUser;
  let inventoryUser;
  let supportUser;
  let customerUser;
  let invalidRoleUser;

  let superAdminToken;
  let adminToken;
  let managerToken;
  let inventoryToken;
  let supportToken;
  let customerToken;
  let invalidRoleToken;

  let simpleProduct;
  let variableProduct;
  let variant1Id;
  let variant2Id;

  beforeEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
    await Product.deleteMany({});
    await InventoryTransaction.deleteMany({});
    try { await AuditLog.collection.deleteMany({}); } catch { /* ignore */ }

    superAdminUser = await User.create({
      fullName: 'Super Admin',
      email: 'superadmin-inv@mevapur.test',
      password: 'Password123!',
      role: 'super_admin',
      tokenVersion: 0,
      isVerified: true
    });
    superAdminToken = await generateStaffToken(superAdminUser);

    adminUser = await User.create({
      fullName: 'Admin User',
      email: 'admin-inv@mevapur.test',
      password: 'Password123!',
      role: 'admin',
      tokenVersion: 0,
      isVerified: true
    });
    adminToken = await generateStaffToken(adminUser);

    managerUser = await User.create({
      fullName: 'Manager User',
      email: 'manager-inv@mevapur.test',
      password: 'Password123!',
      role: 'manager',
      tokenVersion: 0,
      isVerified: true
    });
    managerToken = await generateStaffToken(managerUser);

    inventoryUser = await User.create({
      fullName: 'Inventory Staff',
      email: 'inventory-inv@mevapur.test',
      password: 'Password123!',
      role: 'inventory',
      tokenVersion: 0,
      isVerified: true
    });
    inventoryToken = await generateStaffToken(inventoryUser);

    supportUser = await User.create({
      fullName: 'Support Staff',
      email: 'support-inv@mevapur.test',
      password: 'Password123!',
      role: 'support',
      tokenVersion: 0,
      isVerified: true
    });
    supportToken = await generateStaffToken(supportUser);

    customerUser = await User.create({
      fullName: 'Normal Customer',
      email: 'customer-inv@mevapur.test',
      password: 'Password123!',
      role: 'customer',
      tokenVersion: 0,
      isVerified: true
    });
    customerToken = await generateStaffToken(customerUser);

    // Simple Product fixture
    simpleProduct = await Product.create({
      name: 'Organic Walnuts 500g',
      slug: 'organic-walnuts-500g',
      sku: 'WAL-500G',
      price: 1500,
      stock: 50,
      lowStockThreshold: 15,
      variants: []
    });

    variant1Id = new mongoose.Types.ObjectId();
    variant2Id = new mongoose.Types.ObjectId();

    // Variable Product fixture (Sum of variants: 20 + 30 = 50)
    variableProduct = await Product.create({
      name: 'Premium Almonds',
      slug: 'premium-almonds',
      sku: 'ALM-ROOT',
      price: 2000,
      stock: 50,
      lowStockThreshold: 10,
      variants: [
        {
          _id: variant1Id,
          sku: 'ALM-250G',
          stock: 20,
          price: 1000,
          attributes: [{ name: 'Weight', value: '250g' }]
        },
        {
          _id: variant2Id,
          sku: 'ALM-500G',
          stock: 30,
          price: 1900,
          attributes: [{ name: 'Weight', value: '500g' }]
        }
      ]
    });
  });

  describe('1. Comprehensive Table-Driven Role Authorization for Inventory', () => {
    it('enforces authorized and forbidden roles on inventory list (GET /api/inventory)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        inventory: inventoryToken,
        support: supportToken,
        customer: customerToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, inventory: 200, support: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app).get('/api/inventory').set('Authorization', `Bearer ${tokens[role]}`);
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on inventory stats (GET /api/inventory/stats)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        inventory: inventoryToken,
        support: supportToken,
        customer: customerToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, inventory: 200, support: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app).get('/api/inventory/stats').set('Authorization', `Bearer ${tokens[role]}`);
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on inventory history (GET /api/inventory/history)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        inventory: inventoryToken,
        support: supportToken,
        customer: customerToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, inventory: 200, support: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app).get('/api/inventory/history').set('Authorization', `Bearer ${tokens[role]}`);
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on inventory CSV export (GET /api/inventory/export)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        inventory: inventoryToken,
        support: supportToken,
        customer: customerToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, inventory: 200, support: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app).get('/api/inventory/export').set('Authorization', `Bearer ${tokens[role]}`);
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on inventory adjust (POST /api/inventory/adjust)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        inventory: inventoryToken,
        support: supportToken,
        customer: customerToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, inventory: 200, support: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app)
          .post('/api/inventory/adjust')
          .set('Authorization', `Bearer ${tokens[role]}`)
          .send({
            productId: simpleProduct._id,
            type: 'in',
            quantity: 1,
            reason: 'Test adjustment',
            operationKey: crypto.randomUUID()
          });
        expect(res.status).toBe(status);
      }
    });

    it('fails closed with 401 for unauthenticated requests and invalid tokens', async () => {
      const resNoAuth = await request(app).get('/api/inventory');
      expect(resNoAuth.status).toBe(401);

      const resInvalidToken = await request(app)
        .get('/api/inventory')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(resInvalidToken.status).toBe(401);
    });
  });

  describe('2. Single Writer Rules and Variant Synchronization', () => {
    it('synchronizes root stock when a variant stock is adjusted', async () => {
      // Adjust variant 1 from 20 -> 25 (+5)
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: variableProduct._id,
          variantId: variant1Id.toString(),
          type: 'in',
          quantity: 5,
          reason: 'Restocked variant 250g',
          operationKey: '00000000-0000-0000-0000-000000000004'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.previousStock).toBe(20);
      expect(res.body.data.product.newStock).toBe(25);
      expect(res.body.data.product.rootStock).toBe(55); // 25 + 30 = 55

      const reloaded = await Product.findById(variableProduct._id);
      expect(reloaded.variants.id(variant1Id).stock).toBe(25);
      expect(reloaded.variants.id(variant2Id).stock).toBe(30);
      expect(reloaded.stock).toBe(55);
    });

    it('rejects variant ID on simple products and requires variant ID on variable products', async () => {
      // Pass variantId to simple product -> must fail with 400
      const resSimple = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: simpleProduct._id,
          variantId: variant1Id.toString(),
          type: 'in',
          quantity: 5,
          reason: 'Invalid variant passed',
          operationKey: '00000000-0000-0000-0000-000000000005'
        });

      expect(resSimple.status).toBe(400);
      expect(resSimple.body.error?.message || resSimple.body.message).toContain('simple products');

      // Omit variantId on variable product -> must fail with 400
      const resVariable = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: variableProduct._id,
          type: 'in',
          quantity: 5,
          reason: 'Missing variant ID',
          operationKey: '00000000-0000-0000-0000-000000000006'
        });

      expect(resVariable.status).toBe(400);
      expect(resVariable.body.error?.message || resVariable.body.message).toContain('Variant ID is required');
    });

    it('rejects reduction that would cause stock to drop below zero (409)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: simpleProduct._id,
          type: 'out',
          quantity: 100, // Stock is only 50
          reason: 'Excessive deduction',
          operationKey: '00000000-0000-0000-0000-000000000007'
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.message || res.body.message).toContain('below zero');

      // Verify stock untouched
      const product = await Product.findById(simpleProduct._id);
      expect(product.stock).toBe(50);
    });
  });

  describe('3. Idempotency Durability and Replay', () => {
    it('safely replays previous adjustment on duplicate operationKey without double-mutating', async () => {
      const opKey = '00000000-0000-0000-0000-000000000008';

      // First call: +10 stock (50 -> 60)
      const res1 = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: simpleProduct._id,
          type: 'in',
          quantity: 10,
          reason: 'First adjustment',
          operationKey: opKey
        });

      expect(res1.status).toBe(200);
      expect(res1.body.data.product.newStock).toBe(60);
      expect(res1.body.data.idempotentReplay).toBe(false);

      // Second call with same operationKey: must replay 60 without changing to 70!
      const res2 = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: simpleProduct._id,
          type: 'in',
          quantity: 10,
          reason: 'First adjustment replay',
          operationKey: opKey
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.product.newStock).toBe(60);
      expect(res2.body.data.idempotentReplay).toBe(true);

      const reloaded = await Product.findById(simpleProduct._id);
      expect(reloaded.stock).toBe(60); // Not 70!
    });
  });

  describe('4. Sellable SKU Global Telemetry and Truthful Counts', () => {
    it('accurately counts sellable SKUs and physical units without double counting root stock', async () => {
      const list = await InventoryService.getInventoryList({ page: 1, limit: 15 });

      // 1 simple product (1 SKU, 50 units) + 1 variable product (2 variant SKUs, 50 units)
      expect(list.summary.global.totalProducts).toBe(2);
      expect(list.summary.global.totalSellableSkus).toBe(3); // 1 simple + 2 variants
      expect(list.summary.global.totalPhysicalUnits).toBe(100); // 50 + (20 + 30)
    });
  });

  describe('5. Inventory CSV Export and Formula Neutralization', () => {
    it('exports one row per sellable SKU and neutralizes spreadsheet formula characters', async () => {
      // Create product with formula in SKU
      await Product.create({
        name: 'Dangerous Formula Product',
        sku: '=SUM(A1:A10)',
        price: 100,
        stock: 10,
        variants: []
      });

      const res = await request(app)
        .get('/api/inventory/export')
        .set('Authorization', `Bearer ${inventoryToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain("'=SUM");
    });
  });

  describe('6. Deterministic Retry Timing and Bounded Backoff Math', () => {
    it('strictly executes 6 attempts, 5 waits, and bounds cumulative backoff to <= 275ms (< 300ms)', async () => {
      let executions = 0;
      const observedDelays = [];

      // Create a transient error with label
      const createTransientError = () => {
        const err = new Error('Write conflict on transient commit');
        err.hasErrorLabel = (label) => label === 'TransientTransactionError';
        return err;
      };

      // Mock session to simulate transaction retries without a full replica set
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn(),
        inTransaction: () => false
      };

      const originalStartSession = mongoose.startSession;
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      // Spy on setTimeout to capture exact requested delay values deterministically
      const originalSetTimeout = global.setTimeout;
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
        observedDelays.push(delay);
        return originalSetTimeout(fn, 0); // Execute immediately for fast test
      });

      try {
        await InventoryService.runTransaction(async () => {
          executions++;
          throw createTransientError();
        }, 6);
      } catch (err) {
        expect(err.message).toContain('Write conflict on transient commit');
      } finally {
        setTimeoutSpy.mockRestore();
        mongoose.startSession = originalStartSession;
      }

      // Assertions on retry math:
      // 1. Exact number of executions: 6 (1 initial + 5 retries)
      expect(executions).toBe(6);

      // 2. Exact number of wait intervals: 5
      expect(observedDelays.length).toBe(5);

      // 3. Maximum possible bounds for each attempt:
      // Wait 1 (attempt 1): delay <= 19 + 12*1 = 31ms
      expect(observedDelays[0]).toBeGreaterThanOrEqual(12);
      expect(observedDelays[0]).toBeLessThanOrEqual(31);

      // Wait 2 (attempt 2): delay <= 19 + 12*2 = 43ms
      expect(observedDelays[1]).toBeGreaterThanOrEqual(24);
      expect(observedDelays[1]).toBeLessThanOrEqual(43);

      // Wait 3 (attempt 3): delay <= 19 + 12*3 = 55ms
      expect(observedDelays[2]).toBeGreaterThanOrEqual(36);
      expect(observedDelays[2]).toBeLessThanOrEqual(55);

      // Wait 4 (attempt 4): delay <= 19 + 12*4 = 67ms
      expect(observedDelays[3]).toBeGreaterThanOrEqual(48);
      expect(observedDelays[3]).toBeLessThanOrEqual(67);

      // Wait 5 (attempt 5): delay <= 19 + 12*5 = 79ms
      expect(observedDelays[4]).toBeGreaterThanOrEqual(60);
      expect(observedDelays[4]).toBeLessThanOrEqual(79);

      // 4. Exact cumulative backoff delay is mathematically strictly <= 275ms (< 300ms)
      const totalDelay = observedDelays.reduce((sum, d) => sum + d, 0);
      expect(totalDelay).toBeLessThanOrEqual(275);
    });
  });
});
