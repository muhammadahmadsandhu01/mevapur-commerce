const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const InventoryTransaction = require('../../models/InventoryTransaction');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const MarketConfig = require('../../models/MarketConfig');
const ShippingZone = require('../../models/ShippingZone');
const Category = require('../../models/Category');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const { MoneyMapper } = require('../../modules/commerce');

let sequence = 0;
let defaultCategory = null;
const getOrCreateCoreCategory = async () => {
  if (!defaultCategory) {
    defaultCategory = await Category.create({
      name: 'Commercial Core Category',
      slug: `core-cat-${crypto.randomUUID()}`,
      isActive: true
    });
  }
  return defaultCategory;
};

const auth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({ email: `core-${sequence}@example.test`, role });
  const session = await Session.create({ user: user._id, refreshTokenHash: crypto.randomBytes(32).toString('hex'), tokenFamilyId: crypto.randomUUID(), isActive: true, isRevoked: false, expiresAt: new Date(Date.now() + 3600000) });
  const token = TokenService.generateAccessToken({ userId: user._id, sessionId: session._id, tokenVersion: user.tokenVersion });
  return { user, authorization: `Bearer ${token}` };
};
const product = async (overrides = {}) => {
  sequence += 1;
  let catId = overrides.category;
  if (catId === undefined) {
    const cat = await Category.create({
      name: `Core Category ${crypto.randomUUID()}`,
      slug: `core-cat-${crypto.randomUUID()}`,
      isActive: true
    });
    catId = cat._id;
  }
  const variants = Array.isArray(overrides.variants)
    ? overrides.variants.map((v) => ({
        ...v,
        weightGrams: v.weightGrams !== undefined ? v.weightGrams : (overrides.weightGrams !== undefined ? overrides.weightGrams : 500)
      }))
    : undefined;

  const prodData = {
    name: `Core Product ${sequence}`,
    slug: `core-product-${sequence}`,
    description: 'Commercial core integration product',
    sku: `CORE-${sequence}`,
    price: 100,
    stock: 10,
    weightGrams: overrides.weightGrams !== undefined ? overrides.weightGrams : 500,
    status: 'published',
    isActive: true,
    category: catId,
    countryOfOrigin: 'PK',
    hsClassification: {
      code: '080232',
      systemVersion: 'HS_2022',
      jurisdiction: 'WCO'
    },
    declaredValueEligibility: 'ELIGIBLE',
    dangerousGoodsClassification: 'NOT_RESTRICTED',
    ...overrides
  };
  if (variants) {
    prodData.variants = variants;
  }
  const prod = await Product.create(prodData);

  const priceNum = prod.price !== undefined ? prod.price : 100;
  await ProductMarketOffering.create({
    merchantScopeId: 'default',
    productId: prod._id,
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
    productId: prod._id,
    scopeType: 'product',
    scopeKey: 'product',
    marketCountry: 'PK',
    currency: 'PKR',
    currencyExponent: 2,
    amountMinor: MoneyMapper.fromLegacy(priceNum, 'PKR').amountMinor.toString(),
    priceSource: 'manual',
    status: 'active',
    effectiveFrom: new Date(Date.now() - 60000),
    lockVersion: 1
  });

  const defaultLocation = await FulfillmentLocation.findOneAndUpdate(
    { merchantScopeId: 'default', locationCode: 'WH-PRIMARY-01' },
    {
      $set: {
        merchantScopeId: 'default',
        locationCode: 'WH-PRIMARY-01',
        displayName: 'Primary Fulfillment Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        priority: 100,
        supportedMarketCountries: ['PK', 'US'],
        supportedServiceLevels: ['standard', 'express'],
        capabilities: ['local_delivery', 'cross_border'],
        returnCapabilities: ['accept_returns', 'inspection', 'restock'],
        isDefault: true
      }
    },
    { upsert: true, new: true }
  );

  if (prod.variants && prod.variants.length > 0) {
    for (const v of prod.variants) {
      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: prod._id,
        variantId: v._id,
        sku: v.sku,
        scopeType: 'variant',
        scopeKey: String(v._id),
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });

      const varPrice = v.salePrice > 0 ? v.salePrice : (v.price || priceNum);
      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: prod._id,
        variantId: v._id,
        sku: v.sku,
        scopeType: 'variant',
        scopeKey: String(v._id),
        marketCountry: 'PK',
        currency: 'PKR',
        currencyExponent: 2,
        amountMinor: MoneyMapper.fromLegacy(varPrice, 'PKR').amountMinor.toString(),
        priceSource: 'manual',
        status: 'active',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });

      await InventoryPosition.findOneAndUpdate(
        {
          merchantScopeId: 'default',
          locationId: defaultLocation._id,
          productId: prod._id,
          variantId: v._id,
          scopeType: 'variant',
          scopeKey: String(v._id)
        },
        {
          $set: {
            merchantScopeId: 'default',
            locationId: defaultLocation._id,
            locationCode: defaultLocation.locationCode,
            productId: prod._id,
            variantId: v._id,
            scopeType: 'variant',
            scopeKey: String(v._id),
            canonicalSku: v.sku || `SKU-${v._id}`,
            onHand: v.stock !== undefined ? v.stock : 10,
            reserved: 0,
            unavailable: 0,
            safetyStock: 0,
            backordered: 0,
            reorderPoint: 5
          }
        },
        { upsert: true, new: true }
      );
    }
  } else {
    await InventoryPosition.findOneAndUpdate(
      {
        merchantScopeId: 'default',
        locationId: defaultLocation._id,
        productId: prod._id,
        scopeType: 'product',
        scopeKey: 'product'
      },
      {
        $set: {
          merchantScopeId: 'default',
          locationId: defaultLocation._id,
          locationCode: defaultLocation.locationCode,
          productId: prod._id,
          scopeType: 'product',
          scopeKey: 'product',
          canonicalSku: prod.sku,
          onHand: prod.stock !== undefined ? prod.stock : 10,
          reserved: 0,
          unavailable: 0,
          safetyStock: 0,
          backordered: 0,
          reorderPoint: 5
        }
      },
      { upsert: true, new: true }
    );
  }

  return prod;
};
const orderPayload = (item) => ({
  items: [{ productId: String(item._id), quantity: 1 }],
  shippingAddress: { fullName: 'Core Customer', phone: '03001234567', address: '12 Commercial Core Street', city: 'Lahore', province: 'Punjab', country: 'PK' },
  paymentMethod: 'cod', currency: 'PKR'
});

