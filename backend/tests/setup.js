if (process.env.MONGODB_URI) {
  throw new Error(
    'Refusing to run tests with an inherited database URI'
  );
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  'test-only-auth-secret-that-is-never-used-outside-tests';
process.env.AUTH_AUTO_VERIFY_EMAIL = 'true';
process.env.PAYMENT_EDITION = 'full';
process.env.PAYMENT_PROVIDER_COD_ENABLED = 'true';
process.env.PAYMENT_PROVIDER_STRIPE_ENABLED = 'true';
process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fake';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_isolated_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated_fake';
process.env.BANK_TRANSFER_ACCOUNT_TITLE = 'MevaPur Isolated Test';
process.env.BANK_TRANSFER_BANK_NAME = 'Isolated Test Bank';
process.env.BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE = 'TEST-ACCOUNT-0001';
process.env.RAAST_ACCOUNT_TITLE = 'MevaPur Isolated Test';
process.env.RAAST_PUBLIC_ID = 'test-raast-id';

const mongoose = require('mongoose');

let userSequence = 0;

beforeAll(async () => {
  const mongoUri = process.env.AUTH_TEST_DATABASE_URI;

  if (
    typeof mongoUri !== 'string'
    || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(mongoUri)
  ) {
    throw new Error('Test database is not an isolated local server');
  }

  global.__AUTH_TEST_DATABASE_URI__ = mongoUri;
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: true,
  });
});

afterEach(async () => {
  if (!mongoose.connection.db) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  delete global.__AUTH_TEST_DATABASE_URI__;
});

global.createTestUser = async (overrides = {}) => {
  const User = require('../models/User');
  userSequence += 1;
  return User.create({
    fullName: 'Test User',
    email: `test-${userSequence}@example.com`,
    password: 'Violet!9Mountain',
    phone: '03001234567',
    role: 'customer',
    isVerified: true,
    ...overrides,
  });
};
