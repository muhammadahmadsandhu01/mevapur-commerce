/**
 * @file phase8-admin-exceptions.integration.test.js
 * @description Integration tests for Admin Exception Queue Management,
 * Lifecycle Mutations, RBAC Enforcement, and CSV Export.
 */

'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const CustomerOperationException = require('../../models/CustomerOperationException');
const exceptionQueueService = require('../../services/exception/ExceptionQueueService');
const TokenService = require('../../services/TokenService');

describe('Phase 8 — Admin Operations Exception Queue Integration Tests', () => {
  let adminUser;
  let customerUser;
  let adminToken;
  let customerToken;
  let sampleException;

  const createAuth = async (role = 'admin') => {
    const user = await global.createTestUser({
      email: `phase8-admin-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
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
      tokenVersion: user.tokenVersion || 0
    });
    return { user, session, token };
  };

  beforeEach(async () => {
    await CustomerOperationException.deleteMany({});

    const authAdmin = await createAuth('admin');
    adminUser = authAdmin.user;
    adminToken = authAdmin.token;

    const authCust = await createAuth('customer');
    customerUser = authCust.user;
    customerToken = authCust.token;

    sampleException = await exceptionQueueService.recordException({
      type: 'PAYMENT_FAILED',
      domainType: 'payment',
      domainId: 'PAY-INT-001',
      errorCode: 'CARD_DECLINED',
      sanitizedSummary: 'Card was declined by issuing bank',
      severity: 'HIGH',
      retryEligible: true
    });
  });

  it('7.1 unauthenticated request to admin exception queue returns 401', async () => {
    const res = await request(app).get('/api/admin/exceptions');
    expect(res.status).toBe(401);
  });

  it('7.2 non-admin customer request returns 403 forbidden', async () => {
    const res = await request(app)
      .get('/api/admin/exceptions')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  it('7.3 admin can list exceptions with global metrics and filters', async () => {
    const res = await request(app)
      .get('/api/admin/exceptions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.metrics.totalOpen).toBe(1);
    expect(res.body.metrics.openCount).toBe(1);
  });

  it('7.4 admin can acknowledge an exception', async () => {
    const res = await request(app)
      .post(`/api/admin/exceptions/${sampleException.id}/acknowledge`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exception.status).toBe('ACKNOWLEDGED');
  });

  it('7.5 admin can escalate an exception', async () => {
    const res = await request(app)
      .post(`/api/admin/exceptions/${sampleException.id}/escalate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        escalatedTo: 'Head of Operations',
        reason: 'Payment gateway timeout across multiple users'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exception.status).toBe('ESCALATED');
    expect(res.body.data.exception.severity).toBe('CRITICAL');
  });

  it('7.6 admin can resolve an exception with resolution reason', async () => {
    const res = await request(app)
      .post(`/api/admin/exceptions/${sampleException.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        resolutionReason: 'Customer completed payment via manual transfer reference',
        resolutionCode: 'MANUAL_VERIFIED'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.exception.status).toBe('RESOLVED');
  });

  it('7.7 admin can export formula-safe CSV', async () => {
    const res = await request(app)
      .get('/api/admin/exceptions/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Exception Number,Type,Severity,Status');
    expect(res.text).toContain('PAYMENT_FAILED');
  });
});