describe('P6A commercial core contracts', () => {
  let prevCompat;
  beforeAll(async () => {
    prevCompat = process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY;
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = 'true';
    await Promise.all([Product.syncIndexes(), Order.syncIndexes(), InventoryTransaction.syncIndexes(), MarketConfig.syncIndexes(), ShippingZone.syncIndexes(), FulfillmentLocation.syncIndexes(), InventoryPosition.syncIndexes()]);
  });

  afterAll(async () => {
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = prevCompat;
  });

  beforeEach(async () => {
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
        enabledCountries: ['PK'],
        enabledCurrencies: ['PKR'],
        sellingMode: 'domestic',
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        supportedIncoterms: ['DOMESTIC'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [
          {
            originId: 'origin-pk-main',
            name: 'Main Pakistan Warehouse',
            country: 'PK',
            subdivision: 'IS',
            city: 'Lahore',
            postalCode: '54000',
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
          remoteCities: ['RemoteTown'],
          weightBands: [],
          postalCodeRanges: [],
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          supportedIncoterms: ['DOMESTIC'],
          enabled: true,
          priority: 10
        }
      ],
      taxRules: [
        {
          ruleId: 'tax-pk-domestic',
          name: 'PK Domestic Zero Rating',
          destinationCountry: 'PK',
          taxType: 'VAT',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRateNumerator: 0,
          taxRateDenominator: 100,
          roundingMode: 'HALF_EVEN',
          roundingScope: 'subtotal',
          incoterm: 'DOMESTIC',
          effectiveFrom: new Date(Date.now() - 60000),
          effectiveTo: null,
          sourceAuthority: 'FBR SRO',
          sourceReference: 'SRO 2026',
          sourcePublicationDate: new Date(Date.now() - 60000),
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          enabled: true
        }
      ]
    });
  });

  test('validates the canonical product query and rejects unsupported parameters', async () => {
    const first = await product({ price: 20 });
    const second = await product({ price: 200 });
    const response = await request(app).get(`/api/products?keyword=${encodeURIComponent('Core Product')}&minPrice=10&maxPrice=100&inStock=true&sortBy=price-asc&page=1&limit=10`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((entry) => String(entry._id))).toContain(String(first._id));
    expect(response.body.data.map((entry) => String(entry._id))).not.toContain(String(second._id));
    const invalid = await request(app).get('/api/products?search=legacy');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('COMMERCIAL_CORE_VALIDATION_FAILED');
  });

  test('uses configuration data for thresholds, remote shipping and country eligibility', async () => {
    const prod = await product({ price: 100, stock: 100 });
    const normal = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(prod._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Core Customer',
          phone: '03001234567',
          address: '12 Commercial Core Street',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });
    expect(normal.status).toBe(200);
    expect(normal.body.data.quote.totals.shipping).toBe(250);
    expect(normal.body.data.quote.shipping.deliveryPromise.deliveryMinDays).toBe(2);

    const free = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(prod._id), quantity: 50 }],
        shippingAddress: {
          fullName: 'Core Customer',
          phone: '03001234567',
          address: '12 Commercial Core Street',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });
    expect(free.status).toBe(200);
    expect(free.body.data.quote.totals.shipping).toBe(0);

    await CommerceConfigurationVersion.updateOne(
      { merchantScopeId: 'default', status: 'active' },
      { $set: { 'shippingRules.0.baseRateExact': MoneyMapper.fromLegacy(275, 'PKR') } }
    );
    const changed = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(prod._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Core Customer',
          phone: '03001234567',
          address: '12 Commercial Core Street',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });
    expect(changed.status).toBe(200);
    expect(changed.body.data.quote.totals.shipping).toBe(275);

    const remote = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(prod._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Core Customer',
          phone: '03001234567',
          address: '12 Commercial Core Street',
          city: 'RemoteTown',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });
    expect(remote.status).toBe(200);
    expect(remote.body.data.quote.totals.shipping).toBe(350);
    expect(remote.body.data.quote.shipping.selectedOption.isRemote).toBe(true);

    const unavailable = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(prod._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Core Customer',
          phone: '+1 555 1234567',
          address: '123 Main St',
          city: 'New York',
          province: 'NY',
          postalCode: '10001',
          country: 'US'
        },
        currency: 'USD'
      });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error.code).toBe('MARKET_COUNTRY_INELIGIBLE');
  });

  test('enforces admin-only, atomic and idempotent inventory adjustments including variants', async () => {
    const [admin, customer] = await Promise.all([auth('admin'), auth()]);
    const root = await product();
    const denied = await request(app).post('/api/inventory/adjust').set('Authorization', customer.authorization).send({ productId: String(root._id), type: 'out', quantity: 1, reason: 'Denied' });
    expect(denied.status).toBe(403);
    const key = crypto.randomUUID();
    const first = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(root._id), type: 'out', quantity: 3, reason: 'Cycle count', operationKey: key });
    expect(first.status).toBe(200);
    expect(first.body.data.product.newStock).toBe(7);
    const replay = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(root._id), type: 'out', quantity: 3, reason: 'Cycle count', operationKey: key });
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect((await Product.findById(root._id)).stock).toBe(7);
    expect(await InventoryTransaction.countDocuments({ product: root._id })).toBe(1);
    const insufficient = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(root._id), type: 'out', quantity: 8, reason: 'Invalid', operationKey: crypto.randomUUID() });
    expect(insufficient.status).toBe(409);
    const variantProduct = await product({ variants: [{ sku: `CORE-V-${sequence}`, attributes: [{ name: 'Size', value: 'M' }], price: 100, stock: 4, isDefault: false }] });
    const variant = variantProduct.variants[0];
    const variantResponse = await request(app).post('/api/inventory/adjust').set('Authorization', admin.authorization).send({ productId: String(variantProduct._id), variantId: String(variant._id), type: 'out', quantity: 2, reason: 'Variant count', operationKey: crypto.randomUUID() });
    expect(variantResponse.status).toBe(200);
    expect((await Product.findById(variantProduct._id)).variants.id(variant._id).stock).toBe(2);
  });

  test('updates tracking without mutating payment state', async () => {
    const [customer, admin] = await Promise.all([auth(), auth('admin')]);
    const item = await product();
    const created = await request(app).post('/api/orders').set('Authorization', customer.authorization).set('Idempotency-Key', crypto.randomUUID()).send(orderPayload(item));
    expect(created.status).toBe(201);
    const orderId = created.body.data.order._id;
    const denied = await request(app).put(`/api/orders/${orderId}/tracking`).set('Authorization', customer.authorization).send({ trackingNumber: 'T-123' });
    expect(denied.status).toBe(403);
    const updated = await request(app).put(`/api/orders/${orderId}/tracking`).set('Authorization', admin.authorization).send({ courierCompany: 'TCS', trackingNumber: 'T-123' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.order).toMatchObject({ courierCompany: 'TCS', trackingNumber: 'T-123', paymentStatus: 'Pending' });
    const invalid = await request(app).put(`/api/orders/${orderId}/tracking`).set('Authorization', admin.authorization).send({ trackingNumber: 'x'.repeat(101) });
    expect(invalid.status).toBe(400);
  });
});
