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
  let adminUser;
  let inventoryUser;
  let supportUser;
  let customerUser;

  let adminToken;
  let inventoryToken;
  let supportToken;
  let customerToken;

  let simpleProduct;
  let variableProduct;
  let variant1Id;
  let variant2Id;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce-test';
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Product.deleteMany({});
    await InventoryTransaction.deleteMany({});
    try { await AuditLog.collection.deleteMany({}); } catch { /* ignore */ }

    adminUser = await User.create({
      fullName: 'Admin User',
      email: 'admin@mevapur.test',
      password: 'Password123!',
      role: 'admin',
      isVerified: true
    });
    adminToken = await generateStaffToken(adminUser);

    inventoryUser = await User.create({
      fullName: 'Inventory Staff',
      email: 'inventory@mevapur.test',
      password: 'Password123!',
      role: 'inventory',
      isVerified: true
    });
    inventoryToken = await generateStaffToken(inventoryUser);

    supportUser = await User.create({
      fullName: 'Support Staff',
      email: 'support@mevapur.test',
      password: 'Password123!',
      role: 'support',
      isVerified: true
    });
    supportToken = await generateStaffToken(supportUser);

    customerUser = await User.create({
      fullName: 'Normal Customer',
      email: 'customer@mevapur.test',
      password: 'Password123!',
      role: 'customer',
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

  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('1. Role Authorization for Inventory Operations', () => {
    it('allows inventory staff and admin to adjust stock and view history', async () => {
      const resAdjust = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${inventoryToken}`)
        .send({
          productId: simpleProduct._id,
          type: 'in',
          quantity: 10,
          reason: 'Supplier shipment received',
          operationKey: '00000000-0000-0000-0000-000000000001'
        });

      expect(resAdjust.status).toBe(200);
      expect(resAdjust.body.data.product.newStock).toBe(60);

      const resHistory = await request(app)
        .get('/api/inventory/history')
        .set('Authorization', `Bearer ${inventoryToken}`);

      expect(resHistory.status).toBe(200);
      expect(resHistory.body.data.length).toBe(1);
    });

    it('denies support staff and customer access to adjust stock (403)', async () => {
      const resSupport = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          productId: simpleProduct._id,
          type: 'in',
          quantity: 5,
          reason: 'Unauthorized attempt',
          operationKey: '00000000-0000-0000-0000-000000000002'
        });

      expect(resSupport.status).toBe(403);

      const resCustomer = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: simpleProduct._id,
          type: 'in',
          quantity: 5,
          reason: 'Unauthorized attempt',
          operationKey: '00000000-0000-0000-0000-000000000003'
        });

      expect(resCustomer.status).toBe(403);
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
});
