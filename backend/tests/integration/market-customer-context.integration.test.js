const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Order = require('../../models/Order');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const TokenService = require('../../services/TokenService');

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

describe('Market Customer Context Integration Tests', () => {
  let defaultCategory;
  let activeConfig;

  beforeEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Order.deleteMany({});
    await CommerceConfigurationVersion.deleteMany({});

    defaultCategory = await Category.create({
      name: 'Dry Fruits',
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
      shippingRules: [],
      taxRules: []
    });
  });

  describe('1. Registration Country Requirements', () => {
    it('1. New registration requires valid ISO 3166-1 alpha-2 residence country', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Alice Walker',
          email: `alice-${Date.now()}@example.test`,
          password: 'Password1984!',
          residenceCountry: 'GB'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.residenceCountry).toBe('GB');
      expect(res.body.data.user.isCountryComplete).toBe(true);
    });

    it('2. Registration fails closed without residenceCountry', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Bob Smith',
          email: `bob-${Date.now()}@example.test`,
          password: 'Password1984!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('3. Registration rejects invalid / free-text country code (no silent PK default)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Charlie Brown',
          email: `charlie-${Date.now()}@example.test`,
          password: 'Password1984!',
          residenceCountry: 'UNKNOWN_COUNTRY'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Legacy User Compatibility & Incomplete Profile Handling', () => {
    it('4. Existing countryless user can log in, but is marked country-incomplete', async () => {
      // Simulate existing legacy user without residenceCountry
      const legacyUser = await User.create({
        fullName: 'Legacy Customer',
        email: `legacy-${Date.now()}@example.test`,
        password: 'Password1984!',
        role: 'customer',
        isVerified: true,
        residenceCountry: null
      });

      const token = await createAuthToken(legacyUser);

      const profileRes = await request(app)
        .get('/api/account/profile')
        .set('Authorization', token);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.data.profile.residenceCountry).toBeNull();
      expect(profileRes.body.data.profile.isCountryComplete).toBe(false);
    });

    it('5. Legacy countryless user cannot place order until residenceCountry is completed', async () => {
      const legacyUser = await User.create({
        fullName: 'Legacy Shopper',
        email: `legacy-shopper-${Date.now()}@example.test`,
        password: 'Password1984!',
        role: 'customer',
        isVerified: true,
        residenceCountry: null
      });

      const token = await createAuthToken(legacyUser);

      const product = await Product.create({
        name: 'Organic Cashews',
        slug: `cashews-${Date.now()}`,
        price: 1200,
        stock: 50,
        category: defaultCategory._id,
        isActive: true,
        status: 'published'
      });

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', token)
        .set('Idempotency-Key', `idemp-${Date.now()}`)
        .send({
          items: [{ productId: product._id, quantity: 1 }],
          shippingAddress: {
            fullName: 'Legacy Shopper',
            address: '123 Main St',
            city: 'Karachi',
            province: 'Sindh',
            postalCode: '74000',
            country: 'Pakistan',
            phone: '03001234567'
          },
          paymentMethod: 'cod',
          currency: 'PKR'
        });

      expect(orderRes.status).toBe(400);
      const errMsg = orderRes.body.error?.message || orderRes.body.message || '';
      expect(errMsg).toMatch(/residence country/i);
    });
  });

  describe('3. Profile Update & Market Preferences', () => {
    it('6. Authenticated user can set preferredMarketCountry different from residenceCountry', async () => {
      const user = await global.createTestUser({
        residenceCountry: 'PK'
      });
      const token = await createAuthToken(user);

      const updateRes = await request(app)
        .patch('/api/account/profile')
        .set('Authorization', token)
        .send({
          preferredMarketCountry: 'GB'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.profile.residenceCountry).toBe('PK');
      expect(updateRes.body.data.profile.preferredMarketCountry).toBe('GB');
      expect(updateRes.body.data.profile.isCountryComplete).toBe(true);
    });

    it('7. Updating preferredMarketCountry to a disabled merchant country is rejected', async () => {
      const user = await global.createTestUser({
        residenceCountry: 'PK'
      });
      const token = await createAuthToken(user);

      const updateRes = await request(app)
        .patch('/api/account/profile')
        .set('Authorization', token)
        .send({
          preferredMarketCountry: 'FR' // FR is not in activeConfig.enabledCountries
        });

      expect(updateRes.status).toBe(400);
      const errMsg = updateRes.body.error?.message || updateRes.body.message || '';
      expect(errMsg).toMatch(/not enabled/i);
    });

    it('8. Changing customer residence country does not alter past historical orders', async () => {
      const user = await global.createTestUser({
        residenceCountry: 'PK'
      });
      const token = await createAuthToken(user);

      const product = await Product.create({
        name: 'Pistachio Kernel',
        slug: `pistachio-${Date.now()}`,
        price: 2500,
        stock: 30,
        category: defaultCategory._id,
        isActive: true,
        status: 'published'
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: product._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        eligibleFulfillmentOriginIds: ['origin-pk-1'],
        effectiveFrom: new Date('2026-01-01'),
        lockVersion: 1
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: product._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        currencyExponent: 2,
        amountMinor: '250000',
        priceSource: 'manual',
        status: 'active',
        effectiveFrom: new Date('2026-01-01'),
        lockVersion: 1
      });

      // Place domestic order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', token)
        .set('Idempotency-Key', `idemp-${Date.now()}`)
        .send({
          items: [{ productId: product._id, quantity: 1 }],
          shippingAddress: {
            fullName: 'Test Buyer',
            address: 'Clifton Block 2',
            city: 'Karachi',
            province: 'Sindh',
            postalCode: '75600',
            country: 'Pakistan',
            phone: '03001234567'
          },
          paymentMethod: 'cod',
          currency: 'PKR'
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.orderId;

      // Update residence country to AE
      const updateRes = await request(app)
        .patch('/api/account/profile')
        .set('Authorization', token)
        .send({
          residenceCountry: 'AE'
        });
      expect(updateRes.status).toBe(200);

      // Verify past order was unchanged
      const pastOrder = await Order.findOne({ orderId });
      expect(pastOrder.shippingAddress.countryCode).toBe('PK');
      expect(pastOrder.currency).toBe('PKR');
    });
  });
});
