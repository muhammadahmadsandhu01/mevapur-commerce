'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../../app');
const Order = require('../../../models/Order');
const Product = require('../../../models/Product');
const Payment = require('../../../models/Payment');
const Refund = require('../../../models/Refund');
const Coupon = require('../../../models/Coupon');
const ShippingZone = require('../../../models/ShippingZone');
const User = require('../../../models/User');
const Session = require('../../../models/Session');
const Category = require('../../../models/Category');
const OrderService = require('../../../services/order/OrderService');
const ShippingService = require('../../../services/order/ShippingService');
const ProductCatalogService = require('../../../services/product/ProductCatalogService');
const CustomerCommerceService = require('../../../services/CustomerCommerceService');
const MarketService = require('../../../services/MarketService');
const TokenService = require('../../../services/TokenService');
const { Money, MoneyMapper, RolloutAuthority, CountryRegistry } = require('../../../modules/commerce');

describe('Exact Money Persistence & Backend Workflows Integration Tests', () => {
  let customerUser;
  let otherCustomerUser;
  let adminUser;
  let testCategory;
  let customerAuth;
  let otherCustomerAuth;
  let adminAuth;

  const createAuthHeader = async (user) => {
    const session = await Session.create({
      user: user._id,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
      tokenFamilyId: crypto.randomUUID(),
      isActive: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000)
    });
    return `Bearer ${TokenService.generateAccessToken({
      userId: user._id,
      sessionId: session._id,
      tokenVersion: user.tokenVersion || 0
    })}`;
  };

  beforeAll(async () => {
    await MarketService.getConfig();
  });

  beforeEach(async () => {
    customerUser = await User.create({
      fullName: 'Global Customer',
      email: `customer-${Date.now()}-${Math.random()}@example.com`,
      password: 'StrongPassword123!',
      phone: '03001234567',
      role: 'customer',
      isVerified: true
    });

    otherCustomerUser = await User.create({
      fullName: 'Other Customer',
      email: `other-${Date.now()}-${Math.random()}@example.com`,
      password: 'StrongPassword123!',
      phone: '03009999999',
      role: 'customer',
      isVerified: true
    });

    adminUser = await User.create({
      fullName: 'System Admin',
      email: `admin-${Date.now()}-${Math.random()}@example.com`,
      password: 'StrongPassword123!',
      phone: '03007654321',
      role: 'admin',
      isVerified: true
    });

    customerAuth = await createAuthHeader(customerUser);
    otherCustomerAuth = await createAuthHeader(otherCustomerUser);
    adminAuth = await createAuthHeader(adminUser);

    testCategory = await Category.create({
      name: 'Dry Fruits',
      slug: `dry-fruits-${Date.now()}-${Math.random()}`,
      isActive: true
    });
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
    await Coupon.deleteMany({});
    await ShippingZone.deleteMany({});
    await Session.deleteMany({});
  });

  describe('Governed Product Mutations & Exact Shadow Fields', () => {
    it('automatically generates exact money shadow fields on product and variants during creation', async () => {
      const product = await ProductCatalogService.createProduct({
        data: {
          name: 'Premium Roasted Cashews',
          category: testCategory._id,
          price: 1500,
          costPrice: 950,
          originalPrice: 1800,
          status: 'published',
          variants: [
            {
              sku: 'CASHEW-500G',
              price: 800,
              salePrice: 750,
              costPrice: 500,
              attributes: [{ name: 'Weight', value: '500g' }]
            },
            {
              sku: 'CASHEW-1KG',
              price: 1500,
              salePrice: 0,
              costPrice: 950,
              attributes: [{ name: 'Weight', value: '1kg' }]
            }
          ]
        },
        userId: adminUser._id
      });

      expect(product.price).toBe(750);
      expect(product.priceExact).toBeDefined();
      expect(product.priceExact.amountMinor.toString()).toBe('75000');
      expect(product.priceExact.currency).toBe('PKR');
      expect(product.priceExact.exponent).toBe(2);

      expect(product.costPriceExact.amountMinor.toString()).toBe('95000');
      expect(product.originalPriceExact.amountMinor.toString()).toBe('80000');

      // Variant shadow fields
      const v500 = product.variants.find((v) => v.sku === 'CASHEW-500G');
      expect(v500.priceExact.amountMinor.toString()).toBe('80000');
      expect(v500.salePriceExact.amountMinor.toString()).toBe('75000');
      expect(v500.costPriceExact.amountMinor.toString()).toBe('50000');
    });
  });

  describe('Order Creation, Exact Price Snapshots & Parity Verification', () => {
    it('creates an order with server-side authoritative exact prices, line totals, and address normalization', async () => {
      const product = await ProductCatalogService.createProduct({
        data: {
          name: 'Organic Walnuts',
          category: testCategory._id,
          price: 1200,
          status: 'published',
          initialStock: 50
        },
        userId: adminUser._id
      });

      const orderData = {
        items: [{ productId: String(product._id), quantity: 2 }],
        shippingAddress: {
          fullName: 'Muhammad Ahmad',
          phone: '03001234567',
          address: 'Main Boulevard, Gulberg III',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'Pakistan'
        },
        paymentMethod: 'cod'
      };

      const result = await OrderService.createOrder({
        userId: customerUser._id,
        orderData,
        idempotencyKey: `ord-exact-test-${Date.now()}`
      });

      expect(result.order).toBeDefined();
      const order = result.order;

      // Legacy fields
      expect(order.subtotal).toBe(2400); // 1200 * 2
      expect(order.shippingCost).toBe(250);
      expect(order.totalAmount).toBe(2650); // 2400 + 250 shipping

      // Exact persistent fields
      expect(order.subtotalExact).toBeDefined();
      expect(order.subtotalExact.amountMinor.toString()).toBe('240000');
      expect(order.subtotalExact.currency).toBe('PKR');
      expect(order.subtotalExact.exponent).toBe(2);

      expect(order.shippingCostExact).toBeDefined();
      expect(order.shippingCostExact.amountMinor.toString()).toBe('25000');

      expect(order.totalAmountExact).toBeDefined();
      expect(order.totalAmountExact.amountMinor.toString()).toBe('265000');

      // Line item exact fields
      expect(order.items[0].unitPriceExact.amountMinor.toString()).toBe('120000');
      expect(order.items[0].lineTotalExact.amountMinor.toString()).toBe('240000');

      // Address normalization
      expect(order.shippingAddress.countryCode).toBe('PK');
      expect(order.shippingAddress.phoneE164).toBe('+923001234567');
      expect(order.shippingAddress.administrativeArea).toBe('Punjab');
    });

    it('rejects coupon application when coupon currency mismatches order currency', async () => {
      const usdCoupon = await Coupon.create({
        code: 'USDONLY10',
        type: 'fixed',
        value: 10,
        currency: 'USD',
        status: 'active',
        startDate: new Date(Date.now() - 10000),
        endDate: new Date(Date.now() + 86400000)
      });

      const product = await ProductCatalogService.createProduct({
        data: {
          name: 'Almond Kernels',
          category: testCategory._id,
          price: 2000,
          status: 'published',
          initialStock: 20
        },
        userId: adminUser._id
      });

      const orderData = {
        items: [{ productId: String(product._id), quantity: 1 }],
        couponCode: 'USDONLY10',
        currency: 'PKR',
        shippingAddress: {
          fullName: 'Test User',
          phone: '03001234567',
          address: 'Street 1',
          city: 'Lahore',
          province: 'Punjab',
          country: 'Pakistan'
        },
        paymentMethod: 'cod'
      };

      await expect(
        OrderService.createOrder({
          userId: customerUser._id,
          orderData,
          idempotencyKey: `ord-mismatch-${Date.now()}`
        })
      ).rejects.toThrow(/does not match order currency/);
    });
  });

  describe('Shipping Exact-Money Calculation Across Diverse Currencies', () => {
    it('calculates shipping in USD with 2 decimal precision and weight multipliers', async () => {
      const config = await MarketService.getConfig();
      config.enabledCountries.push('US');
      config.enabledCurrencies.push('USD');
      await config.save();

      await ShippingZone.create({
        name: 'US Standard Zone',
        enabled: true,
        countries: ['US'],
        normalRate: 15.00,
        normalRateExact: MoneyMapper.fromLegacy(15.00, 'USD'),
        freeShippingThreshold: 100.00,
        freeShippingThresholdExact: MoneyMapper.fromLegacy(100.00, 'USD'),
        currency: 'USD',
        deliveryMinDays: 3,
        deliveryMaxDays: 6,
        priority: 10
      });

      // 1. Below threshold, weight = 3kg (2 excess kg -> 20% surcharge on 15 = 18.00 USD)
      const quote = await ShippingService.quote({
        country: 'US',
        currency: 'USD',
        subtotal: 50.00,
        weightKg: 3
      });

      expect(quote.currency).toBe('USD');
      expect(quote.shippingAmount).toBe(18.00);
      expect(quote.shippingAmountExact.amountMinor.toString()).toBe('1800');
      expect(quote.shippingAmountExact.exponent).toBe(2);
      expect(quote.freeShippingApplied).toBe(false);

      // 2. Above threshold -> Free Shipping
      const freeQuote = await ShippingService.quote({
        country: 'US',
        currency: 'USD',
        subtotal: 120.00
      });

      expect(freeQuote.shippingAmount).toBe(0);
      expect(freeQuote.shippingAmountExact.amountMinor.toString()).toBe('0');
      expect(freeQuote.freeShippingApplied).toBe(true);

      // Clean up
      config.enabledCountries = ['PK'];
      config.enabledCurrencies = ['PKR'];
      await config.save();
    });

    it('calculates shipping in JPY (0-decimal currency) with exact minor units', async () => {
      const config = await MarketService.getConfig();
      config.enabledCountries.push('JP');
      config.enabledCurrencies.push('JPY');
      await config.save();

      await ShippingZone.create({
        name: 'Japan Domestic Zone',
        enabled: true,
        countries: ['JP'],
        normalRate: 1000,
        normalRateExact: MoneyMapper.fromLegacy(1000, 'JPY'),
        freeShippingThreshold: 10000,
        freeShippingThresholdExact: MoneyMapper.fromLegacy(10000, 'JPY'),
        currency: 'JPY',
        deliveryMinDays: 1,
        deliveryMaxDays: 3,
        priority: 10
      });

      const quote = await ShippingService.quote({
        country: 'JP',
        currency: 'JPY',
        subtotal: 5000
      });

      expect(quote.currency).toBe('JPY');
      expect(quote.shippingAmount).toBe(1000);
      expect(quote.shippingAmountExact.amountMinor.toString()).toBe('1000');
      expect(quote.shippingAmountExact.exponent).toBe(0);
      expect(quote.freeShippingApplied).toBe(false);

      config.enabledCountries = ['PK'];
      config.enabledCurrencies = ['PKR'];
      await config.save();
    });

    it('calculates shipping in KWD (3-decimal currency) with remote area rate', async () => {
      const config = await MarketService.getConfig();
      config.enabledCountries.push('KW');
      config.enabledCurrencies.push('KWD');
      await config.save();

      await ShippingZone.create({
        name: 'Kuwait Zone',
        enabled: true,
        countries: ['KW'],
        cities: ['Kuwait City', 'Al Ahmadi'],
        remoteCities: ['Al Wafrah'],
        normalRate: 1.500,
        normalRateExact: MoneyMapper.fromLegacy(1.500, 'KWD'),
        remoteRate: 2.500,
        remoteRateExact: MoneyMapper.fromLegacy(2.500, 'KWD'),
        freeShippingThreshold: 50.000,
        freeShippingThresholdExact: MoneyMapper.fromLegacy(50.000, 'KWD'),
        currency: 'KWD',
        deliveryMinDays: 1,
        deliveryMaxDays: 2,
        priority: 10
      });

      const remoteQuote = await ShippingService.quote({
        country: 'KW',
        currency: 'KWD',
        city: 'Al Wafrah',
        subtotal: 10.000
      });

      expect(remoteQuote.currency).toBe('KWD');
      expect(remoteQuote.shippingAmount).toBe(2.500);
      expect(remoteQuote.shippingAmountExact.amountMinor.toString()).toBe('2500');
      expect(remoteQuote.shippingAmountExact.exponent).toBe(3);
      expect(remoteQuote.remoteArea).toBe(true);

      config.enabledCountries = ['PK'];
      config.enabledCurrencies = ['PKR'];
      await config.save();
    });

    it('rejects shipping quote when requested currency does not match shipping zone currency', async () => {
      const config = await MarketService.getConfig();
      config.enabledCountries.push('AE');
      config.enabledCurrencies.push('AED', 'USD');
      await config.save();

      await ShippingZone.create({
        name: 'UAE AED Zone',
        enabled: true,
        countries: ['AE'],
        normalRate: 25.00,
        normalRateExact: MoneyMapper.fromLegacy(25.00, 'AED'),
        freeShippingThreshold: 200.00,
        freeShippingThresholdExact: MoneyMapper.fromLegacy(200.00, 'AED'),
        currency: 'AED',
        deliveryMinDays: 2,
        deliveryMaxDays: 5,
        priority: 10
      });

      await expect(
        ShippingService.quote({
          country: 'AE',
          currency: 'USD',
          subtotal: 50.00
        })
      ).rejects.toThrow(/does not match order currency/);

      config.enabledCountries = ['PK'];
      config.enabledCurrencies = ['PKR'];
      await config.save();
    });
  });

  describe('HTTP Wire Serialization & API Boundary Integrity', () => {
    let testOrder;

    beforeEach(async () => {
      const product = await ProductCatalogService.createProduct({
        data: {
          name: 'Pine Nuts Exact Test',
          category: testCategory._id,
          price: 3000,
          status: 'published',
          initialStock: 20
        },
        userId: adminUser._id
      });

      const orderData = {
        items: [{ productId: String(product._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Muhammad Ahmad',
          phone: '03001234567',
          address: 'Main Boulevard',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'Pakistan'
        },
        paymentMethod: 'cod'
      };

      const result = await OrderService.createOrder({
        userId: customerUser._id,
        orderData,
        idempotencyKey: `ord-wire-${Date.now()}`
      });

      testOrder = result.order;
    });

    it('serializes exact money fields as plain decimal strings without BSON/Decimal128 leaks on GET /api/orders/:id', async () => {
      const res = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', customerAuth);

      expect(res.status).toBe(200);
      const order = res.body.data.order;
      expect(order).toBeDefined();

      // Verify subtotalExact serialization
      expect(order.subtotalExact).toBeDefined();
      expect(typeof order.subtotalExact.amountMinor).toBe('string');
      expect(order.subtotalExact.amountMinor).toBe('300000');
      expect(order.subtotalExact.currency).toBe('PKR');
      expect(order.subtotalExact.exponent).toBe(2);

      // Verify totalAmountExact serialization
      expect(order.totalAmountExact).toBeDefined();
      expect(typeof order.totalAmountExact.amountMinor).toBe('string');
      expect(order.totalAmountExact.amountMinor).toBe('325000');
      expect(order.totalAmountExact.currency).toBe('PKR');

      // Verify line items exact serialization
      expect(order.items[0].unitPriceExact).toBeDefined();
      expect(order.items[0].unitPriceExact.amountMinor).toBe('300000');

      // Verify legacy fields remain numeric and backward compatible
      expect(order.subtotal).toBe(3000);
      expect(order.shippingCost).toBe(250);
      expect(order.totalAmount).toBe(3250);

      // Verify NO $numberDecimal leakage anywhere in the JSON body
      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain('$numberDecimal');
      expect(rawJson).not.toContain('[object Object]');
    });

    it('enforces customer ownership boundaries: customer B cannot access customer A orders', async () => {
      // Customer B attempts to access Customer A's order
      const res = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', otherCustomerAuth);

      // Should be 403 Forbidden or 404 Not Found
      expect([403, 404]).toContain(res.status);

      // Anonymous request should be 401 Unauthorized
      const anonRes = await request(app)
        .get(`/api/orders/${testOrder._id}`);
      expect(anonRes.status).toBe(401);
    });

    it('protects financial reports: non-admin gets 403, admin gets partitioned multi-currency report', async () => {
      // Non-admin request
      const nonAdminRes = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', customerAuth);
      expect(nonAdminRes.status).toBe(403);

      // Admin request
      const adminRes = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', adminAuth);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.success).toBe(true);
      expect(adminRes.body.data.summary).toBeDefined();
      expect(adminRes.body.data.byCurrency).toBeDefined();

      const reportJson = JSON.stringify(adminRes.body);
      expect(reportJson).not.toContain('$numberDecimal');
    });
  });

  describe('Customer Address & Phone Route-Level Integration', () => {
    it('normalizes customer address and phone via POST /api/account/addresses', async () => {
      // Enable AE and GB in MarketConfig
      const config = await MarketService.getConfig();
      config.enabledCountries.push('AE', 'GB');
      config.enabledCurrencies.push('AED', 'GBP');
      await config.save();

      // 1. Pakistan legacy address normalization
      const pkRes = await request(app)
        .post('/api/account/addresses')
        .set('Authorization', customerAuth)
        .send({
          fullName: 'Ahmad Khan',
          phone: '03001234567',
          address: 'Gulberg III',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'PK',
          isDefault: true
        });

      expect(pkRes.status).toBe(201);
      expect(pkRes.body.data.address.countryCode).toBe('PK');
      expect(pkRes.body.data.address.phoneE164).toBe('+923001234567');

      // 2. UAE international address normalization
      const uaeRes = await request(app)
        .post('/api/account/addresses')
        .set('Authorization', customerAuth)
        .send({
          fullName: 'Zayd Al-Mansoor',
          phone: '+971 50 123 4567',
          address: 'Downtown Dubai, Boulevard Plaza',
          city: 'Dubai',
          province: 'Dubai',
          postalCode: '00000',
          country: 'AE'
        });

      expect(uaeRes.status).toBe(201);
      expect(uaeRes.body.data.address.countryCode).toBe('AE');
      expect(uaeRes.body.data.address.phoneE164).toBe('+971501234567');

      // 3. UK international address normalization
      const ukRes = await request(app)
        .post('/api/account/addresses')
        .set('Authorization', customerAuth)
        .send({
          fullName: 'Oliver Smith',
          phone: '+44 7911 123456',
          address: '10 Downing Street',
          city: 'London',
          province: 'Greater London',
          postalCode: 'SW1A 2AA',
          country: 'GB'
        });

      expect(ukRes.status).toBe(201);
      expect(ukRes.body.data.address.countryCode).toBe('GB');
      expect(ukRes.body.data.address.phoneE164).toBe('+447911123456');

      // 4. Invalid country format returns 400 validation error without leaking PII
      const invalidRes = await request(app)
        .post('/api/account/addresses')
        .set('Authorization', customerAuth)
        .send({
          fullName: 'Invalid User',
          phone: '+44 7911 123456',
          address: 'Invalid Street',
          city: 'London',
          province: 'London',
          postalCode: '12345',
          country: 'INVALID_COUNTRY'
        });

      expect(invalidRes.status).toBe(400);

      // 5. Market ineligible country returns 409
      const ineligibleRes = await request(app)
        .post('/api/account/addresses')
        .set('Authorization', customerAuth)
        .send({
          fullName: 'Ineligible User',
          phone: '+33 1 23 45 67 89',
          address: 'Rue de Paris',
          city: 'Paris',
          province: 'Paris',
          postalCode: '75001',
          country: 'FR'
        });

      expect(ineligibleRes.status).toBe(409);

      // Clean up
      config.enabledCountries = ['PK'];
      config.enabledCurrencies = ['PKR'];
      await config.save();
    });
  });
});
