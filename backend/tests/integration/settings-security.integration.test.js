const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Setting = require('../../models/Setting');
const ActivityLog = require('../../models/ActivityLog');
const {
  SECRET_MASK,
  SECRET_SETTING_PATHS
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

const createSecretSettings = () => Setting.create({
  store: { store_name: 'Security Test Store' },
  payment: {
    cod_enabled: true,
    jazzcash_enabled: true,
    jazzcash_merchant_id: 'SYNTHETIC-MERCHANT',
    ...SYNTHETIC_VALUES
  }
});

const loadSecretsFromDatabase = () => Setting.findOne().select(
  SECRET_SETTING_PATHS.map((path) => `+${path}`).join(' ')
);

const expectNoSecretValues = (payload) => {
  const serialized = JSON.stringify(payload);
  for (const value of Object.values(SYNTHETIC_VALUES)) {
    expect(serialized).not.toContain(value);
  }
};

describe('Settings secret security', () => {
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

  test('never returns stored secrets from admin or public reads', async () => {
    await createSecretSettings();
    const adminAuthorization = await authAs('admin');

    const adminResponse = await request(app)
      .get('/api/settings')
      .set('Authorization', adminAuthorization);
    const publicResponse = await request(app).get('/api/settings/public');

    expect(adminResponse.status).toBe(200);
    expectNoSecretValues(adminResponse.body);
    for (const field of Object.keys(SYNTHETIC_VALUES)) {
      expect(adminResponse.body.data.payment[field]).toBe(SECRET_MASK);
      expect(publicResponse.body.data.payment).not.toHaveProperty(field);
    }
    expect(publicResponse.status).toBe(200);
    expectNoSecretValues(publicResponse.body);
  });

  test('preserves omitted, empty, null, and masked secrets during non-secret updates', async () => {
    await createSecretSettings();
    const adminAuthorization = await authAs('admin');

    const response = await request(app)
      .put('/api/settings')
      .set('Authorization', adminAuthorization)
      .send({
        payment: {
          jazzcash_merchant_id: 'UPDATED-MERCHANT',
          jazzcash_password: SECRET_MASK,
          visa_api_key: '',
          visa_secret_key: null,
          mastercard_secret_key: SECRET_MASK
        }
      });
    const stored = await loadSecretsFromDatabase();

    expect(response.status).toBe(200);
    expect(response.body.data.payment.jazzcash_merchant_id).toBe('UPDATED-MERCHANT');
    expectNoSecretValues(response.body);
    for (const [field, value] of Object.entries(SYNTHETIC_VALUES)) {
      expect(stored.payment[field]).toBe(value);
      expect(response.body.data.payment[field]).toBe(SECRET_MASK);
    }
  });

  test('accepts an authorized replacement without echoing or logging it', async () => {
    await createSecretSettings();
    const adminAuthorization = await authAs('admin');
    const replacement = 'synthetic-authorized-replacement';

    const response = await request(app)
      .put('/api/settings')
      .set('Authorization', adminAuthorization)
      .send({ payment: { visa_secret_key: replacement } });
    const stored = await loadSecretsFromDatabase();
    const activity = await ActivityLog.findOne({ action: 'SETTINGS_UPDATE' });

    expect(response.status).toBe(200);
    expect(response.body.data.payment.visa_secret_key).toBe(SECRET_MASK);
    expect(JSON.stringify(response.body)).not.toContain(replacement);
    expect(stored.payment.visa_secret_key).toBe(replacement);
    expect(activity).not.toBeNull();
    expect(JSON.stringify(activity.toObject())).not.toContain(replacement);
    expect(activity.details.groupsUpdated).toEqual(['payment']);
  });
});
