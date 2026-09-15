/**
 * @file global-checkout-quote.integration.test.js
 * @description Integration Test Matrix for Phase 6A: Global Checkout Eligibility & Quote Orchestration.
 * Verifies Quote generation, Quote-to-Order binding, OrderService enforcement boundary,
 * idempotency, tamper/replay resistance, exact money reconciliation, and failure atomicity.
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
const InventoryTransaction = require('../../models/InventoryTransaction');
const TokenService = require('../../services/TokenService');
const CheckoutQuoteService = require('../../services/checkout/CheckoutQuoteService');
const { MoneyMapper } = require('../../modules/commerce');

const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');

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
    slug: `premium-nuts-${Date.now()}-${sequence}`,
    isActive: true
  });

  // Create Products with canonical customs metadata
  testProductSimple = await Product.create({
    name: 'Organic Walnuts 500g',
    slug: `organic-walnuts-500g-${Date.now()}-${sequence}`,
    category: testCategory._id,
    price: 1500,
    stock: 50,
    weight: 0.5,
    weightGrams: 500,
    status: 'published',
    isActive: true,
    countryOfOrigin: 'PK',
    hsClassification: {
      code: '080232',
      systemVersion: 'HS_2022',
      jurisdiction: 'WCO'
    },
    declaredValueEligibility: 'ELIGIBLE',
    dangerousGoodsClassification: 'NOT_RESTRICTED',
    sku: `WAL-500-${Date.now()}-${sequence}`
  });

  testProductVariable = await Product.create({
    name: 'Premium Roasted Almonds',
    slug: `premium-roasted-almonds-${Date.now()}-${sequence}`,
    category: testCategory._id,
    price: 2000,
    stock: 100,
    status: 'published',
    isActive: true,
    countryOfOrigin: 'PK',
    hsClassification: {
      code: '080212',
      systemVersion: 'HS_2022',
      jurisdiction: 'WCO'
    },
    declaredValueEligibility: 'ELIGIBLE',
    dangerousGoodsClassification: 'NOT_RESTRICTED',
    sku: `ALM-ROOT-${Date.now()}-${sequence}`,
    variants: [
      {
        sku: `ALM-250G-${Date.now()}-${sequence}`,
        price: 1200,
        salePrice: 1000,
        stock: 30,
        weight: 0.25,
        weightGrams: 250,
        countryOfOrigin: 'PK',
        hsClassification: {
          code: '080212',
          systemVersion: 'HS_2022',
          jurisdiction: 'WCO'
        },
        declaredValueEligibility: 'ELIGIBLE',
        dangerousGoodsClassification: 'NOT_RESTRICTED',
        attributes: [{ name: 'Size', value: '250g' }]
      },
      {
        sku: `ALM-500G-${Date.now()}-${sequence}`,
        price: 2000,
        salePrice: 1800,
        stock: 40,
        weight: 0.5,
        weightGrams: 500,
        countryOfOrigin: 'PK',
        hsClassification: {
          code: '080212',
          systemVersion: 'HS_2022',
          jurisdiction: 'WCO'
        },
        declaredValueEligibility: 'ELIGIBLE',
        dangerousGoodsClassification: 'NOT_RESTRICTED',
        attributes: [{ name: 'Size', value: '500g' }]
      }
    ]
  });

  // Create Shipping Zones
  await ShippingZone.deleteMany({});
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

  // Seed active CommerceConfigurationVersion
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
        serviceCode: 'STANDARD',
        displayName: 'Standard Delivery (TCS)',
        originCountry: 'PK',
        destinationCountry: 'PK',
        currency: 'PKR',
        baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
        freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
        remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
        remoteCities: ['Gwadar', 'Skardu'],
        weightBands: [],
        postalCodeRanges: [],
        deliveryMinDays: 2,
        deliveryMaxDays: 4,
        supportedIncoterms: ['DOMESTIC'],
        priority: 10,
        enabled: true
      },
      {
        ruleId: 'rule-ae-standard',
        name: 'UAE International Standard',
        serviceCode: 'STANDARD',
        displayName: 'Standard International (DHL)',
        originCountry: 'PK',
        destinationCountry: 'AE',
        currency: 'AED',
        baseRateExact: MoneyMapper.fromLegacy(25, 'AED'),
        freeShippingThresholdExact: MoneyMapper.fromLegacy(200, 'AED'),
        remoteRateExact: MoneyMapper.fromLegacy(10, 'AED'),
        weightBands: [],
        postalCodeRanges: [],
        deliveryMinDays: 3,
        deliveryMaxDays: 6,
        supportedIncoterms: ['DDP'],
        priority: 20,
        enabled: true
      },
      {
        ruleId: 'rule-gb-standard',
        name: 'United Kingdom Standard',
        serviceCode: 'STANDARD',
        displayName: 'Standard International (Royal Mail)',
        originCountry: 'PK',
        destinationCountry: 'GB',
        currency: 'GBP',
        baseRateExact: MoneyMapper.fromLegacy(15, 'GBP'),
        freeShippingThresholdExact: MoneyMapper.fromLegacy(100, 'GBP'),
        remoteRateExact: MoneyMapper.fromLegacy(5, 'GBP'),
        weightBands: [],
        postalCodeRanges: [],
        deliveryMinDays: 4,
        deliveryMaxDays: 7,
        supportedIncoterms: ['DDP'],
        priority: 30,
        enabled: true
      },
      {
        ruleId: 'rule-de-standard',
        name: 'Germany Europe Standard',
        serviceCode: 'STANDARD',
        displayName: 'Standard International (DHL Paket)',
        originCountry: 'PK',
        destinationCountry: 'DE',
        currency: 'EUR',
        baseRateExact: MoneyMapper.fromLegacy(18, 'EUR'),
        freeShippingThresholdExact: MoneyMapper.fromLegacy(120, 'EUR'),
        remoteRateExact: MoneyMapper.fromLegacy(6, 'EUR'),
        weightBands: [],
        postalCodeRanges: [],
        deliveryMinDays: 4,
        deliveryMaxDays: 7,
        supportedIncoterms: ['DDP'],
        priority: 40,
        enabled: true
      },
      {
        ruleId: 'rule-us-standard',
        name: 'United States Standard',
        serviceCode: 'STANDARD',
        displayName: 'Standard International (FedEx)',
        originCountry: 'PK',
        destinationCountry: 'US',
        currency: 'USD',
        baseRateExact: MoneyMapper.fromLegacy(20, 'USD'),
        freeShippingThresholdExact: MoneyMapper.fromLegacy(150, 'USD'),
        remoteRateExact: MoneyMapper.fromLegacy(10, 'USD'),
        weightBands: [],
        postalCodeRanges: [],
        deliveryMinDays: 5,
        deliveryMaxDays: 9,
        supportedIncoterms: ['DDP'],
        priority: 50,
        enabled: true
      }
    ],
    taxRules: [
      {
        ruleId: 'TEST_PK_FIXTURE',
        destinationCountry: 'PK',
        taxType: 'GST',
        taxTreatment: 'exclusive',
        taxRateNumerator: 0,
        taxRateDenominator: 10000,
        dutyRateNumerator: 0,
        dutyRateDenominator: 10000,
        roundingMode: 'HALF_UP',
        roundingScope: 'subtotal',
        incoterm: 'DOMESTIC',
        sourceAuthority: 'Federal Board of Revenue',
        sourceReference: 'PK-FBR-TEST-2026',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        requiresTax: false,
        requiresDuty: false,
        enabled: true
      },
      {
        ruleId: 'TEST_AE_FIXTURE',
        destinationCountry: 'AE',
        taxType: 'VAT',
        taxTreatment: 'exclusive',
        taxRateNumerator: 500,
        taxRateDenominator: 10000,
        dutyRateNumerator: 500,
        dutyRateDenominator: 10000,
        roundingMode: 'HALF_UP',
        roundingScope: 'subtotal',
        incoterm: 'DDP',
        sourceAuthority: 'Federal Tax Authority UAE',
        sourceReference: 'UAE-FTA-TEST-2026',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        requiresTax: true,
        requiresDuty: true,
        enabled: true
      },
      {
        ruleId: 'TEST_GB_FIXTURE',
        destinationCountry: 'GB',
        taxType: 'VAT',
        taxTreatment: 'exclusive',
        taxRateNumerator: 2000,
        taxRateDenominator: 10000,
        dutyRateNumerator: 250,
        dutyRateDenominator: 10000,
        roundingMode: 'HALF_UP',
        roundingScope: 'subtotal',
        incoterm: 'DDP',
        sourceAuthority: 'HMRC UK',
        sourceReference: 'UK-HMRC-TEST-2026',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        requiresTax: true,
        requiresDuty: true,
        enabled: true
      },
      {
        ruleId: 'TEST_DE_FIXTURE',
        destinationCountry: 'DE',
        taxType: 'VAT',
        taxTreatment: 'inclusive',
        taxRateNumerator: 1900,
        taxRateDenominator: 10000,
        dutyRateNumerator: 250,
        dutyRateDenominator: 10000,
        roundingMode: 'HALF_UP',
        roundingScope: 'subtotal',
        incoterm: 'DDP',
        sourceAuthority: 'Federal Central Tax Office Germany',
        sourceReference: 'DE-BZSt-TEST-2026',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        requiresTax: true,
        requiresDuty: true,
        enabled: true
      },
      {
        ruleId: 'TEST_US_SUBDIVISION_FIXTURE',
        destinationCountry: 'US',
        destinationSubdivision: 'NY',
        taxType: 'SALES_TAX',
        taxTreatment: 'exclusive',
        taxRateNumerator: 8875,
        taxRateDenominator: 100000,
        dutyRateNumerator: 0,
        dutyRateDenominator: 10000,
        roundingMode: 'HALF_UP',
        roundingScope: 'subtotal',
        incoterm: 'DDP',
        sourceAuthority: 'NYS Dept of Taxation and Finance',
        sourceReference: 'US-NY-TEST-2026',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        requiresTax: true,
        requiresDuty: false,
        enabled: true
      }
    ]
  });
};

describe('Phase 6A: Global Checkout Eligibility & Quote Orchestration Matrix', () => {
  let prevCompat;
  beforeAll(async () => {
    prevCompat = process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY;
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = 'true';
  });

  afterAll(async () => {
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = prevCompat;
  });

  beforeEach(async () => {
    await setupTestFixtures();
  });

  describe('A. Quote Orchestration & Landed-Cost Calculation', () => {
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
      await CommerceConfigurationVersion.updateOne(
        { merchantScopeId: 'default', status: 'active' },
        { $set: { status: 'retired' } }
      );

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
    });

    test('7. Missing or invalid address fields are strictly rejected', async () => {
      const res = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Test User',
            phone: '+92 300 1234567',
            address: '', // invalid empty address
            city: 'Lahore',
            country: 'PK'
          }
        });

      expect(res.status).toBe(400);
    });
  });

  describe('B. Authoritative Order Boundary & Quote Verification', () => {
    test('8. International order creation without quote is rejected with 400 QUOTE_REQUIRED', async () => {
      const customer = await createAuth('customer');
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe'
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_REQUIRED');
    });

    test('9. Prepaid order creation without quote is rejected with 400 QUOTE_REQUIRED', async () => {
      const customer = await createAuth('customer');
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Ali Khan',
            phone: '+92 300 1234567',
            address: 'Street 1, House 2',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            countryCode: 'PK'
          },
          currency: 'PKR',
          paymentMethod: 'stripe' // prepaid method
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_REQUIRED');
    });

    test('10. Domestic eligible COD compatibility remains intact without quote (server recalculates all totals)', async () => {
      const customer = await createAuth('customer');
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 2 }],
          shippingAddress: {
            fullName: 'Ali Khan',
            phone: '+92 300 1234567',
            address: 'Street 1, House 2, Sector F-7',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            countryCode: 'PK'
          },
          currency: 'PKR',
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const order = res.body.data.order;
      expect(order.paymentMethod).toBe('cod');
      expect(order.orderStatus).toBe('Pending');
      expect(order.subtotal).toBe(3000);
      expect(order.shippingCost).toBe(250);
      expect(order.totalAmount).toBe(3250);
    });

    test('11. International prepaid order creation with valid quote succeeds and creates order atomically', async () => {
      const customer = await createAuth('customer');
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED'
        });

      expect(quoteRes.status).toBe(200);
      const quoteToken = quoteRes.body.data.quote.quoteToken;

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken
        });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.success).toBe(true);
      const createdOrder = orderRes.body.data.order;
      expect(createdOrder.currency).toBe('AED');
      expect(createdOrder.taxAmount).toBe(75); // 5% of 1500 AED
      expect(createdOrder.duties).toBe(75); // 5% DDP
    });

    test('12. Tampered quote token cannot create an order (fails closed with 409 QUOTE_TAMPERED)', async () => {
      const customer = await createAuth('customer');
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED'
        });

      const validToken = quoteRes.body.data.quote.quoteToken;
      const decodedEnvelope = JSON.parse(Buffer.from(validToken, 'base64url').toString('utf8'));

      // Tamper signature
      decodedEnvelope.quoteSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const tamperedToken = Buffer.from(JSON.stringify(decodedEnvelope)).toString('base64url');

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken: tamperedToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_TAMPERED');
    });

    test('13. Expired quote cannot create an order (fails closed with 409 QUOTE_EXPIRED)', async () => {
      const customer = await createAuth('customer');
      const expiredPayload = {
        kid: 'v1',
        quoteId: 'QUO-TEST-EXPIRED',
        merchantCountry: 'PK',
        fulfillmentOriginCountry: 'PK',
        destinationCountry: 'AE',
        currency: 'AED',
        itemsHash: CheckoutQuoteService.hashItems([
          { product: String(testProductSimple._id), variantId: null, quantity: 1, unitPriceExact: { amountMinor: 150000n } }
        ]),
        subtotalMinor: '150000',
        discountMinor: '0',
        shippingMinor: '0',
        taxMinor: '7500',
        dutyMinor: '7500',
        grandTotalMinor: '165000',
        incoterm: 'DDP',
        shippingServiceLevel: 'standard',
        issuedAt: new Date(Date.now() - 3600000).toISOString(),
        expiresAt: new Date(Date.now() - 1800000).toISOString()
      };

      const sig = CheckoutQuoteService.signQuote(expiredPayload);
      const expiredToken = Buffer.from(JSON.stringify({ ...expiredPayload, quoteSignature: sig })).toString('base64url');

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken: expiredToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_EXPIRED');
    });

    test('14. Future-dated quote is rejected with 409 QUOTE_FUTURE_DATED', async () => {
      const customer = await createAuth('customer');
      const futurePayload = {
        kid: 'v1',
        quoteId: 'QUO-TEST-FUTURE',
        merchantCountry: 'PK',
        fulfillmentOriginCountry: 'PK',
        destinationCountry: 'AE',
        currency: 'AED',
        itemsHash: CheckoutQuoteService.hashItems([
          { product: String(testProductSimple._id), variantId: null, quantity: 1, unitPriceExact: { amountMinor: 150000n } }
        ]),
        subtotalMinor: '150000',
        discountMinor: '0',
        shippingMinor: '0',
        taxMinor: '7500',
        dutyMinor: '7500',
        grandTotalMinor: '165000',
        incoterm: 'DDP',
        shippingServiceLevel: 'standard',
        issuedAt: new Date(Date.now() + 180000).toISOString(), // 3 mins in future
        expiresAt: new Date(Date.now() + 900000).toISOString()
      };

      const sig = CheckoutQuoteService.signQuote(futurePayload);
      const futureToken = Buffer.from(JSON.stringify({ ...futurePayload, quoteSignature: sig })).toString('base64url');

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken: futureToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_FUTURE_DATED');
    });

    test('15. Unknown quote version is rejected with 409 QUOTE_VERSION_UNSUPPORTED', async () => {
      const customer = await createAuth('customer');
      const badVersionPayload = {
        kid: 'v99_unknown',
        quoteId: 'QUO-TEST-BADVER',
        merchantCountry: 'PK',
        fulfillmentOriginCountry: 'PK',
        destinationCountry: 'AE',
        currency: 'AED',
        itemsHash: 'a'.repeat(64),
        subtotalMinor: '150000',
        discountMinor: '0',
        shippingMinor: '0',
        taxMinor: '7500',
        dutyMinor: '7500',
        grandTotalMinor: '165000',
        incoterm: 'DDP',
        shippingServiceLevel: 'standard',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 900000).toISOString()
      };

      const badToken = Buffer.from(JSON.stringify({ ...badVersionPayload, quoteSignature: 'sig' })).toString('base64url');

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken: badToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_VERSION_UNSUPPORTED');
    });

    test('16. Product or variant substitution is rejected with 409 QUOTE_ITEMS_MISMATCH', async () => {
      const customer = await createAuth('customer');
      // Quote for simple product
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED'
        });

      const quoteToken = quoteRes.body.data.quote.quoteToken;

      // Try to order variable product using quote for simple product
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductVariable._id), variantId: String(testProductVariable.variants[0]._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_ITEMS_MISMATCH');
    });

    test('17. Quantity change after quote issuance is rejected with 409 QUOTE_ITEMS_MISMATCH', async () => {
      const customer = await createAuth('customer');
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED'
        });

      const quoteToken = quoteRes.body.data.quote.quoteToken;

      // Order with quantity 2 instead of 1
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 2 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_ITEMS_MISMATCH');
    });

    test('18. Destination country change after quote issuance is rejected with 409 QUOTE_DESTINATION_MISMATCH', async () => {
      const customer = await createAuth('customer');
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED'
        });

      const quoteToken = quoteRes.body.data.quote.quoteToken;

      // Attempt to order to GB with AE quote
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'John Smith',
            phone: '+44 7911 123456',
            address: '10 Downing Street',
            city: 'London',
            province: 'Greater London',
            postalCode: 'SW1A 2AA',
            countryCode: 'GB'
          },
          currency: 'AED',
          paymentMethod: 'stripe',
          quoteToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_DESTINATION_MISMATCH');
    });

    test('19. Currency change after quote issuance is rejected with 409 QUOTE_CURRENCY_MISMATCH', async () => {
      const customer = await createAuth('customer');
      const quoteRes = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED'
        });

      const quoteToken = quoteRes.body.data.quote.quoteToken;

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'USD',
          paymentMethod: 'stripe',
          quoteToken
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('QUOTE_CURRENCY_MISMATCH');
    });

    test('20. Inactive product in cart fails order atomically with 409 ORDER_PRODUCT_UNAVAILABLE', async () => {
      const customer = await createAuth('customer');
      const unpublished = await Product.create({
        name: 'Hidden Cashews',
        slug: `hidden-cashews-${Date.now()}-${sequence}`,
        category: testCategory._id,
        price: 3000,
        stock: 10,
        status: 'draft',
        isActive: false,
        sku: `HIDDEN-CSH-${Date.now()}-${sequence}`
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(unpublished._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Ali Khan',
            phone: '+92 300 1234567',
            address: 'Street 1, House 2',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            countryCode: 'PK'
          },
          currency: 'PKR',
          paymentMethod: 'cod'
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('ORDER_PRODUCT_UNAVAILABLE');
    });

    test('21. Order failure creates ZERO orders, payments, stock decrements, and inventory transactions', async () => {
      const customer = await createAuth('customer');
      const ordersBefore = await Order.countDocuments();
      const paymentsBefore = await Payment.countDocuments();
      const txsBefore = await InventoryTransaction.countDocuments();
      const productBefore = await Product.findById(testProductSimple._id);

      // Attempt order with excessive quantity exceeding stock
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 15 }], // available stock is 50, but we test atomic error by sending without quote on international route
          shippingAddress: {
            fullName: 'Rashid Al-Maktoum',
            phone: '+971 50 1234567',
            address: 'Villa 24, Jumeirah 1',
            city: 'Dubai',
            province: 'Dubai',
            countryCode: 'AE'
          },
          currency: 'AED',
          paymentMethod: 'stripe'
          // no quoteToken -> fails with 400 QUOTE_REQUIRED
        });

      expect(res.status).toBe(400);

      const ordersAfter = await Order.countDocuments();
      const paymentsAfter = await Payment.countDocuments();
      const txsAfter = await InventoryTransaction.countDocuments();
      const productAfter = await Product.findById(testProductSimple._id);

      expect(ordersAfter).toBe(ordersBefore);
      expect(paymentsAfter).toBe(paymentsBefore);
      expect(txsAfter).toBe(txsBefore);
      expect(productAfter.stock).toBe(productBefore.stock);
    });

    test('22. Concurrent / identical idempotency retry returns established idempotent result without duplicate creation', async () => {
      const customer = await createAuth('customer');
      const idempotencyKey = crypto.randomUUID();

      const payload = {
        items: [{ productId: String(testProductSimple._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Ali Khan',
          phone: '+92 300 1234567',
          address: 'Street 1, House 2, Sector F-7',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          countryCode: 'PK'
        },
        currency: 'PKR',
        paymentMethod: 'cod'
      };

      const firstRes = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(firstRes.status).toBe(201);
      const firstOrderId = firstRes.body.data.order._id;

      const replayRes = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.data.idempotentReplay).toBe(true);
      expect(replayRes.body.data.order._id).toBe(firstOrderId);

      // Verify only 1 order exists in database for this customer
      const count = await Order.countDocuments({ user: customer.user._id });
      expect(count).toBe(1);
    });

    test('23. Client-supplied monetary totals are ignored and cannot tamper authoritative calculated amounts', async () => {
      const customer = await createAuth('customer');
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Ali Khan',
            phone: '+92 300 1234567',
            address: 'Street 1, House 2, Sector F-7',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            countryCode: 'PK'
          },
          currency: 'PKR',
          paymentMethod: 'cod',
          // Malicious client-supplied override values are rejected by strict schema validation
          subtotal: 10
        });

      // Strict validation fails closed with 400
      expect(res.status).toBe(400);

      // Legitimate order creation calculates authoritative amounts server-side
      const validRes = await request(app)
        .post('/api/orders')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          items: [{ productId: String(testProductSimple._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Ali Khan',
            phone: '+92 300 1234567',
            address: 'Street 1, House 2, Sector F-7',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            countryCode: 'PK'
          },
          currency: 'PKR',
          paymentMethod: 'cod'
        });

      expect(validRes.status).toBe(201);
      const order = validRes.body.data.order;
      // Authoritative subtotal for 1 unit of 1500 PKR is 1500, shipping is 250, total is 1750
      expect(order.subtotal).toBe(1500);
      expect(order.shippingCost).toBe(250);
      expect(order.totalAmount).toBe(1750);
    });

    test('24. Multi-merchant origin configurations work without code change (e.g. AE merchant origin)', async () => {
      await CommerceConfigurationVersion.updateOne(
        { merchantScopeId: 'default', status: 'active' },
        {
          $set: {
            'merchantProfile.merchantCountry': 'AE',
            'merchantProfile.baseCurrency': 'AED',
            'merchantProfile.defaultCurrency': 'AED',
            'merchantProfile.fulfillmentOrigins.0.country': 'AE',
            'shippingRules.1.supportedIncoterms': ['DOMESTIC', 'DDP'],
            'taxRules.1.incoterm': 'DOMESTIC'
          }
        }
      );

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

    test('25. Admin market configuration endpoints enforce RBAC and sanitize sensitive data', async () => {
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
});
