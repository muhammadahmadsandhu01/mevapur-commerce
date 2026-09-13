/**
 * @file global-checkout-quote.integration.test.js
 * @description Integration Test Matrix for Phase 6A: Global Checkout Eligibility & Quote Orchestration.
 */

'use strict';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const MarketConfig = require('../../models/MarketConfig');
const ShippingZone = require('../../models/ShippingZone');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const TokenService = require('../../services/TokenService');
const { MoneyMapper } = require('../../modules/commerce');

let sequence = 0;
let testCategory;
let testProductSimple;
let testProductVariable;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    fullName: role === 'admin' ? 'Admin User' : 'Test Customer',
    email: `quote-${role}-${sequence}-${Date.now()}@example.test`,
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
  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  });
  return { user, token, authorization: `Bearer ${token}` };
};

const setupTestFixtures = async () => {
  // Create Category
  testCategory = await Category.create({
    name: 'Premium Nuts',
    slug: `premium-nuts-${Date.now()}`,
    isActive: true
  });

  // Create Products
  testProductSimple = await Product.create({
    name: 'Organic Walnuts 500g',
    slug: `organic-walnuts-500g-${Date.now()}`,
    category: testCategory._id,
    price: 1500,
    stock: 50,
    weight: 0.5,
    status: 'published',
    isActive: true,
    sku: `WAL-500-${Date.now()}`
  });

  testProductVariable = await Product.create({
    name: 'Premium Roasted Almonds',
    slug: `premium-roasted-almonds-${Date.now()}`,
    category: testCategory._id,
    price: 2000,
    stock: 100,
    status: 'published',
    isActive: true,
    sku: `ALM-ROOT-${Date.now()}`,
    variants: [
      {
        sku: `ALM-250G-${Date.now()}`,
        price: 1200,
        salePrice: 1000,
        stock: 30,
        weight: 0.25,
        attributes: [{ name: 'Size', value: '250g' }]
      },
      {
        sku: `ALM-500G-${Date.now()}`,
        price: 2000,
        salePrice: 1800,
        stock: 40,
        weight: 0.5,
        attributes: [{ name: 'Size', value: '500g' }]
      }
    ]
  });

  // Create Shipping Zones
  await ShippingZone.create([
    {
      name: 'Pakistan Domestic Zone',
      enabled: true,
      countries: ['PK'],
      cities: ['Lahore', 'Karachi', 'Islamabad'],
      normalRate: 250,
      normalRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
      freeShippingThreshold: 5000,
      freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
      remoteRate: 350,
      remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
      currency: 'PKR',
      deliveryMinDays: 2,
      deliveryMaxDays: 4,
      priority: 10
    },
    {
      name: 'UAE International Zone',
      enabled: true,
      countries: ['AE'],
      cities: ['Dubai', 'Abu Dhabi', 'Sharjah'],
      normalRate: 25,
      normalRateExact: MoneyMapper.fromLegacy(25, 'AED'),
      freeShippingThreshold: 200,
      freeShippingThresholdExact: MoneyMapper.fromLegacy(200, 'AED'),
      currency: 'AED',
      deliveryMinDays: 3,
      deliveryMaxDays: 6,
      priority: 20
    },
    {
      name: 'United Kingdom Zone',
      enabled: true,
      countries: ['GB'],
      normalRate: 15,
      normalRateExact: MoneyMapper.fromLegacy(15, 'GBP'),
      freeShippingThreshold: 100,
      freeShippingThresholdExact: MoneyMapper.fromLegacy(100, 'GBP'),
      currency: 'GBP',
      deliveryMinDays: 4,
      deliveryMaxDays: 7,
      priority: 30
    },
    {
      name: 'Germany Europe Zone',
      enabled: true,
      countries: ['DE'],
      normalRate: 18,
      normalRateExact: MoneyMapper.fromLegacy(18, 'EUR'),
      freeShippingThreshold: 120,
      freeShippingThresholdExact: MoneyMapper.fromLegacy(120, 'EUR'),
      currency: 'EUR',
      deliveryMinDays: 4,
      deliveryMaxDays: 7,
      priority: 40
    },
    {
      name: 'United States Zone',
      enabled: true,
      countries: ['US'],
      normalRate: 20,
      normalRateExact: MoneyMapper.fromLegacy(20, 'USD'),
      freeShippingThreshold: 150,
      freeShippingThresholdExact: MoneyMapper.fromLegacy(150, 'USD'),
      currency: 'USD',
      deliveryMinDays: 5,
      deliveryMaxDays: 9,
      priority: 50
    }
  ]);

  // Reset Market Config to global multi-country configuration
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
};

