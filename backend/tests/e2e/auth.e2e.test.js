const request = require('supertest');
const app = require('../../../app');
const AuditLog = require('../../../models/AuditLog');

describe('Auth E2E Tests', () => {
  it('should complete full registration to logout flow', async () => {
    const email = `e2e${Date.now()}@example.com`;
    
    // 1. Register
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'E2E User',
        email,
        password: 'SecurePass123!',
        phone: '03001234567'
      });

    expect(registerRes.statusCode).toBe(201);
    const accessToken = registerRes.body.data.accessToken;

    // 2. Get Profile
    const profileRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(profileRes.statusCode).toBe(200);

    // 3. Logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(logoutRes.statusCode).toBe(200);

    // 4. Verify audit logs created
    const logs = await AuditLog.find({ action: { $in: ['AUTH.REGISTER', 'AUTH.LOGIN.SUCCESS', 'AUTH.LOGOUT'] } });
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('should lock account after 5 failed attempts', async () => {
    await createTestUser({ email: 'locktest@example.com' });

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'locktest@example.com',
          password: 'WrongPassword'
        });
    }

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'locktest@example.com',
        password: 'WrongPassword'
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
  });
});