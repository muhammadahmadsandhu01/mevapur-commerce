const request = require('supertest');
const app = require('../../../app');
const User = require('../../../models/User');

describe('Auth Integration Tests', () => {
  let accessToken, refreshToken;

  describe('POST /api/v1/auth/register', () => {
    it('should register new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Integration Test',
          email: `integration${Date.now()}@example.com`,
          password: 'SecurePass123!',
          phone: '03001234567'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Test',
          email: 'invalid-email',
          password: 'SecurePass123!'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeAll(async () => {
      await createTestUser({ 
        email: 'logintest@example.com',
        password: 'SecurePass123!'
      });
    });

    it('should login and return tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'SecurePass123!'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'WrongPassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user profile', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.user.email).toBe('logintest@example.com');
    });
  });
});