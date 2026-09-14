const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const TokenService = require('../../services/TokenService');

const createAuthToken = async (role = 'admin') => {
  const user = await global.createTestUser({
    role,
    residenceCountry: 'PK'
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
    tokenVersion: user.tokenVersion || 0
  });

  return { token: `Bearer ${token}`, user };
};

describe('Market Admin Management & Security Integration Tests', () => {
  let defaultCategory;
  let activeConfig;
  let testProduct;

  beforeEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await CommerceConfigurationVersion.deleteMany({});
    await ProductMarketOffering.deleteMany({});
    await MarketPriceBook.deleteMany({});

    defaultCategory = await Category.create({
      name: 'Dry Fruits & Spices',
      slug: `dry-fruits-spices-${Date.now()}`,
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

    testProduct = await Product.create({
      name: 'Hunza Saffron',
      slug: `hunza-saffron-${Date.now()}`,
      price: 5000,
      stock: 25,
      category: defaultCategory._id,
      isActive: true,
      status: 'published'
    });
  });

  describe('1. RBAC & Merchant Scope Protection', () => {
    it('1. Regular customer cannot access admin product offering endpoints (403)', async () => {
      const { token } = await createAuthToken('customer');

      const getRes = await request(app)
        .get(`/api/admin/products/${testProduct._id}/offerings`)
        .set('Authorization', token);
      expect(getRes.status).toBe(403);

      const putRes = await request(app)
        .put(`/api/admin/products/${testProduct._id}/offerings`)
        .set('Authorization', token)
        .send({
          marketCountry: 'GB',
          status: 'active'
        });
      expect(putRes.status).toBe(403);
    });

    it('2. Admin can create and list offerings for enabled market country', async () => {
      const { token } = await createAuthToken('admin');

      const putRes = await request(app)
        .put(`/api/admin/products/${testProduct._id}/offerings`)
        .set('Authorization', token)
        .send({
          marketCountry: 'GB',
          status: 'active',
          visibility: 'visible',
          fulfillmentMode: 'cross_border',
          eligibleFulfillmentOriginIds: ['origin-pk-main']
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.offerings[0].marketCountry).toBe('GB');
      expect(putRes.body.data.offerings[0].status).toBe('active');
      expect(putRes.body.data.offerings[0].lockVersion).toBe(1);

      const listRes = await request(app)
        .get(`/api/admin/products/${testProduct._id}/offerings`)
        .set('Authorization', token);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.offerings.length).toBe(1);
      expect(listRes.body.data.offerings[0].marketCountry).toBe('GB');
    });

    it('3. Admin cannot activate offering for a disabled merchant market country', async () => {
      const { token } = await createAuthToken('admin');

      const putRes = await request(app)
        .put(`/api/admin/products/${testProduct._id}/offerings`)
        .set('Authorization', token)
        .send({
          marketCountry: 'IT', // IT is disabled in config
          status: 'active',
          visibility: 'visible',
          fulfillmentMode: 'cross_border'
        });

      expect(putRes.status).toBe(400);
      const errMsg = putRes.body.error?.message || putRes.body.message || '';
      expect(errMsg).toMatch(/not enabled/i);
    });
  });

  describe('2. Exact Price Book Management & Concurrency Control', () => {
    it('4. Admin can configure exact price book for enabled currency', async () => {
      const { token } = await createAuthToken('admin');

      const putRes = await request(app)
        .put(`/api/admin/products/${testProduct._id}/prices`)
        .set('Authorization', token)
        .send({
          marketCountry: 'GB',
          currency: 'GBP',
          currencyExponent: 2,
          amountMinor: '4500', // GBP 45.00
          compareAtAmountMinor: '5500',
          priceSource: 'manual'
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.prices[0].amountMinor).toBe('4500');
      expect(putRes.body.data.prices[0].currency).toBe('GBP');
      expect(putRes.body.data.prices[0].lockVersion).toBe(1);

      const listRes = await request(app)
        .get(`/api/admin/products/${testProduct._id}/prices`)
        .set('Authorization', token);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.prices.length).toBe(1);
    });

    it('5. Optimistic concurrency conflict (409) returned when lockVersion is stale', async () => {
      const { token } = await createAuthToken('admin');

      // Create initial offering (lockVersion = 1)
      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: testProduct._id,
        marketCountry: 'GB',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'cross_border',
        lockVersion: 1
      });

      // Attempt update with wrong lockVersion
      const conflictRes = await request(app)
        .put(`/api/admin/products/${testProduct._id}/offerings`)
        .set('Authorization', token)
        .send({
          marketCountry: 'GB',
          status: 'suspended',
          lockVersion: 999 // Mismatched!
        });

      expect(conflictRes.status).toBe(409);
      const errMsg = conflictRes.body.error?.message || conflictRes.body.message || '';
      expect(errMsg).toMatch(/concurrency conflict|another request|modified by another/i);
    });

    it('6. Non-digit floating-point amountMinor is rejected by schema validator', async () => {
      const { token } = await createAuthToken('admin');

      const badRes = await request(app)
        .put(`/api/admin/products/${testProduct._id}/prices`)
        .set('Authorization', token)
        .send({
          marketCountry: 'GB',
          currency: 'GBP',
          currencyExponent: 2,
          amountMinor: '45.00', // Floating point forbidden in amountMinor
          priceSource: 'manual'
        });

      expect(badRes.status).toBe(400);
    });
  });
});
