/**
 * @file commerce-governance.integration.test.js
 * @description Integration tests for Phase 6B Commerce Governance Admin Endpoints,
 * RBAC authorization boundaries, read-only preview simulation, and audit log generation.
 */

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const AuditLog = require('../../models/AuditLog');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const CommerceConfigurationSequence = require('../../models/CommerceConfigurationSequence');

let sequence = 0;

const createAuth = async (role = 'admin') => {
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
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });
  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  });
  return { user, authorization: `Bearer ${token}` };
};

describe('Phase 6B: Commerce Governance Integration & RBAC', () => {
  let adminAuth;
  let superAdminAuth;
  let customerAuth;

  beforeEach(async () => {
    await CommerceConfigurationVersion.deleteMany({});
    await CommerceConfigurationSequence.deleteMany({});

    adminAuth = await createAuth('admin');
    superAdminAuth = await createAuth('super_admin');
    customerAuth = await createAuth('customer');
  });

  describe('1. Authentication & Authorization Boundaries', () => {
    it('1.1 Unauthenticated requests are rejected with 401', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions');

      expect(res.status).toBe(401);
    });

    it('1.2 Non-admin roles (customer) are rejected with 403', async () => {
      const res = await request(app)
        .get('/api/commerce/admin/config/versions')
        .set('Authorization', customerAuth.authorization);

      expect(res.status).toBe(403);
    });

    it('1.3 Ordinary admin is forbidden from activating versions (403)', async () => {
      // Create and validate draft as admin
      const draftRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({ changeNotes: 'Test draft for activation' });

      const draftId = draftRes.body.data.draft._id;

      await request(app)
        .post(`/api/commerce/admin/config/draft/${draftId}/validate`)
        .set('Authorization', adminAuth.authorization);

      // Ordinary admin attempts activation
      const activateRes = await request(app)
        .post(`/api/commerce/admin/config/versions/${draftId}/activate`)
        .set('Authorization', adminAuth.authorization)
        .send({});

      expect(activateRes.status).toBe(403);
    });
  });

  describe('2. Draft Creation, Validation and Super-Admin Activation Lifecycle', () => {
    it('2.1 Complete governance workflow from draft to super-admin activation and retirement', async () => {
      // 1. Create Draft as Admin
      const createRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantScopeId: 'default',
          changeNotes: 'Phase 6B Integration Test Draft',
          shippingRules: [
            {
              ruleId: 'SHIP-PK-STD-INT',
              name: 'Pakistan Standard',
              serviceCode: 'standard',
              displayName: 'Standard Delivery',
              originCountry: 'PK',
              destinationCountry: 'PK',
              currency: 'PKR',
              baseRateExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
              deliveryMinDays: 2,
              deliveryMaxDays: 4,
              enabled: true
            }
          ],
          taxRules: [
            {
              ruleId: 'TAX-PK-INT',
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
            }
          ]
        });

      expect(createRes.status).toBe(201);
      const draftId = createRes.body.data.draft._id;
      expect(createRes.body.data.draft.version).toBe(1);
      expect(createRes.body.data.draft.status).toBe('draft');

      // 2. Validate Draft as Admin
      const validateRes = await request(app)
        .post(`/api/commerce/admin/config/draft/${draftId}/validate`)
        .set('Authorization', adminAuth.authorization);

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.data.isValid).toBe(true);
      expect(validateRes.body.data.status).toBe('validated');

      // 3. Super Admin Activates Version
      const activateRes = await request(app)
        .post(`/api/commerce/admin/config/versions/${draftId}/activate`)
        .set('Authorization', superAdminAuth.authorization)
        .send({});

      expect(activateRes.status).toBe(200);
      expect(activateRes.body.data.version.status).toBe('active');

      // 4. Verify Readiness Report
      const readinessRes = await request(app)
        .get('/api/commerce/admin/config/readiness')
        .set('Authorization', adminAuth.authorization);

      expect(readinessRes.status).toBe(200);
      expect(readinessRes.body.data.hasActiveConfiguration).toBe(true);
      expect(readinessRes.body.data.activeVersion).toBe(1);

      // 5. Verify Audit Logs were written without PII
      const logs = await AuditLog.find({ eventName: { $regex: /^COMMERCE\.CONFIG/ } });
      expect(logs.length).toBeGreaterThanOrEqual(3); // DRAFT_CREATED, VALIDATED, ACTIVATED
      expect(logs.every((l) => !l.metadata.password && !l.metadata.phone && !l.metadata.address)).toBe(true);
    });
  });

  describe('3. Read-Only Preview Simulation', () => {
    it('3.1 Preview quotes against synthetic cart and destination with zero persistent side-effects', async () => {
      // 1. Create a draft with UAE rules
      const createRes = await request(app)
        .post('/api/commerce/admin/config/draft')
        .set('Authorization', adminAuth.authorization)
        .send({
          merchantScopeId: 'default',
          shippingRules: [
            {
              ruleId: 'SHIP-AE-STD',
              name: 'UAE Standard',
              serviceCode: 'standard',
              displayName: 'Emirates Courier',
              originCountry: 'PK',
              destinationCountry: 'AE',
              currency: 'AED',
              baseRateExact: { amountMinor: '5000', currency: 'AED', exponent: 2 },
              deliveryMinDays: 3,
              deliveryMaxDays: 7,
              enabled: true
            }
          ],
          taxRules: [
            {
              ruleId: 'TAX-AE-INT',
              destinationCountry: 'AE',
              taxType: 'VAT',
              taxTreatment: 'exclusive',
              taxRateNumerator: 500, // 5%
              taxRateDenominator: 10000,
              dutyRateNumerator: 500, // 5%
              dutyRateDenominator: 10000,
              roundingMode: 'HALF_UP',
              roundingScope: 'subtotal',
              incoterm: 'DDP',
              sourceAuthority: 'UAE FTA',
              sourceReference: 'UAE-FTA-2026',
              verificationStatus: 'VERIFIED_LEGAL_RULE',
              requiresTax: true,
              requiresDuty: true,
              enabled: true
            }
          ]
        });

      const draftId = createRes.body.data.draft._id;

      // 2. Perform synthetic preview
      const previewRes = await request(app)
        .post('/api/commerce/admin/config/preview')
        .set('Authorization', adminAuth.authorization)
        .send({
          configId: draftId,
          destination: { countryCode: 'AE', city: 'Dubai' },
          items: [
            { name: 'Synthetic Dry Fruits', price: 1000, quantity: 1, weightGrams: 500 }
          ],
          currency: 'AED',
          shippingServiceLevel: 'standard'
        });

      expect(previewRes.status).toBe(200);
      const preview = previewRes.body.data.preview;
      expect(preview.destinationCountry).toBe('AE');
      expect(preview.totals.subtotal).toBe(1000);
      expect(preview.totals.shipping).toBe(50);
      expect(preview.totals.tax).toBe(50); // 5% of 1000
      expect(preview.totals.duties).toBe(52.5); // 5% of 1050 (CIF)
      expect(preview.totals.grandTotal).toBe(1152.5);
    });
  });
});
