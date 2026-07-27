const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../app');

let mongoServer;
let authToken;
let testUser;

// Connect to in-memory DB before tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
});

// Clear DB between tests
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Close DB after tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Helper: Create Test User
global.createTestUser = async (overrides = {}) => {
  const User = require('../models/User');
  return await User.create({
    fullName: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'SecurePass123!',
    phone: '03001234567',
    role: 'customer',
    isVerified: true,
    ...overrides
  });
};

// Helper: Get Auth Token
global.getAuthToken = async (email, password) => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  
  if (res.body.success) {
    authToken = res.body.data.accessToken;
    testUser = res.body.data.user;
    return authToken;
  }
  throw new Error('Login failed');
};

// Helper: Auth Header
global.authHeader = () => ({
  Authorization: `Bearer ${authToken}`,
  'Content-Type': 'application/json'
});