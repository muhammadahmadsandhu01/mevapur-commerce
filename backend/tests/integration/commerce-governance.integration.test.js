/**
 * @file commerce-governance.integration.test.js
 * @description Integration tests for Phase 6B Commerce Governance Admin Endpoints,
 * RBAC authorization boundaries, read-only preview simulation, database-backed concurrency,
 * document bounds enforcement, and order identifier backward-compatibility.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const User = require('../../models/User');
const Order = require('../../models/Order');
const AuditLog = require('../../models/AuditLog');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const CommerceConfigurationSequence = require('../../models/CommerceConfigurationSequence');

let sequence = 0;

const generateExpiredJwt = (user, session) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      userId: user._id.toString(),
      sessionId: session._id.toString(),
      tokenVersion: user.tokenVersion,
      role: user.role
    },
    process.env.JWT_SECRET || 'test-only-auth-secret-that-is-never-used-outside-tests',
    { expiresIn: -10 }
  );
};

const createAuth = async (role = 'admin', options = {}) => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `gov-test-${sequence}@example.test`,
    role
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: Boolean(options.sessionRevoked),
    expiresAt: options.sessionExpired
      ? new Date(Date.now() - 10000)
      : new Date(Date.now() + 3600000)
  });
  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  });
  return {
    user,
    session,
    token,
    authorization: `Bearer ${token}`,
    expiredJwtAuthorization: `Bearer ${generateExpiredJwt(user, session)}`
  };
};

const createTestShippingRule = (ruleId = 'SHIP-PK-STD-INT', origin = 'PK', dest = 'PK') => ({
  ruleId,
  name: `Shipping Rule ${ruleId}`,
  serviceCode: 'standard',
  displayName: 'Standard Delivery',
  originCountry: origin,
  destinationCountry: dest,
  currency: 'PKR',
  baseRateExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
  deliveryMinDays: 2,
  deliveryMaxDays: 4,
  enabled: true
});

const createTestTaxRule = (ruleId = 'TAX-PK-INT', dest = 'PK') => ({
  ruleId,
  destinationCountry: dest,
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
});

describe('Phase 6B: Commerce Governance Integration & Concurrency Suite', () => {
  let adminAuth;
  let superAdminAuth;
  let customerAuth;
  let supportAuth;
  let inventoryAuth;
  let managerAuth;

  beforeEach(async () => {
    await CommerceConfigurationVersion.deleteMany({});
    await CommerceConfigurationSequence.deleteMany({});
    await Order.deleteMany({});

    adminAuth = await createAuth('admin');
    superAdminAuth = await createAuth('super_admin');
    customerAuth = await createAuth('customer');
    supportAuth = await createAuth('support');
    inventoryAuth = await createAuth('inventory');
    managerAuth = await createAuth('manager');
  });

  describe('1. Authentication & Complete RBAC Matrix', () => {
    it('1.1 Unauthenticated requests are rejected with 401', async () => {
      const res = await request(app).get('/api/commerce/admin/config/versions');
      expect(res.status).toBe(401);
    });

    it('1.2 Malformed authorization token is rejected with 401', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', 'Bearer invalid-malformed-token-string');
      expect(res.status).toBe(401);
    });

    it('1.3 Expired token is rejected with 401', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', adminAuth.expiredJwtAuthorization);
      expect(res.status).toBe(401);
    });

    it('1.4 Revoked session token is rejected with 401', async () => {
      await Session.findByIdAndUpdate(adminAuth.session._id, { isRevoked: true });
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', adminAuth.authorization);
      expect(res.status).toBe(401);
    });

    it('1.5 Customer role is rejected with 403', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', customerAuth.authorization);
      expect(res.status).toBe(403);
    });

    it('1.6 Support role is rejected with 403', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', supportAuth.authorization);
      expect(res.status).toBe(403);
    });

    it('1.7 Inventory role is rejected with 403', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', inventoryAuth.authorization);
      expect(res.status).toBe(403);
    });

    it('1.8 Manager role is rejected with 403', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', managerAuth.authorization);
      expect(res.status).toBe(403);
    });

    it('1.9 Admin role is permitted draft creation, validation, preview and reading', async () => {
      // Create draft
      const draftRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({ changeNotes: 'Admin allowed draft' });
      expect(draftRes.status).toBe(201);
      const draftId = draftRes.body.data.draft._id;

      // Validate draft
      const valRes = await request(app)
        .post(`/api/commerce/admin/config/draft/${draftId}/validate`)
        .set('Authorization', adminAuth.authorization);
      expect(valRes.status).toBe(200);

      // List versions
      const listRes = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', adminAuth.authorization);
      expect(listRes.status).toBe(200);
    });

    it('1.10 Admin role is forbidden from activating or retiring versions (403)', async () => {
      const draftRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({ changeNotes: 'Admin activation test' });
      const draftId = draftRes.body.data.draft._id;

      await request(app)
        .post(`/api/commerce/admin/config/draft/${draftId}/validate`)
        .set('Authorization', adminAuth.authorization);

      // Admin activation attempt -> 403
      const actRes = await request(app)
        .post(`/api/commerce/admin/config/versions/${draftId}/activate`)
        .set('Authorization', adminAuth.authorization)
        .send({});
      expect(actRes.status).toBe(403);

      // Admin retirement attempt -> 403
      const retRes = await request(app)
        .post(`/api/commerce/admin/config/versions/${draftId}/retire`)
        .set('Authorization', adminAuth.authorization)
        .send({});
      expect(retRes.status).toBe(403);
    });

    it('1.11 Super Admin is permitted to activate and retire versions (200)', async () => {
      const draftRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          shippingRules: [createTestShippingRule('SHIP-SA-1')],
          taxRules: [createTestTaxRule('TAX-SA-1')]
        });
      const draftId = draftRes.body.data.draft._id;

      await request(app)
        .post(`/api/commerce/admin/config/draft/${draftId}/validate`)
        .set('Authorization', adminAuth.authorization);

      // Super admin activation -> 200
      const actRes = await request(app)
        .post(`/api/commerce/admin/config/versions/${draftId}/activate`)
        .set('Authorization', superAdminAuth.authorization)
        .send({});
      expect(actRes.status).toBe(200);
      expect(actRes.body.data.version.status).toBe('active');

      // Super admin retirement -> 200
      const retRes = await request(app)
        .post(`/api/commerce/admin/config/versions/${draftId}/retire`)
        .set('Authorization', superAdminAuth.authorization)
        .send({ reason: 'Governance rotation test' });
      expect(retRes.status).toBe(200);
      expect(retRes.body.data.version.status).toBe('retired');
    });
  });

  describe('2. Database-Backed Single-Active Invariant & Concurrency', () => {
    it('2.1 Simultaneous activation of two drafts results in at most one active version per scope', async () => {
      // Create draft 1 and draft 2
      const d1Res = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantScopeId: 'default',
          shippingRules: [createTestShippingRule('SHIP-C1-01')],
          taxRules: [createTestTaxRule('TAX-C1-01')]
        });
      const draft1Id = d1Res.body.data.draft._id;

      const d2Res = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantScopeId: 'default',
          shippingRules: [createTestShippingRule('SHIP-C2-01')],
          taxRules: [createTestTaxRule('TAX-C2-01')]
        });
      const draft2Id = d2Res.body.data.draft._id;

      // Validate both drafts
      await request(app)
        .post(`/api/commerce/admin/config/draft/${draft1Id}/validate`)
        .set('Authorization', adminAuth.authorization);

      await request(app)
        .post(`/api/commerce/admin/config/draft/${draft2Id}/validate`)
        .set('Authorization', adminAuth.authorization);

      // Concurrently activate both using Promise.allSettled
      const [res1, res2] = await Promise.allSettled([
        request(app)
          .post(`/api/commerce/admin/config/versions/${draft1Id}/activate`)
          .set('Authorization', superAdminAuth.authorization)
          .send({}),
        request(app)
          .post(`/api/commerce/admin/config/versions/${draft2Id}/activate`)
          .set('Authorization', superAdminAuth.authorization)
          .send({})
      ]);

      // Exactly one active version exists in MongoDB for scope 'default'
      const activeVersions = await CommerceConfigurationVersion.find({
        merchantScopeId: 'default',
        status: 'active'
      });
      expect(activeVersions.length).toBe(1);

      // Verify sequence and version allocation remains consistent
      const allVersions = await CommerceConfigurationVersion.find({ merchantScopeId: 'default' }).sort({ version: 1 });
      expect(allVersions.map((v) => v.version)).toEqual([1, 2]);
    });

    it('2.2 Different merchant scopes can activate concurrently without interference', async () => {
      // Create and validate for scope US
      const usDraftRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantScopeId: 'scope-us',
          merchantProfile: {
            merchantCountry: 'US',
            legalName: 'MevaPur US LLC',
            sellingMode: 'hybrid',
            baseCurrency: 'USD',
            defaultCurrency: 'USD',
            enabledCurrencies: ['USD'],
            enabledCountries: ['US'],
            defaultLocale: 'en-US',
            defaultTimeZone: 'America/New_York',
            fulfillmentOrigins: [{
              originId: 'ORIGIN-US-1',
              name: 'US East Warehouse',
              country: 'US',
              city: 'New York',
              timeZone: 'America/New_York',
              enabled: true,
              isDefault: true
            }],
            supportedIncoterms: ['DOMESTIC', 'DAP'],
            taxCalculationMode: 'exact_rational'
          },
          shippingRules: [createTestShippingRule('SHIP-US-1', 'US', 'US')],
          taxRules: [createTestTaxRule('TAX-US-1', 'US')]
        });
      const usDraftId = usDraftRes.body.data.draft._id;
      await request(app)
        .post(`/api/commerce/admin/config/draft/${usDraftId}/validate`)
        .set('Authorization', adminAuth.authorization);

      // Create and validate for scope GB
      const gbDraftRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantScopeId: 'scope-gb',
          merchantProfile: {
            merchantCountry: 'GB',
            legalName: 'MevaPur UK Ltd',
            sellingMode: 'hybrid',
            baseCurrency: 'GBP',
            defaultCurrency: 'GBP',
            enabledCurrencies: ['GBP'],
            enabledCountries: ['GB'],
            defaultLocale: 'en-GB',
            defaultTimeZone: 'Europe/London',
            fulfillmentOrigins: [{
              originId: 'ORIGIN-GB-1',
              name: 'UK Warehouse',
              country: 'GB',
              city: 'London',
              timeZone: 'Europe/London',
              enabled: true,
              isDefault: true
            }],
            supportedIncoterms: ['DOMESTIC', 'DAP'],
            taxCalculationMode: 'exact_rational'
          },
          shippingRules: [createTestShippingRule('SHIP-GB-1', 'GB', 'GB')],
          taxRules: [createTestTaxRule('TAX-GB-1', 'GB')]
        });
      const gbDraftId = gbDraftRes.body.data.draft._id;
      await request(app)
        .post(`/api/commerce/admin/config/draft/${gbDraftId}/validate`)
        .set('Authorization', adminAuth.authorization);

      // Concurrently activate both scopes
      const [usRes, gbRes] = await Promise.all([
        request(app)
          .post(`/api/commerce/admin/config/versions/${usDraftId}/activate`)
          .set('Authorization', superAdminAuth.authorization)
          .send({ merchantScopeId: 'scope-us' }),
        request(app)
          .post(`/api/commerce/admin/config/versions/${gbDraftId}/activate`)
          .set('Authorization', superAdminAuth.authorization)
          .send({ merchantScopeId: 'scope-gb' })
      ]);

      expect(usRes.status).toBe(200);
      expect(gbRes.status).toBe(200);

      const usActive = await CommerceConfigurationVersion.findOne({ merchantScopeId: 'scope-us', status: 'active' });
      const gbActive = await CommerceConfigurationVersion.findOne({ merchantScopeId: 'scope-gb', status: 'active' });

      expect(usActive).not.toBeNull();
      expect(gbActive).not.toBeNull();
      expect(usActive.merchantScopeId).toBe('scope-us');
      expect(gbActive.merchantScopeId).toBe('scope-gb');
    });

    it('2.3 Overlapping scheduled configuration is rejected with 409 conflict', async () => {
      const scheduleTime1 = new Date(Date.now() + 3600000); // 1 hour ahead
      const scheduleTime2 = new Date(Date.now() + 5400000); // 1.5 hours ahead

      // Create and schedule v1
      const d1Res = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          shippingRules: [createTestShippingRule('SHIP-SCHED-1')],
          taxRules: [createTestTaxRule('TAX-SCHED-1')]
        });
      const d1Id = d1Res.body.data.draft._id;
      await request(app).post(`/api/commerce/admin/config/draft/${d1Id}/validate`).set('Authorization', adminAuth.authorization);

      const sched1Res = await request(app)
        .post(`/api/commerce/admin/config/versions/${d1Id}/activate`)
        .set('Authorization', superAdminAuth.authorization)
        .send({ effectiveFrom: scheduleTime1.toISOString() });
      expect(sched1Res.status).toBe(200);
      expect(sched1Res.body.data.version.status).toBe('scheduled');

      // Create draft v2 and attempt to schedule overlapping with v1
      const d2Res = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          shippingRules: [createTestShippingRule('SHIP-SCHED-2')],
          taxRules: [createTestTaxRule('TAX-SCHED-2')]
        });
      const d2Id = d2Res.body.data.draft._id;
      await request(app).post(`/api/commerce/admin/config/draft/${d2Id}/validate`).set('Authorization', adminAuth.authorization);

      const sched2Res = await request(app)
        .post(`/api/commerce/admin/config/versions/${d2Id}/activate`)
        .set('Authorization', superAdminAuth.authorization)
        .send({ effectiveFrom: scheduleTime2.toISOString() });

      expect(sched2Res.status).toBe(409);
      expect(sched2Res.body.error.code).toBe('COMMERCE_CONFIG_SCHEDULE_CONFLICT');
    });
  });

  describe('3. Exact Document Bounds & Limit Enforcement', () => {
    it('3.1 Exactly maximum allowed counts succeed; Max + 1 fails validation before persistence', async () => {
      // 1. Max fulfillment origins = 20 (succeeds)
      const origins20 = Array.from({ length: 20 }, (_, i) => ({
        originId: `ORIGIN-PK-${i + 1}`,
        name: `Origin ${i + 1}`,
        country: 'PK',
        city: 'Karachi',
        timeZone: 'Asia/Karachi',
        enabled: true,
        isDefault: i === 0
      }));

      const maxOriginRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantProfile: {
            merchantCountry: 'PK',
            legalName: 'MevaPur',
            sellingMode: 'hybrid',
            baseCurrency: 'PKR',
            defaultCurrency: 'PKR',
            enabledCurrencies: ['PKR'],
            enabledCountries: ['PK'],
            defaultLocale: 'en-PK',
            defaultTimeZone: 'Asia/Karachi',
            fulfillmentOrigins: origins20,
            supportedIncoterms: ['DOMESTIC'],
            taxCalculationMode: 'exact_rational'
          }
        });
      expect(maxOriginRes.status).toBe(201);

      // 2. 21 fulfillment origins -> fails validation
      const origins21 = [...origins20, {
        originId: 'ORIGIN-PK-21',
        name: 'Origin 21',
        country: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        enabled: true,
        isDefault: false
      }];

      const overOriginRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantProfile: {
            merchantCountry: 'PK',
            legalName: 'MevaPur',
            sellingMode: 'hybrid',
            baseCurrency: 'PKR',
            defaultCurrency: 'PKR',
            enabledCurrencies: ['PKR'],
            enabledCountries: ['PK'],
            defaultLocale: 'en-PK',
            defaultTimeZone: 'Asia/Karachi',
            fulfillmentOrigins: origins21,
            supportedIncoterms: ['DOMESTIC'],
            taxCalculationMode: 'exact_rational'
          }
        });
      expect(overOriginRes.status).toBe(400);

      // 3. Weight bands bounds (max 20 per shipping rule)
      const bands20 = Array.from({ length: 20 }, (_, i) => ({
        minWeightGrams: i * 500,
        maxWeightGrams: (i + 1) * 500,
        rateExact: { amountMinor: '5000', currency: 'PKR', exponent: 2 },
        pricingMode: 'REPLACE_BASE'
      }));

      const ruleWith20Bands = {
        ...createTestShippingRule('SHIP-WB-20'),
        weightBands: bands20
      };

      const band20Res = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({ shippingRules: [ruleWith20Bands] });
      expect(band20Res.status).toBe(201);

      // 4. Weight bands 21 -> fails
      const bands21 = [...bands20, {
        minWeightGrams: 10000,
        maxWeightGrams: 10500,
        rateExact: { amountMinor: '5500', currency: 'PKR', exponent: 2 },
        pricingMode: 'REPLACE_BASE'
      }];
      const ruleWith21Bands = {
        ...createTestShippingRule('SHIP-WB-21'),
        weightBands: bands21
      };

      const band21Res = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({ shippingRules: [ruleWith21Bands] });
      expect(band21Res.status).toBe(400);
    });

    it('3.2 Preview request items are bounded to max 100 items', async () => {
      const draftRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          shippingRules: [createTestShippingRule('SHIP-PREV-01', 'PK', 'AE')],
          taxRules: [createTestTaxRule('TAX-PREV-01', 'AE')]
        });
      const draftId = draftRes.body.data.draft._id;

      // 100 items -> succeeds
      const items100 = Array.from({ length: 100 }, (_, i) => ({
        name: `Item ${i + 1}`,
        price: 100,
        quantity: 1
      }));

      const p100Res = await request(app)
        .post('/api/commerce/admin/config/preview')
        .set('Authorization', adminAuth.authorization)
        .send({
          configId: draftId,
          destination: { countryCode: 'AE' },
          items: items100
        });
      expect(p100Res.status).toBe(200);

      // 101 items -> rejected
      const items101 = [...items100, { name: 'Item 101', price: 100, quantity: 1 }];
      const p101Res = await request(app)
        .post('/api/commerce/admin/config/preview')
        .set('Authorization', adminAuth.authorization)
        .send({
          configId: draftId,
          destination: { countryCode: 'AE' },
          items: items101
        });
      expect(p101Res.status).toBe(400);
    });
  });

  describe('4. Order Model Legacy Identifier Safety', () => {
    it('4.1 Preserves historical orders with ObjectId zoneId without silent coercion or Mixed fields', async () => {
      const historicalZoneId = new mongoose.Types.ObjectId();
      const user = await global.createTestUser({ email: 'hist-order@example.test' });

      const historicalOrder = await Order.create({
        user: user._id,
        idempotencyKey: 'hist-key-001',
        requestHash: 'hist-hash-001',
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Historical Product',
          price: 500,
          quantity: 1,
          lineTotal: 500
        }],
        shippingAddress: {
          fullName: 'Historical Customer',
          phone: '+923001234567',
          address: 'Main Boulevard',
          city: 'Karachi',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        subtotal: 500,
        shippingCost: 200,
        shippingQuote: {
          zoneId: historicalZoneId,
          ruleId: null,
          zoneName: 'Legacy Karachi Zone',
          deliveryMinDays: 2,
          deliveryMaxDays: 4
        },
        totalAmount: 700,
        statusTimeline: [{
          status: 'Pending',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const fetched = await Order.findById(historicalOrder._id);
      expect(fetched).not.toBeNull();
      expect(fetched.shippingQuote.zoneId.toString()).toBe(historicalZoneId.toString());
      expect(fetched.shippingQuote.ruleId).toBeNull();
      expect(fetched.shippingQuote.zoneName).toBe('Legacy Karachi Zone');
    });

    it('4.2 Persists new governed orders with String ruleId and null zoneId safely', async () => {
      const user = await global.createTestUser({ email: 'new-gov-order@example.test' });

      const newOrder = await Order.create({
        user: user._id,
        idempotencyKey: 'gov-key-002',
        requestHash: 'gov-hash-002',
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Governed Product',
          price: 1500,
          quantity: 2,
          lineTotal: 3000
        }],
        shippingAddress: {
          fullName: 'Governed Customer',
          phone: '+923009876543',
          address: 'Clifton Block 2',
          city: 'Karachi',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        subtotal: 3000,
        shippingCost: 250,
        shippingQuote: {
          zoneId: null,
          ruleId: 'SHIP-PK-STD-01',
          zoneName: 'Standard Delivery',
          deliveryMinDays: 2,
          deliveryMaxDays: 4
        },
        totalAmount: 3250,
        statusTimeline: [{
          status: 'Pending',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const fetched = await Order.findById(newOrder._id);
      expect(fetched).not.toBeNull();
      expect(fetched.shippingQuote.zoneId).toBeNull();
      expect(fetched.shippingQuote.ruleId).toBe('SHIP-PK-STD-01');
      expect(fetched.shippingQuote.zoneName).toBe('Standard Delivery');
    });
  });
});
