const os = require('os');
const path = require('path');

module.exports = async () => {
  if (process.env.MONGODB_URI) {
    throw new Error(
      'Refusing to start authentication tests with an inherited database URI'
    );
  }

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET =
    'test-only-auth-secret-that-is-never-used-outside-tests';
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
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(
    os.tmpdir(),
    'mevapur-auth-mongodb-binaries'
  );

  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  const mongoServer = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger'
    }
  });
  const mongoUri = mongoServer.getUri('mevapur_isolated_test');

  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(mongoUri)) {
    await mongoServer.stop();
    throw new Error('Authentication test database is not isolated and local');
  }

  global.__AUTH_MONGO_SERVER__ = mongoServer;
  process.env.AUTH_TEST_DATABASE_URI = mongoUri;
};
