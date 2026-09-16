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
const MarketConfig = require('../../models/MarketConfig');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryTransaction = require('../../models/InventoryTransaction');
const AuditLog = require('../../models/AuditLog');
const assistantReadTools = require('../../modules/assistant/tools/assistantReadTools');
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
  let testCategory;
  let testProduct;

  beforeEach(async () => {
    adminAuth = await getAuthToken('admin');
    superAdminAuth = await getAuthToken('super_admin');
    inventoryStaffAuth = await getAuthToken('inventory');
    customerAuth = await getAuthToken('customer');

    await MarketConfig.deleteMany({});
    await MarketConfig.create({
      key: 'default',
      merchantCountry: 'PK',
      homeCountry: 'PK',
      fulfillmentOriginCountry: 'PK',
      returnDestinationCountry: 'PK',
      sellingMode: 'hybrid',
      enabledCountries: ['PK', 'AE', 'GB', 'DE', 'US'],
      baseCurrency: 'PKR',
      defaultCurrency: 'PKR',
      enabledCurrencies: ['PKR', 'AED', 'GBP', 'EUR', 'USD'],
      isEnabled: true
    });

    await CommerceConfigurationVersion.deleteMany({});
    await CommerceConfigurationVersion.create({
      merchantScopeId: 'default',
      version: 1,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      effectiveTo: null,
      lockVersion: 1,
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        enabledCountries: ['PK', 'AE', 'GB', 'DE', 'US'],
        enabledCurrencies: ['PKR', 'AED', 'GBP', 'EUR', 'USD'],
        sellingMode: 'hybrid',
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [
          {
            originId: 'origin-pk-main',
            name: 'Main Pakistan Warehouse',
            country: 'PK',
            subdivision: 'IS',
            city: 'Islamabad',
            postalCode: '44000',
            line1: 'Industrial Area',
            timeZone: 'Asia/Karachi',
            isDefault: true,
            enabled: true
          }
        ]
      },
      shippingRules: [
        {
          ruleId: 'rule-pk-standard',
          name: 'Pakistan Domestic Standard',
          serviceCode: 'standard',
          displayName: 'Standard Delivery (TCS)',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
          freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
          remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
          remoteCities: ['Gwadar', 'Skardu'],
          deliveryMinDays: 2,
          deliveryMaxDays: 5,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          weightBands: [
            { minWeightGrams: 0, maxWeightGrams: 50000, rateExact: MoneyMapper.fromLegacy(250, 'PKR'), pricingMode: 'REPLACE_BASE' }
          ],
          supportedIncoterms: ['DOMESTIC'],
          priority: 10,
          enabled: true
        }
      ],
      markets: [
        {
          marketCountry: 'PK',
          currency: 'PKR',
          currencyExponent: 2,
          isDomestic: true,
          status: 'active',
          supportedServiceLevels: ['standard'],
          settlementCurrency: 'PKR'
        }
      ]
    });

    testCategory = await Category.create({
      name: `Category ${Date.now()}`,
      slug: `category-${Date.now()}`,
      isActive: true
    });

    testProduct = await Product.create({
      name: `Almonds Premium ${Date.now()}`,
      slug: `almonds-premium-${Date.now()}`,
      sku: `ALM-${Date.now().toString().slice(-4)}`,
      status: 'published',
      isActive: true,
      category: testCategory._id,
      price: 1500,
      stock: 50,
      weightGrams: 500,
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

  describe('Zero Read Side-Effects Suite (§3, Blocker 5)', () => {
    async function takeDatabaseSnapshots() {
      const [locations, positions, reservations, ledgers, products, auditLogs] = await Promise.all([
        FulfillmentLocation.find({}).lean(),
        InventoryPosition.find({}).lean(),
        InventoryReservation.find({}).lean(),
        InventoryLedger.find({}).lean(),
        Product.find({}).select('stock').lean(),
        AuditLog.find({}).lean()
      ]);
      return {
        locationCount: locations.length,
        positionCount: positions.length,
        reservationCount: reservations.length,
        ledgerCount: ledgers.length,
        productCount: products.length,
        auditLogCount: auditLogs.length,
        locations,
        positions,
        reservations,
        ledgers,
        products,
        auditLogs
      };
    }

    it('performs zero writes during public listing, detail, assistant search, assistant detail, and quote with configured inventory', async () => {
      // 1. Seed canonical location, position, price book and offering
      const loc = await FulfillmentLocation.create({
        merchantScopeId: 'default',
        locationCode: `WH-READ-TEST-${Date.now().toString().slice(-4)}`,
        displayName: 'Read Test Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        priority: 1,
        supportedMarketCountries: ['PK', 'GB'],
        isDefault: true
      });

      await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: loc._id,
        locationCode: loc.locationCode,
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: testProduct.sku,
        onHand: 20,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        lockVersion: 1
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        purchasable: true,
        version: 1
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        amountMinor: 150000,
        status: 'active',
        version: 1
      });

      const before = await takeDatabaseSnapshots();

      // 1. GET public product listing
      const listRes = await request(app).get('/api/products').query({ market: 'PK' });
      expect(listRes.status).toBe(200);

      // 2. GET public product detail
      const detailRes = await request(app).get(`/api/products/${testProduct._id}`).query({ market: 'PK' });
      expect(detailRes.status).toBe(200);

      // 3. Assistant product search
      const assistantSearchRes = await assistantReadTools.searchPublicProducts({
        query: 'Almonds',
        marketCountry: 'PK'
      });
      expect(Array.isArray(assistantSearchRes)).toBe(true);

      // 4. Assistant product detail
      const assistantDetailRes = await assistantReadTools.getPublicProductDetails({
        productId: String(testProduct._id),
        marketCountry: 'PK'
      });
      expect(assistantDetailRes).not.toBeNull();

      // 5. Checkout quote generation
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProduct._id), quantity: 2 }],
          shippingAddress: {
            fullName: 'Test Customer',
            phone: '+923001234567',
            address: '123 Main Street',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            country: 'Pakistan',
            countryCode: 'PK'
          },
          currency: 'PKR'
        });
      expect([200, 201]).toContain(quoteRes.status);

      const after = await takeDatabaseSnapshots();

      // Absolute zero-write assertions
      expect(after.locationCount).toBe(before.locationCount);
      expect(after.positionCount).toBe(before.positionCount);
      expect(after.reservationCount).toBe(before.reservationCount);
      expect(after.ledgerCount).toBe(before.ledgerCount);
      expect(after.productCount).toBe(before.productCount);
      expect(after.auditLogCount).toBe(before.auditLogCount);
    });

    it('performs zero writes and fails closed when fulfillment infrastructure is completely missing', async () => {
      // Create isolated product with no locations or positions in database
      const isolatedProduct = await Product.create({
        name: `Isolated Product ${Date.now()}`,
        slug: `isolated-product-${Date.now()}`,
        sku: `ISO-${Date.now().toString().slice(-4)}`,
        status: 'published',
        isActive: true,
        category: testCategory._id,
        price: 3000,
        stock: 10,
        weightGrams: 500
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: isolatedProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        purchasable: true,
        version: 1
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: isolatedProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        amountMinor: 300000,
        status: 'active',
        version: 1
      });

      // Clear all locations and positions to simulate completely unconfigured system
      await FulfillmentLocation.deleteMany({});
      await InventoryPosition.deleteMany({});
      await InventoryLedger.deleteMany({});
      await InventoryReservation.deleteMany({});

      const before = await takeDatabaseSnapshots();
      expect(before.locationCount).toBe(0);
      expect(before.positionCount).toBe(0);

      // 1. GET public product listing (must return gracefully without auto-provisioning)
      const listRes = await request(app).get('/api/products').query({ market: 'PK' });
      expect(listRes.status).toBe(200);

      // 2. GET public product detail (must return out_of_stock / unavailable_in_market / not purchasable without provisioning)
      const detailRes = await request(app).get(`/api/products/${isolatedProduct._id}`).query({ market: 'PK' });
      expect(detailRes.status).toBe(200);
      expect(['out_of_stock', 'unavailable_in_market']).toContain(detailRes.body.data.stockStatus);
      expect(detailRes.body.data.isPurchasable).toBe(false);

      // 3. Assistant product search
      const assistantSearchRes = await assistantReadTools.searchPublicProducts({
        query: 'Isolated',
        marketCountry: 'PK'
      });
      expect(Array.isArray(assistantSearchRes)).toBe(true);

      // 4. Assistant product detail
      const assistantDetailRes = await assistantReadTools.getPublicProductDetails({
        productId: String(isolatedProduct._id),
        marketCountry: 'PK'
      });
      if (assistantDetailRes) {
        expect(assistantDetailRes.inStock).toBe(false);
      }

      // 5. Checkout quote generation (must fail closed due to missing inventory)
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(isolatedProduct._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Test Customer',
            phone: '+923001234567',
            address: '123 Main Street',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            country: 'Pakistan',
            countryCode: 'PK'
          },
          currency: 'PKR'
        });
      expect([400, 404, 409, 422]).toContain(quoteRes.status);

      const after = await takeDatabaseSnapshots();

      // Zero-write assertions on unconfigured system: no locations or positions auto-created
      expect(after.locationCount).toBe(0);
      expect(after.positionCount).toBe(0);
      expect(after.reservationCount).toBe(0);
      expect(after.ledgerCount).toBe(0);
    });
  });

  describe('Tenant Authority & Negative Cross-Tenant Isolation Suite (§10, Blocker 3)', () => {
    it('proves Tenant A cannot read, mutate, or control Tenant B inventory', async () => {
      // Seed Tenant A location and position
      const locA = await FulfillmentLocation.create({
        merchantScopeId: 'tenant-a',
        locationCode: `WH-TENA-${Date.now().toString().slice(-4)}`,
        displayName: 'Tenant A Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        priority: 1,
        supportedMarketCountries: ['PK'],
        isDefault: true
      });

      const posA = await InventoryPosition.create({
        merchantScopeId: 'tenant-a',
        locationId: locA._id,
        locationCode: locA.locationCode,
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: testProduct.sku,
        onHand: 100,
        reserved: 0,
        unavailable: 0,
        safetyStock: 10,
        allowBackorder: false,
        lockVersion: 1
      });

      // Seed Tenant B location and position
      const locB = await FulfillmentLocation.create({
        merchantScopeId: 'tenant-b',
        locationCode: `WH-TENB-${Date.now().toString().slice(-4)}`,
        displayName: 'Tenant B Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Karachi',
        timeZone: 'Asia/Karachi',
        priority: 1,
        supportedMarketCountries: ['PK'],
        isDefault: true
      });

      const posB = await InventoryPosition.create({
        merchantScopeId: 'tenant-b',
        locationId: locB._id,
        locationCode: locB.locationCode,
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: testProduct.sku,
        onHand: 50,
        reserved: 0,
        unavailable: 0,
        safetyStock: 5,
        allowBackorder: false,
        lockVersion: 1
      });

      // Create admin user for Tenant A
      const userA = await global.createTestUser({
        email: `tenant-a-admin-${Date.now()}@example.test`,
        role: 'admin'
      });
      userA.merchantScopeId = 'tenant-a';
      await userA.save();

      const sessionA = await Session.create({
        user: userA._id,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        tokenFamilyId: crypto.randomUUID(),
        isActive: true,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000)
      });

      const tokenA = `Bearer ${TokenService.generateAccessToken({
        userId: userA._id,
        sessionId: sessionA._id,
        tokenVersion: userA.tokenVersion
      })}`;

      // 1. Tenant A listing locations only returns Tenant A locations
      const listLocRes = await request(app)
        .get('/api/inventory/locations')
        .set('Authorization', tokenA);

      expect(listLocRes.status).toBe(200);
      const locIds = listLocRes.body.data.map((l) => String(l._id));
      expect(locIds).toContain(String(locA._id));
      expect(locIds).not.toContain(String(locB._id));

      // 2. Tenant A trying to get Tenant B location by ID fails (404)
      const getBLocRes = await request(app)
        .get(`/api/inventory/locations/${locB._id}`)
        .set('Authorization', tokenA);
      expect(getBLocRes.status).toBe(404);

      // 3. Tenant A trying to update Tenant B location fails (404)
      const updateBLocRes = await request(app)
        .put(`/api/inventory/locations/${locB._id}`)
        .set('Authorization', tokenA)
        .send({ displayName: 'Hacked Tenant B Hub' });
      expect(updateBLocRes.status).toBe(404);

      // 4. Tenant A trying to get Tenant B position by ID fails (404)
      const getBPosRes = await request(app)
        .get(`/api/inventory/positions/${posB._id}`)
        .set('Authorization', tokenA);
      expect(getBPosRes.status).toBe(404);

      // 5. Tenant A trying to update Tenant B position controls fails (404)
      const updateBPosRes = await request(app)
        .put(`/api/inventory/positions/${posB._id}/controls`)
        .set('Authorization', tokenA)
        .send({ safetyStock: 99 });
      expect(updateBPosRes.status).toBe(404);

      // 6. Tenant A passing client-supplied ?merchantScopeId=tenant-b is ignored
      const spoofRes = await request(app)
        .get('/api/inventory/locations?merchantScopeId=tenant-b')
        .set('Authorization', tokenA);
      expect(spoofRes.status).toBe(200);
      const spoofLocIds = spoofRes.body.data.map((l) => String(l._id));
      expect(spoofLocIds).not.toContain(String(locB._id));
    });
  });
});
