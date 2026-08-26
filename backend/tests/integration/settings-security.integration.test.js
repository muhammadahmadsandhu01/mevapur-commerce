const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Setting = require('../../models/Setting');
const ActivityLog = require('../../models/ActivityLog');
const {
  LEGACY_PROVIDER_SECRET_PATHS
} = require('../../services/SettingSecurityService');

const SYNTHETIC_VALUES = Object.freeze({
  jazzcash_password: 'synthetic-jazzcash-placeholder',
  visa_api_key: 'synthetic-visa-api-placeholder',
  visa_secret_key: 'synthetic-visa-secret-placeholder',
  mastercard_api_key: 'synthetic-mastercard-api-placeholder',
  mastercard_secret_key: 'synthetic-mastercard-secret-placeholder'
});

let sequence = 0;
const authAs = async (role) => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `settings-security-${role}-${sequence}@example.test`,
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

  return `Bearer ${TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  })}`;
};

const insertLegacySettings = () => Setting.collection.insertOne({
  store: { store_name: 'Security Test Store' },
  payment: {
    cod_enabled: true,
    jazzcash_enabled: true,
    jazzcash_merchant_id: 'SYNTHETIC-MERCHANT',
    ...SYNTHETIC_VALUES
  }
});

const expectNoProviderSecrets = (payload) => {
  const serialized = JSON.stringify(payload);
  for (const [field, value] of Object.entries(SYNTHETIC_VALUES)) {
    expect(serialized).not.toContain(value);
    expect(serialized).not.toContain(field);
  }
};

describe('Environment-managed provider credentials', () => {
  test('does not define legacy provider-secret paths in the application schema', () => {
    for (const path of LEGACY_PROVIDER_SECRET_PATHS) {
      expect(Setting.schema.path(path)).toBeUndefined();
    }
  });

  test('requires admin authorization for settings reads and updates', async () => {
    const customerAuthorization = await authAs('customer');

    const unauthenticatedRead = await request(app).get('/api/settings');
    const unauthenticatedUpdate = await request(app)
      .put('/api/settings')
      .send({ store: { store_name: 'Not allowed' } });
    const forbiddenRead = await request(app)
      .get('/api/settings')
      .set('Authorization', customerAuthorization);
    const forbiddenUpdate = await request(app)
      .put('/api/settings')
      .set('Authorization', customerAuthorization)
      .send({ store: { store_name: 'Not allowed' } });

    expect(unauthenticatedRead.status).toBe(401);
    expect(unauthenticatedUpdate.status).toBe(401);
    expect(forbiddenRead.status).toBe(403);
    expect(forbiddenUpdate.status).toBe(403);
  });

  test('never returns legacy secrets and exposes only environment status to admins', async () => {
    await insertLegacySettings();
    const adminAuthorization = await authAs('admin');

    const adminResponse = await request(app)
      .get('/api/settings')
      .set('Authorization', adminAuthorization);
    const publicResponse = await request(app).get('/api/settings/public');

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.providerCredentials).toEqual({
      management: 'environment',
      stripe: {
        configured: true,
        serverCredentialConfigured: true,
        publishableKeyConfigured: true,
        webhookConfigured: true
      },
      jazzcash: { configured: false },
      easypaisa: { configured: false }
    });
    expectNoProviderSecrets(adminResponse.body);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.data).not.toHaveProperty('providerCredentials');
    expectNoProviderSecrets(publicResponse.body);
  });

  test('rejects provider credential submissions without persistence or activity logging', async () => {
    await insertLegacySettings();
    const adminAuthorization = await authAs('admin');
    const submitted = 'synthetic-submitted-provider-placeholder';

    const response = await request(app)
      .put('/api/settings')
      .set('Authorization', adminAuthorization)
      .send({
        payment: {
          visa_secret_key: submitted,
          stripe_webhook_secret: submitted
        }
      });
    const stored = await Setting.collection.findOne({});
    const activity = await ActivityLog.findOne({ action: 'SETTINGS_UPDATE' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      'PROVIDER_CREDENTIALS_ENVIRONMENT_MANAGED'
    );
    expect(JSON.stringify(response.body)).not.toContain(submitted);
    expect(stored.payment.visa_secret_key).toBe(SYNTHETIC_VALUES.visa_secret_key);
    expect(stored.payment).not.toHaveProperty('stripe_webhook_secret');
    expect(activity).toBeNull();
  });

  test('keeps non-secret settings editable without touching legacy fields', async () => {
    await insertLegacySettings();
    const adminAuthorization = await authAs('admin');

    const response = await request(app)
      .put('/api/settings')
      .set('Authorization', adminAuthorization)
      .send({
        payment: {
          cod_enabled: false,
          jazzcash_merchant_id: 'UPDATED-MERCHANT'
        }
      });
    const stored = await Setting.collection.findOne({});
    const activity = await ActivityLog.findOne({ action: 'SETTINGS_UPDATE' });

    expect(response.status).toBe(200);
    expect(response.body.data.payment).toMatchObject({
      cod_enabled: false,
      jazzcash_merchant_id: 'UPDATED-MERCHANT'
    });
    expect(response.body.data.providerCredentials.management).toBe('environment');
    expectNoProviderSecrets(response.body);
    for (const path of LEGACY_PROVIDER_SECRET_PATHS) {
      const field = path.split('.').at(-1);
      expect(stored.payment[field]).toBe(SYNTHETIC_VALUES[field]);
    }
    expect(activity).not.toBeNull();
    expect(activity.details.groupsUpdated).toEqual(['payment']);
    expectNoProviderSecrets(activity.toObject());
  });
});
