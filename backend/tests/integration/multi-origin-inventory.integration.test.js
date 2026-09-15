/**
 * @file multi-origin-inventory.integration.test.js
 * @description Integration tests for Phase 6D-2 multi-origin fulfillment location CRUD,
 * inventory positions, reasoned stock adjustment with ledger entries, position controls, and RBAC.
 */

const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const Category = require('../../models/Category');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryTransaction = require('../../models/InventoryTransaction');
const { MoneyMapper } = require('../../modules/commerce');

let userSeq = 0;

const getAuthToken = async (role = 'admin') => {
  userSeq += 1;
  const user = await global.createTestUser({
    email: `inventory-auth-${userSeq}-${Date.now()}@example.test`,
    role
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
    token: `Bearer ${TokenService.generateAccessToken({
      userId: user._id,
      sessionId: session._id,
      tokenVersion: user.tokenVersion
    })}`,
    user
  };
};

describe('Phase 6D-2: Multi-Origin Inventory Integration Tests', () => {
  let adminAuth;
  let superAdminAuth;
  let inventoryStaffAuth;
  let customerAuth;
  let testProduct;

  beforeEach(async () => {
    adminAuth = await getAuthToken('admin');
    superAdminAuth = await getAuthToken('super_admin');
    inventoryStaffAuth = await getAuthToken('inventory');
    customerAuth = await getAuthToken('customer');

    testProduct = await Product.create({
      name: `Almonds Premium ${Date.now()}`,
      slug: `almonds-premium-${Date.now()}`,
      sku: `ALM-${Date.now().toString().slice(-4)}`,
      status: 'published',
      isActive: true,
      price: 1500,
      stock: 50,
      lowStockThreshold: 10
    });
  });

  describe('Fulfillment Locations API', () => {
    it('allows admin to create an active fulfillment location', async () => {
      const payload = {
        locationCode: `WH-TEST-${Date.now().toString().slice(-4)}`,
        displayName: 'Karachi Port Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Karachi',
        timeZone: 'Asia/Karachi',
        priority: 10,
        supportedMarketCountries: ['PK', 'AE', 'SA'],
        supportedServiceLevels: ['standard', 'express'],
        capabilities: ['local_delivery', 'cross_border'],
        isDefault: true
      };

      const res = await request(app)
        .post('/api/inventory/locations')
        .set('Authorization', adminAuth.token)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.locationCode).toBe(payload.locationCode);
      expect(res.body.data.isDefault).toBe(true);
    });

    it('rejects location creation by non-admin staff or customers', async () => {
      const payload = {
        locationCode: 'WH-FORBIDDEN-01',
        displayName: 'Unauthorized Hub',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi'
      };

      const res = await request(app)
        .post('/api/inventory/locations')
        .set('Authorization', customerAuth.token)
        .send(payload);

      expect(res.status).toBe(403);
    });

    it('lists fulfillment locations for inventory staff', async () => {
      await FulfillmentLocation.create({
        merchantScopeId: 'default',
        locationCode: `WH-LST-${Date.now().toString().slice(-4)}`,
        displayName: 'Listing Warehouse',
        status: 'active',
        countryCode: 'PK',
        city: 'Islamabad',
        timeZone: 'Asia/Karachi'
      });

      const res = await request(app)
        .get('/api/inventory/locations')
        .set('Authorization', inventoryStaffAuth.token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Inventory Positions & Adjustments API', () => {
    it('performs reasoned stock adjustment across location and records ledger', async () => {
      const location = await FulfillmentLocation.create({
        merchantScopeId: 'default',
        locationCode: `WH-ADJ-${Date.now().toString().slice(-4)}`,
        displayName: 'Adjustment Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Multan',
        timeZone: 'Asia/Karachi'
      });

      const opKey = crypto.randomUUID();
      const payload = {
        productId: String(testProduct._id),
        locationId: String(location._id),
        type: 'in',
        quantity: 25,
        reason: 'Initial stock intake from supplier invoice #INV-9871',
        reference: 'INV-9871',
        operationKey: opKey
      };

      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth.token)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.newStock).toBe(25);

      // Verify position was created
      const pos = await InventoryPosition.findOne({
        productId: testProduct._id,
        locationId: location._id
      });
      expect(pos).toBeDefined();
      expect(pos.onHand).toBe(25);
      expect(pos.calculateATP()).toBe(25);

      // Verify immutable ledger entry
      const ledgerEntry = await InventoryLedger.findOne({ idempotencyKey: opKey });
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.movementType).toBe('ADMIN_ADJUSTMENT');
      expect(ledgerEntry.quantityDelta).toBe(25);

      // Test Idempotent Replay
      const replayRes = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth.token)
        .send(payload);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.data.idempotentReplay).toBe(true);
    });

    it('allows admin to update position safety stock and reorder point controls', async () => {
      const location = await FulfillmentLocation.create({
        merchantScopeId: 'default',
        locationCode: `WH-CTRL-${Date.now().toString().slice(-4)}`,
        displayName: 'Control Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Faisalabad',
        timeZone: 'Asia/Karachi'
      });

      const position = await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: location._id,
        locationCode: location.locationCode,
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: testProduct.sku,
        onHand: 40,
        safetyStock: 0,
        reorderPoint: 5
      });

      const res = await request(app)
        .put(`/api/inventory/positions/${position._id}/controls`)
        .set('Authorization', adminAuth.token)
        .send({
          safetyStock: 8,
          reorderPoint: 12,
          allowBackorder: true,
          backorderLimit: 15
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.safetyStock).toBe(8);
      expect(res.body.data.reorderPoint).toBe(12);
      expect(res.body.data.allowBackorder).toBe(true);

      const updated = await InventoryPosition.findById(position._id);
      expect(updated.safetyStock).toBe(8);
      // ATP = 40 - 0 - 0 - 8 + 15 = 47
      expect(updated.calculateATP()).toBe(47);
    });
  });

  describe('Reconciliation Diagnostics API', () => {
    it('returns a healthy inventory reconciliation report', async () => {
      const res = await request(app)
        .get('/api/inventory/reconciliation')
        .set('Authorization', adminAuth.token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('HEALTHY');
      expect(res.body.data.aggregateCounters).toBeDefined();
    });
  });

  describe('Public Catalog & Storefront Truthful ATP (§3)', () => {
    it('returns truthful stock status and isPurchasable based on canonical ATP, keeping exact stock private', async () => {
      const cat = await Category.create({
        name: 'Test Category',
        slug: `test-cat-${Date.now()}`,
        isActive: true
      });

      const loc = await FulfillmentLocation.create({
        merchantScopeId: 'default',
        locationCode: `WH-PUB-${Date.now().toString().slice(-4)}`,
        displayName: 'Public Store Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        supportedMarketCountries: ['PK'],
        isDefault: true
      });

      // In-stock product
      const inStockProd = await Product.create({
        name: `In Stock Product ${Date.now()}`,
        slug: `in-stock-${Date.now()}`,
        sku: `IN-${Date.now().toString().slice(-4)}`,
        status: 'published',
        isActive: true,
        category: cat._id,
        price: 1200,
        stock: 10
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: inStockProd._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: inStockProd._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        currencyExponent: 2,
        amountMinor: MoneyMapper.fromLegacy(1200, 'PKR').amountMinor.toString(),
        priceSource: 'manual',
        status: 'active',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });

      await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: loc._id,
        locationCode: loc.locationCode,
        productId: inStockProd._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: inStockProd.sku,
        onHand: 10,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0
      });

      // Out-of-stock product
      const oosProd = await Product.create({
        name: `OOS Product ${Date.now()}`,
        slug: `oos-prod-${Date.now()}`,
        sku: `OOS-${Date.now().toString().slice(-4)}`,
        status: 'published',
        isActive: true,
        category: cat._id,
        price: 1200,
        stock: 0
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: oosProd._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: oosProd._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        currencyExponent: 2,
        amountMinor: MoneyMapper.fromLegacy(1200, 'PKR').amountMinor.toString(),
        priceSource: 'manual',
        status: 'active',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });

      await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: loc._id,
        locationCode: loc.locationCode,
        productId: oosProd._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: oosProd.sku,
        onHand: 0,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0
      });

      // Public product detail
      const resInStock = await request(app).get(`/api/products/${inStockProd._id}`);
      expect(resInStock.status).toBe(200);
      expect(resInStock.body.data.stockStatus).toBe('in_stock');
      expect(resInStock.body.data.isPurchasable).toBe(true);
      // Ensure exact internal quantities are NOT leaked
      expect(resInStock.body.data.exactStock).toBeUndefined();

      const resOos = await request(app).get(`/api/products/${oosProd._id}`);
      expect(resOos.status).toBe(200);
      expect(resOos.body.data.stockStatus).toBe('out_of_stock');
      expect(resOos.body.data.isPurchasable).toBe(false);
    });
  });

  describe('Fulfillment Location Default Lifecycle Handover (§13)', () => {
    it('demotes previous active default safely when a new default location is promoted', async () => {
      const locA = await FulfillmentLocation.create({
        merchantScopeId: 'default',
        locationCode: `WH-DEF-A-${Date.now().toString().slice(-4)}`,
        displayName: 'Old Default Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        isDefault: true
      });

      expect(locA.isDefault).toBe(true);

      const res = await request(app)
        .post('/api/inventory/locations')
        .set('Authorization', adminAuth.token)
        .send({
          locationCode: `WH-DEF-B-${Date.now().toString().slice(-4)}`,
          displayName: 'New Default Hub',
          status: 'active',
          countryCode: 'PK',
          city: 'Karachi',
          timeZone: 'Asia/Karachi',
          isDefault: true
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isDefault).toBe(true);

      const oldLoc = await FulfillmentLocation.findById(locA._id);
      expect(oldLoc.isDefault).toBe(false);

      // Verify only one active default exists
      const activeDefaults = await FulfillmentLocation.find({
        merchantScopeId: 'default',
        isDefault: true,
        status: 'active'
      });
      expect(activeDefaults.length).toBe(1);
    });
  });

  describe('RBAC & Zod Schema Validation (§10)', () => {
    it('rejects invalid ObjectId and malformed fields with Zod validation errors', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth.token)
        .send({
          productId: 'invalid-object-id',
          type: 'in',
          quantity: -5,
          reason: 'ab',
          operationKey: 'not-a-uuid'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects allocation preview with negative quantities or missing destination country', async () => {
      const res = await request(app)
        .post('/api/inventory/allocations/preview')
        .set('Authorization', adminAuth.token)
        .send({
          items: [{ productId: String(testProduct._id), quantity: -1 }],
          destinationCountry: 'INVALID'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
