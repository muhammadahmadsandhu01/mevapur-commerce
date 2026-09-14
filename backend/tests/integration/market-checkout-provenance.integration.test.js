const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const Refund = require('../../models/Refund');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const TokenService = require('../../services/TokenService');
const CheckoutQuoteService = require('../../services/checkout/CheckoutQuoteService');
const { MoneyMapper } = require('../../modules/commerce');

const createAuthToken = async (user) => {
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
    tokenVersion: user.tokenVersion || 0
  });

  return `Bearer ${token}`;
};

describe('Market Checkout & Provenance Integration Tests', () => {
  let defaultCategory;
  let activeConfig;
  let gbProduct;
  let pkProduct;
  let gbOffering;
  let gbPriceBook;
  let pkOffering;
  let pkPriceBook;

  beforeEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Order.deleteMany({});
    await Return.deleteMany({});
    await Refund.deleteMany({});
    await CommerceConfigurationVersion.deleteMany({});
    await ProductMarketOffering.deleteMany({});
    await MarketPriceBook.deleteMany({});

    defaultCategory = await Category.create({
      name: 'Dry Fruits & Nuts',
      slug: `dry-fruits-${Date.now()}`,
      isActive: true,
      isVisible: true
    });

    activeConfig = await CommerceConfigurationVersion.create({
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
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE', 'GB', 'US', 'DE'],
        enabledCurrencies: ['PKR', 'AED', 'GBP', 'USD', 'EUR'],
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [{
          originId: 'origin-pk-main',
          name: 'Karachi Central Hub',
          country: 'PK',
          city: 'Karachi',
          timeZone: 'Asia/Karachi',
          enabled: true,
          isDefault: true
        }]
      },
      shippingRules: [
        {
          ruleId: 'rule-pk-dom',
          name: 'PK Domestic TCS',
          serviceCode: 'STANDARD',
          displayName: 'Domestic Standard',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
          incoterm: 'DOMESTIC',
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          enabled: true
        },
        {
          ruleId: 'rule-gb-intl',
          name: 'GB Royal Mail Standard',
          serviceCode: 'STANDARD',
          displayName: 'Royal Mail International Standard',
          originCountry: 'PK',
          destinationCountry: 'GB',
          currency: 'GBP',
          baseRateExact: MoneyMapper.fromLegacy(15, 'GBP'),
          incoterm: 'DAP',
          deliveryMinDays: 3,
          deliveryMaxDays: 6,
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
          incoterm: 'DAP',
          sourceAuthority: 'HMRC UK',
          sourceReference: 'UK-HMRC-TEST-2026',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          requiresTax: true,
          requiresDuty: true,
          enabled: true
        }
      ]
    });

    // Create GB Product & Offering & Price
    gbProduct = await Product.create({
      name: 'Export Quality Apricots',
      slug: `export-apricots-${Date.now()}`,
      price: 2000,
      stock: 50,
      category: defaultCategory._id,
      isActive: true,
      status: 'published',
      weight: 0.5,
      weightGrams: 500,
      countryOfOrigin: 'PK',
      hsClassification: {
        code: '080232',
        systemVersion: 'HS_2022',
        jurisdiction: 'WCO'
      },
      declaredValueEligibility: 'ELIGIBLE',
      dangerousGoodsClassification: 'NOT_RESTRICTED'
    });

    gbOffering = await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: gbProduct._id,
      marketCountry: 'GB',
      status: 'active',
      visibility: 'visible',
      fulfillmentMode: 'cross_border',
      eligibleFulfillmentOriginIds: ['origin-pk-main'],
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    gbPriceBook = await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: gbProduct._id,
      marketCountry: 'GB',
      currency: 'GBP',
      currencyExponent: 2,
      amountMinor: '1850', // GBP 18.50
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    // Create PK Domestic Product & Offering & Price
    pkProduct = await Product.create({
      name: 'Local Walnut Halves',
      slug: `local-walnuts-${Date.now()}`,
      price: 1500,
      stock: 40,
      category: defaultCategory._id,
      isActive: true,
      status: 'published',
      weight: 0.5,
      weightGrams: 500
    });

    pkOffering = await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: pkProduct._id,
      marketCountry: 'PK',
      status: 'active',
      visibility: 'visible',
      fulfillmentMode: 'local',
      eligibleFulfillmentOriginIds: ['origin-pk-main'],
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    pkPriceBook = await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: pkProduct._id,
      marketCountry: 'PK',
      currency: 'PKR',
      currencyExponent: 2,
      amountMinor: '150000', // PKR 1500.00
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });
  });

  describe('1. Authoritative Quote Snapshots with Market Offerings', () => {
    it('1. Quote captures offeringId, priceBookEntryId, and exact amountMinor for GB market', async () => {
      const quote = await CheckoutQuoteService.generateQuote({
        merchantScopeId: 'default',
        destinationCountry: 'GB',
        currency: 'GBP',
        shippingAddress: {
          fullName: 'John Bull',
          addressLine1: '10 Downing St',
          locality: 'London',
          administrativeArea: 'Greater London',
          postalCode: 'SW1A 2AA',
          countryCode: 'GB',
          phone: '+442079460991'
        },
        items: [{ productId: String(gbProduct._id), quantity: 2 }]
      });

      expect(quote).toBeDefined();
      expect(quote.currency).toBe('GBP');
      expect(quote.items.length).toBe(1);
      
      const item = quote.items[0];
      expect(item.offeringId).toBe(String(gbOffering._id));
      expect(item.offeringLockVersion).toBe(1);
      expect(item.priceBookEntryId).toBe(String(gbPriceBook._id));
      expect(item.priceBookLockVersion).toBe(1);
      expect(item.priceSource).toBe('manual');
      expect(String(item.unitPriceExact.amountMinor)).toBe('1850');
      expect(String(item.lineTotalExact.amountMinor)).toBe('3700');
    });

    it('2. Customer cannot override market price or currency at order placement', async () => {
      const user = await global.createTestUser({ residenceCountry: 'GB' });
      const token = await createAuthToken(user);

      const quote = await CheckoutQuoteService.generateQuote({
        merchantScopeId: 'default',
        destinationCountry: 'GB',
        currency: 'GBP',
        shippingAddress: {
          fullName: 'John Bull',
          addressLine1: '10 Downing St',
          locality: 'London',
          administrativeArea: 'Greater London',
          postalCode: 'SW1A 2AA',
          countryCode: 'GB',
          phone: '+442079460991'
        },
        items: [{ productId: String(gbProduct._id), quantity: 1 }]
      });

      // Try placing order tampering currency to USD or attempting unauthorized quote mismatch
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', token)
        .set('Idempotency-Key', `idemp-tamper-${Date.now()}`)
        .send({
          items: [{ productId: gbProduct._id, quantity: 1, price: 1.00 }],
          shippingAddress: {
            fullName: 'John Bull',
            address: '10 Downing St',
            city: 'London',
            province: 'Greater London',
            postalCode: 'SW1A 2AA',
            country: 'United Kingdom',
            countryCode: 'GB',
            phone: '+442079460991'
          },
          paymentMethod: 'stripe',
          currency: 'USD', // Tampered currency
          quoteToken: quote.quoteToken
        });

      // Must be rejected by quote assertion policy
      expect([400, 409]).toContain(orderRes.status);
    });

    it('3. Order creates snapshot with offering & price book provenance', async () => {
      const user = await global.createTestUser({ residenceCountry: 'GB' });
      const token = await createAuthToken(user);

      const quote = await CheckoutQuoteService.generateQuote({
        merchantScopeId: 'default',
        destinationCountry: 'GB',
        currency: 'GBP',
        shippingAddress: {
          fullName: 'John Bull',
          addressLine1: '10 Downing St',
          locality: 'London',
          administrativeArea: 'Greater London',
          postalCode: 'SW1A 2AA',
          countryCode: 'GB',
          phone: '+442079460991'
        },
        items: [{ productId: String(gbProduct._id), quantity: 1 }]
      });

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', token)
        .set('Idempotency-Key', `idemp-ok-${Date.now()}`)
        .send({
          items: [{ productId: gbProduct._id, quantity: 1 }],
          shippingAddress: {
            fullName: 'John Bull',
            address: '10 Downing St',
            city: 'London',
            province: 'Greater London',
            postalCode: 'SW1A 2AA',
            country: 'United Kingdom',
            countryCode: 'GB',
            phone: '+442079460991'
          },
          paymentMethod: 'stripe',
          currency: 'GBP',
          quoteToken: quote.quoteToken
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.orderId;
      const order = await Order.findOne({ orderId });
      expect(order).toBeDefined();
      expect(order.items[0].offeringId).toEqual(gbOffering._id);
      expect(order.items[0].priceBookEntryId).toEqual(gbPriceBook._id);
      expect(order.items[0].priceSource).toBe('manual');
      expect(order.items[0].fulfillmentMode).toBe('cross_border');
      expect(String(order.items[0].unitPriceExact.amountMinor)).toBe('1850');
      expect(order.items[0].unitPriceExact.currency).toBe('GBP');
    });
  });

  describe('2. Historical Order, Return & Refund Immutability after Offering Retirement', () => {
    it('4. Historical order and return lookups remain readable after offering is retired', async () => {
      const user = await global.createTestUser({ residenceCountry: 'PK' });
      const token = await createAuthToken(user);

      // Place domestic order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', token)
        .set('Idempotency-Key', `idemp-ret-${Date.now()}`)
        .send({
          items: [{ productId: pkProduct._id, quantity: 2 }],
          shippingAddress: {
            fullName: 'Ali Khan',
            address: 'PECHS Block 6',
            city: 'Karachi',
            province: 'Sindh',
            postalCode: '75400',
            country: 'Pakistan',
            countryCode: 'PK',
            phone: '03001234567'
          },
          paymentMethod: 'cod',
          currency: 'PKR'
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.orderId;
      const pastOrder = await Order.findOne({ orderId });

      // Now Retire the PK market offering and price book
      pkOffering.status = 'retired';
      await pkOffering.save();
      pkPriceBook.status = 'retired';
      await pkPriceBook.save();

      // Retrieve the historical order via account invoice/details
      const invoiceRes = await request(app)
        .get(`/api/account/orders/${pastOrder._id}/invoice`)
        .set('Authorization', token);

      expect(invoiceRes.status).toBe(200);
      expect(invoiceRes.body.data.invoice.orderNumber).toBe(orderId);
      expect(invoiceRes.body.data.invoice.currency).toBe('PKR');
      expect(String(pastOrder.items[0].unitPriceExact.amountMinor)).toBe('150000');
    });

    it('5. Ineligible offering yields zero stock reservation or order mutation', async () => {
      const user = await global.createTestUser({ residenceCountry: 'AE' });
      const token = await createAuthToken(user);

      const initialStock = gbProduct.stock;

      // Try placing order for GB product to AE destination (no AE offering exists)
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', token)
        .set('Idempotency-Key', `idemp-ineligible-${Date.now()}`)
        .send({
          items: [{ productId: gbProduct._id, quantity: 1 }],
          shippingAddress: {
            fullName: 'Sheikh Zayed',
            address: 'Downtown Dubai',
            city: 'Dubai',
            province: 'Dubai',
            postalCode: '00000',
            country: 'United Arab Emirates',
            countryCode: 'AE',
            phone: '+971501234567'
          },
          paymentMethod: 'stripe',
          currency: 'AED'
        });

      // Fails closed (quote required or market ineligible)
      expect([400, 404, 409]).toContain(res.status);

      // Verify stock was not mutated
      const freshProduct = await Product.findById(gbProduct._id);
      expect(freshProduct.stock).toBe(initialStock);
    });
  });
});