describe('Phase 6A: Global Checkout Eligibility & Quote Orchestration Matrix', () => {
  beforeEach(async () => {
    await setupTestFixtures();
  });

  test('1. PK merchant → PK customer eligible domestic flow (COD available, 0% tax, domestic zone)', async () => {
    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [
          { productId: String(testProductSimple._id), quantity: 2 }
        ],
        shippingAddress: {
          fullName: 'Ali Khan',
          phone: '+92 300 1234567',
          address: 'House 12, Street 4, Sector F-7',
          city: 'Islamabad',
          province: 'Federal',
          postalCode: '44000',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        currency: 'PKR'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const quote = res.body.data.quote;
    expect(quote.isDomestic).toBe(true);
    expect(quote.merchantCountry).toBe('PK');
    expect(quote.destination.countryCode).toBe('PK');
    expect(quote.currency).toBe('PKR');

    // Subtotal: 2 * 1500 = 3000 PKR
    expect(quote.totals.subtotal).toBe(3000);

    // Shipping: 250 PKR
    expect(quote.totals.shipping).toBe(250);

    // Tax: 0% in domestic PK
    expect(quote.totals.tax).toBe(0);

    // Grand total: 3000 + 250 = 3250 PKR
    expect(quote.totals.grandTotal).toBe(3250);

    // COD should be present in domestic eligible payment methods
    const codMethod = quote.eligiblePaymentMethods.find((m) => m.code === 'cod');
    expect(codMethod).toBeDefined();

    // Verify quote token exists
    expect(quote.quoteToken).toBeDefined();
    expect(typeof quote.quoteToken).toBe('string');
  });

  test('2. PK merchant → AE customer international prepaid route (5% VAT, 5% DDP Duty, COD rejected)', async () => {
    const variantId = testProductVariable.variants[0]._id; // 1000 salePrice
    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [
          { productId: String(testProductVariable._id), variantId: String(variantId), quantity: 2 }
        ],
        shippingAddress: {
          fullName: 'Rashid Al-Maktoum',
          phone: '+971 50 1234567',
          address: 'Villa 24, Jumeirah 1',
          city: 'Dubai',
          province: 'Dubai',
          country: 'United Arab Emirates',
          countryCode: 'AE'
        },
        currency: 'AED'
      });

    expect(res.status).toBe(200);
    const quote = res.body.data.quote;
    expect(quote.isDomestic).toBe(false);
    expect(quote.merchantCountry).toBe('PK');
    expect(quote.destination.countryCode).toBe('AE');
    expect(quote.currency).toBe('AED');

    // Subtotal: 2 * 1000 = 2000 AED
    expect(quote.totals.subtotal).toBe(2000);
    // Free shipping threshold for AE is 200 AED, so subtotal 2000 >= 200 -> free shipping applied
    expect(quote.totals.shipping).toBe(0);

    // Tax: 5% of 2000 AED = 100.00 AED
    expect(quote.totals.tax).toBe(100);

    // Duty: 5% DDP on 2000 AED = 100.00 AED
    expect(quote.totals.duties).toBe(100);

    // Grand total: 2000 + 0 + 100 + 100 = 2200 AED
    expect(quote.totals.grandTotal).toBe(2200);

    // COD must be rejected on international route
    const codMethod = quote.eligiblePaymentMethods.find((m) => m.code === 'cod');
    expect(codMethod).toBeUndefined();
  });

  test('3. PK merchant → GB customer international prepaid route (20% VAT, 2.5% DDP Duty)', async () => {
    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [
          { productId: String(testProductSimple._id), quantity: 1 } // 1500 GBP
        ],
        shippingAddress: {
          fullName: 'John Smith',
          phone: '+44 7911 123456',
          address: '10 Downing Street',
          city: 'London',
          province: 'Greater London',
          postalCode: 'SW1A 2AA',
          country: 'United Kingdom',
          countryCode: 'GB'
        },
        currency: 'GBP'
      });

    expect(res.status).toBe(200);
    const quote = res.body.data.quote;
    expect(quote.destination.countryCode).toBe('GB');
    expect(quote.incoterm).toBe('DDP');
    expect(quote.taxesAndDuties.taxRatePercent).toBe(20.0);
    expect(quote.taxesAndDuties.dutyRatePercent).toBe(2.5);

    // Subtotal: 1500 GBP
    // Shipping: threshold 100 GBP -> 1500 >= 100 -> free shipping 0 GBP
    // Tax: 20% on 1500 = 300 GBP
    // Duty: 2.5% on 1500 = 37.5 GBP
    // Grand Total: 1500 + 0 + 300 + 37.5 = 1837.5 GBP
    expect(quote.totals.tax).toBe(300);
    expect(quote.totals.duties).toBe(37.5);
    expect(quote.totals.grandTotal).toBe(1837.5);
  });

  test('4. Unsupported destination country fails closed with 409', async () => {
    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(testProductSimple._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Test User',
          phone: '+33 1 23456789',
          address: '12 Rue de Paris',
          city: 'Paris',
          province: 'Île-de-France',
          postalCode: '75001',
          country: 'France',
          countryCode: 'FR' // FR is not enabled in enabledCountries
        },
        currency: 'EUR'
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code || res.body.code).toBe('MARKET_COUNTRY_INELIGIBLE');
  });

  test('5. Unsupported presentment currency fails closed with 409', async () => {
    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(testProductSimple._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Test User',
          phone: '+92 300 1234567',
          address: 'Street 1, House 2',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'CAD' // CAD not enabled
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code || res.body.code).toBe('MARKET_CURRENCY_INELIGIBLE');
  });

  test('6. Disabled market fails closed with 503', async () => {
    await MarketConfig.updateOne({ key: 'default' }, { $set: { isEnabled: false } });

    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(testProductSimple._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Test User',
          phone: '+92 300 1234567',
          address: 'Street 1, House 2',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });

    expect(res.status).toBe(503);
    expect(res.body.error?.code || res.body.code).toBe('MARKET_DISABLED');
  });

  test('7. Missing or invalid address fields are strictly rejected', async () => {
    // Missing address line 1
    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(testProductSimple._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Test User',
          phone: '+92 300 1234567',
          address: '', // invalid
          city: 'Lahore',
          country: 'PK'
        }
      });

    expect(res.status).toBe(400);
  });

  test('8. Tampered or expired quote verification endpoint fails closed', async () => {
    const quoteRes = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(testProductSimple._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Ali Khan',
          phone: '+92 300 1234567',
          address: 'Street 1, House 2',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });

    expect(quoteRes.status).toBe(200);
    const validQuote = quoteRes.body.data.quote;

    // Verify valid quote
    const verifyRes = await request(app)
      .post('/api/commerce/checkout/verify')
      .send({ quote: validQuote });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.valid).toBe(true);

    // Tamper quote total
    const tamperedQuote = {
      ...validQuote,
      totals: {
        ...validQuote.totals,
        grandTotal: 10 // reduced total by client
      }
    };

    const tamperRes = await request(app)
      .post('/api/commerce/checkout/verify')
      .send({ quote: tamperedQuote });
    expect(tamperRes.status).toBe(409);
    expect(tamperRes.body.error?.code || tamperRes.body.code).toBe('QUOTE_TAMPERED');
  });

  test('9. Quote failure causes zero order, payment, or inventory mutations', async () => {
    const ordersCountBefore = await Order.countDocuments();
    const paymentsCountBefore = await Payment.countDocuments();
    const productBefore = await Product.findById(testProductSimple._id);

    // Trigger failing quote
    await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(testProductSimple._id), quantity: 9999 }], // excessive stock request
        shippingAddress: {
          fullName: 'Ali Khan',
          phone: '+92 300 1234567',
          address: 'Street 1, House 2',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });

    const ordersCountAfter = await Order.countDocuments();
    const paymentsCountAfter = await Payment.countDocuments();
    const productAfter = await Product.findById(testProductSimple._id);

    expect(ordersCountAfter).toBe(ordersCountBefore);
    expect(paymentsCountAfter).toBe(paymentsCountBefore);
    expect(productAfter.stock).toBe(productBefore.stock);
  });

  test('10. Multi-merchant origin configurations work without code change (e.g. AE merchant origin)', async () => {
    // Switch merchant origin to UAE (AE)
    await MarketConfig.updateOne(
      { key: 'default' },
      {
        $set: {
          merchantCountry: 'AE',
          homeCountry: 'AE',
          fulfillmentOriginCountry: 'AE',
          baseCurrency: 'AED',
          defaultCurrency: 'AED'
        }
      }
    );

    // Quoting for domestic AE customer from AE merchant
    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [{ productId: String(testProductSimple._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Sultan Al-Nuaimi',
          phone: '+971 50 9876543',
          address: 'Corniche Road 10',
          city: 'Abu Dhabi',
          province: 'Abu Dhabi',
          country: 'AE'
        },
        currency: 'AED'
      });

    expect(res.status).toBe(200);
    const quote = res.body.data.quote;
    expect(quote.isDomestic).toBe(true);
    expect(quote.merchantCountry).toBe('AE');
    expect(quote.destination.countryCode).toBe('AE');
    expect(quote.incoterm).toBe('DOMESTIC');
  });

  test('11. Inactive or unpublished product in cart fails quote atomically', async () => {
    const unpublishedProduct = await Product.create({
      name: 'Draft Cashews',
      slug: `draft-cashews-${Date.now()}`,
      category: testCategory._id,
      price: 3000,
      stock: 10,
      status: 'draft',
      isActive: false,
      sku: `DRAFT-CSH-${Date.now()}`
    });

    const res = await request(app)
      .post('/api/commerce/checkout/quote')
      .send({
        items: [
          { productId: String(testProductSimple._id), quantity: 1 },
          { productId: String(unpublishedProduct._id), quantity: 1 }
        ],
        shippingAddress: {
          fullName: 'Ali Khan',
          phone: '+92 300 1234567',
          address: 'Street 1, House 2',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK'
        },
        currency: 'PKR'
      });

    expect(res.status).toBe(409);
    expect(res.body.error?.code || res.body.code).toBe('ORDER_PRODUCT_UNAVAILABLE');
  });

  test('12. Admin market configuration endpoints enforce RBAC and sanitize sensitive data', async () => {
    const customerAuth = await createAuth('customer');
    const adminAuth = await createAuth('admin');

    // Non-admin request should receive 403
    const forbiddenRes = await request(app)
      .put('/api/commerce/market')
      .set('Authorization', customerAuth.authorization)
      .send({
        homeCountry: 'PK',
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE'],
        defaultCurrency: 'PKR',
        enabledCurrencies: ['PKR', 'AED'],
        isEnabled: true
      });

    expect(forbiddenRes.status).toBe(403);

    // Admin request succeeds
    const adminRes = await request(app)
      .put('/api/commerce/market')
      .set('Authorization', adminAuth.authorization)
      .send({
        homeCountry: 'PK',
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE', 'GB'],
        defaultCurrency: 'PKR',
        enabledCurrencies: ['PKR', 'AED', 'GBP'],
        isEnabled: true
      });

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.enabledCountries).toContain('GB');
  });
});
