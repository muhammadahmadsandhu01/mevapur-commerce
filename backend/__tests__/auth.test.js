const request = require('supertest');
const app = require('../server'); // Ensure server.js exports app
const mongoose = require('mongoose');

describe('Auth Module', () => {
  // Close DB connection after all tests
  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        fullName: 'Test User',
        email: `test${Date.now()}@example.com`,
        password: 'TestPass123!',
        phone: '1234567890'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).toHaveProperty('fullName', userData.fullName);
    });

    it('should fail if email already exists', async () => {
      // Note: This assumes the first test ran successfully
      // In real scenario, use specific test data cleanup
      const userData = {
        fullName: 'Duplicate User',
        email: 'duplicate@example.com',
        password: 'TestPass123!'
      };

      // First registration
      await request(app).post('/api/auth/register').send(userData);
      
      // Second registration
      const res = await request(app).post('/api/auth/register').send(userData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });it('should fail if email already exists', async () => {
      // Note: This assumes the first test ran successfully
      // In real scenario, use specific test data cleanup
      const userData = {
        fullName: 'Duplicate User',
        email: 'duplicate@example.com',
        password: 'TestPass123!'
      };

      // First registration
      await request(app).post('/api/auth/register').send(userData);
      
      // Second registration
      const res = await request(app).post('/api/auth/register').send(userData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation if password is weak', async () => {
      const userData = {
        fullName: 'Weak Pass User',
        email: `weak${Date.now()}@example.com`,
        password: '123' // Too short
      };

      const res = await request(app).post('/api/auth/register').send(userData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain('password');
    });
  });
});