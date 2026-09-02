const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const ActivityLog = require('../../models/ActivityLog');
const AuditLog = require('../../models/AuditLog');
const AuditService = require('../../services/AuditService');

let sequence = 0;

const createAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `activity-test-${sequence}-${role}@example.test`,
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

  return { token: `Bearer ${token}`, user, session };
};

describe('Phase 4: Activity Log, Security Audit & Redaction Integrity', () => {
  describe('RBAC matrix verification', () => {
    const CANONICAL_ROLES = ['customer', 'support', 'inventory', 'manager', 'admin', 'super_admin'];

    test('GET /api/activity-logs is allowed only for manager, admin, super_admin', async () => {
      for (const role of CANONICAL_ROLES) {
        const { token } = await createAuthToken(role);
        const res = await request(app).get('/api/activity-logs').set('Authorization', token);
        if (['manager', 'admin', 'super_admin'].includes(role)) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      }
    });

    test('GET /api/activity-logs/export is allowed only for admin, super_admin', async () => {
      for (const role of CANONICAL_ROLES) {
        const { token } = await createAuthToken(role);
        const res = await request(app).get('/api/activity-logs/export').set('Authorization', token);
        if (['admin', 'super_admin'].includes(role)) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      }
    });
  });

  describe('Removed endpoints verification', () => {
    test('POST /api/activity-logs and DELETE /api/activity-logs/cleanup are removed', async () => {
      const { token: superAdminToken } = await createAuthToken('super_admin');

      const postRes = await request(app)
        .post('/api/activity-logs')
        .set('Authorization', superAdminToken)
        .send({ action: 'TEST', description: 'Test' });

      expect(postRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete('/api/activity-logs/cleanup')
        .set('Authorization', superAdminToken)
        .send({ days: 90 });

      expect(deleteRes.status).toBe(404);
    });
  });

  describe('Activity CSV Export with RFC-4180 and Formula Injection Neutralization', () => {
    test('exports exact 10 columns and neutralizes spreadsheet formula injection', async () => {
      const { token: adminToken, user } = await createAuthToken('admin');

      // Create an activity log containing potentially malicious formula string
      await ActivityLog.create({
        user: user._id,
        action: 'PRODUCT_CREATE',
        description: '=cmd|/C calc!A0',
        resourceType: 'Product',
        resourceId: new mongoose.Types.ObjectId(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        browser: 'Chrome',
        os: 'Windows'
      });

      const res = await request(app)
        .get('/api/activity-logs/export')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename=');

      const csvContent = res.text;
      const lines = csvContent.replace(/^\uFEFF/, '').trim().split('\r\n');

      const expectedHeaders = 'Timestamp,Event,Actor ID,Actor Name,Actor Role,Resource Type,Resource ID,Description,Request ID,Outcome';
      expect(lines[0]).toBe(expectedHeaders);

      // Verify formula trigger is escaped with leading single quote: '=cmd...
      expect(csvContent).toContain("'=cmd|/C calc!A0");

      // Verify AuditLog recorded the export event
      const exportAudit = await AuditLog.findOne({
        eventName: 'ACTIVITY.EXPORTED',
        userId: user._id
      });
      expect(exportAudit).not.toBeNull();
      expect(exportAudit.metadata.recordsExported).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Deep Recursive Redaction in AuditService', () => {
    test('sanitizes sensitive tokens, passwords, and neutralizing CRLF injection', async () => {
      const { user } = await createAuthToken('customer');

      const logged = await AuditService.log({
        eventName: 'SECURITY.SUSPICIOUS_ACTIVITY',
        userId: user._id,
        status: 'SUCCESS',
        metadata: {
          token: 'secret-token-abc',
          deepNested: {
            auth: {
              password: 'SuperSecretPassword123!',
              safeKey: 'SafeValue\r\nInjectedHeader'
            }
          },
          url: 'https://api.mevapur.test/auth?token=super-secret-param&user=1'
        }
      });

      expect(logged).not.toBeNull();
      expect(logged.metadata.token).toBe('[REDACTED]');
      expect(logged.metadata.deepNested.auth.password).toBe('[REDACTED]');
      expect(logged.metadata.deepNested.auth.safeKey).not.toContain('\r');
      expect(logged.metadata.deepNested.auth.safeKey).not.toContain('\n');
      expect(logged.metadata.url).toContain('token=[REDACTED]');
    });
  });
});
