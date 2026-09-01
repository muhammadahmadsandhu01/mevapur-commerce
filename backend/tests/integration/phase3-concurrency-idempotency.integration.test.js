const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const InventoryTransaction = require('../../models/InventoryTransaction');
const TokenService = require('../../services/TokenService');
const InventoryService = require('../../services/inventory/InventoryService');
const { createRuntimeConfig } = require('../../config/runtime.config');

const generateAuthHeader = async (user) => {
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

  return `Bearer ${token}`;
};

describe('Phase 3 — Concurrency, Idempotency & Durability Integration', () => {
  let adminUser;
  let adminAuth;
  let inventoryUser;
  let inventoryAuth;
  let simpleProduct;
  let variableProduct;
  let variant1Id;
  let variant2Id;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce-test';
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Product.deleteMany({});
    await InventoryTransaction.deleteMany({});

    adminUser = await User.create({
      fullName: 'Admin User',
      email: 'admin-concurrency@mevapur.test',
      password: 'Password123!',
      role: 'admin',
      isVerified: true
    });
    adminAuth = await generateAuthHeader(adminUser);

    inventoryUser = await User.create({
      fullName: 'Inventory Staff',
      email: 'inv-concurrency@mevapur.test',
      password: 'Password123!',
      role: 'inventory',
      isVerified: true
    });
    inventoryAuth = await generateAuthHeader(inventoryUser);

    simpleProduct = await Product.create({
      name: 'Concurrent Walnuts 500g',
      slug: 'concurrent-walnuts-500g',
      sku: 'CWAL-500G',
      price: 1500,
      stock: 50,
      lowStockThreshold: 10,
      variants: []
    });

    variant1Id = new mongoose.Types.ObjectId();
    variant2Id = new mongoose.Types.ObjectId();

    variableProduct = await Product.create({
      name: 'Concurrent Almonds',
      slug: 'concurrent-almonds',
      sku: 'CALM-ROOT',
      price: 2000,
      stock: 40,
      lowStockThreshold: 10,
      variants: [
        {
          _id: variant1Id,
          sku: 'CALM-250G',
          stock: 15,
          price: 1000,
          attributes: [{ name: 'Weight', value: '250g' }]
        },
        {
          _id: variant2Id,
          sku: 'CALM-500G',
          stock: 25,
          price: 1900,
          attributes: [{ name: 'Weight', value: '500g' }]
        }
      ]
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('1. Distinct Simultaneous Operations & Lost Update Prevention', () => {
    it('executes multiple distinct simultaneous adjustments without losing updates', async () => {
      // 5 concurrent adjustments of +5 each on stock of 50 -> Expected final stock: 75
      const adjustmentPromises = Array.from({ length: 5 }).map((_, index) => {
        return request(app)
          .post('/api/inventory/adjust')
          .set('Authorization', adminAuth)
          .send({
            productId: String(simpleProduct._id),
            type: 'in',
            quantity: 5,
            reason: `Batch restock ${index + 1}`,
            operationKey: crypto.randomUUID()
          });
      });

      const responses = await Promise.all(adjustmentPromises);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });

      const reloaded = await Product.findById(simpleProduct._id);
      expect(reloaded.stock).toBe(75);

      const txCount = await InventoryTransaction.countDocuments({ product: simpleProduct._id });
      expect(txCount).toBe(5);
    });
  });

  describe('2. Duplicate Simultaneous and Sequential Requests & Race Deduplication', () => {
    it('mutates stock exactly once when multiple identical requests race concurrently', async () => {
      const sharedOpKey = crypto.randomUUID();

      // 5 concurrent requests with the EXACT SAME operationKey (+10)
      const duplicatePromises = Array.from({ length: 5 }).map(() => {
        return request(app)
          .post('/api/inventory/adjust')
          .set('Authorization', adminAuth)
          .send({
            productId: String(simpleProduct._id),
            type: 'in',
            quantity: 10,
            reason: 'Simultaneous duplicate adjustment',
            operationKey: sharedOpKey
          });
      });

      const responses = await Promise.all(duplicatePromises);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
        // All responses must report final stock of 60 (50 + 10)
        expect(res.body.data.product.newStock).toBe(60);
      });

      // Database must only have mutated stock ONCE from 50 to 60 (not 100!)
      const reloaded = await Product.findById(simpleProduct._id);
      expect(reloaded.stock).toBe(60);

      // Exactly ONE transaction document exists for this operationKey
      const txCount = await InventoryTransaction.countDocuments({ operationKey: sharedOpKey });
      expect(txCount).toBe(1);
    });

    it('mutates stock exactly once on duplicate sequential submission and returns idempotent replay', async () => {
      const opKey = crypto.randomUUID();

      // First submission
      const res1 = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 8,
          reason: 'Initial sequential adjustment',
          operationKey: opKey
        });

      expect(res1.status).toBe(200);
      expect(res1.body.data.product.newStock).toBe(58);
      expect(res1.body.data.idempotentReplay).toBe(false);

      // Simulated timeout retry: reusing the same operationKey
      const res2 = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 8,
          reason: 'Initial sequential adjustment',
          operationKey: opKey
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.product.newStock).toBe(58);
      expect(res2.body.data.idempotentReplay).toBe(true);

      const reloaded = await Product.findById(simpleProduct._id);
      expect(reloaded.stock).toBe(58);

      const txCount = await InventoryTransaction.countDocuments({ operationKey: opKey });
      expect(txCount).toBe(1);
    });

    it('generates a new mutation when a new user adjustment uses a different operationKey', async () => {
      const key1 = crypto.randomUUID();
      const key2 = crypto.randomUUID();

      const res1 = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 5,
          reason: 'Adjustment one',
          operationKey: key1
        });
      expect(res1.body.data.product.newStock).toBe(55);

      const res2 = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 5,
          reason: 'Adjustment two',
          operationKey: key2
        });
      expect(res2.body.data.product.newStock).toBe(60);

      const reloaded = await Product.findById(simpleProduct._id);
      expect(reloaded.stock).toBe(60);
    });
  });

  describe('3. Target Adjustment & Setting Stock to Zero', () => {
    it('accepts setting target stock to 0 via adjustment type', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', inventoryAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'adjustment',
          quantity: 0,
          reason: 'Counted physical stock: 0 items remaining',
          operationKey: crypto.randomUUID()
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.previousStock).toBe(50);
      expect(res.body.data.product.newStock).toBe(0);

      const reloaded = await Product.findById(simpleProduct._id);
      expect(reloaded.stock).toBe(0);
    });

    it('rejects negative quantity for adjustment type (400)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', inventoryAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'adjustment',
          quantity: -5,
          reason: 'Invalid target stock',
          operationKey: crypto.randomUUID()
        });

      expect(res.status).toBe(400);
    });
  });

  describe('4. Mandatory operationKey Validation and UUID Format Rejection', () => {
    it('rejects request when operationKey is missing (400)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 5,
          reason: 'Missing key test'
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toContain('operationKey (UUID) is required');
    });

    it('rejects request when operationKey is an empty string (400)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 5,
          reason: 'Empty key test',
          operationKey: '   '
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toContain('operationKey (UUID) is required');
    });

    it('rejects non-UUID string formats in operationKey (400)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 5,
          reason: 'Test non-UUID',
          operationKey: 'invalid-key-not-a-uuid'
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toContain('valid operationKey (UUID)');
    });

    it('accepts valid UUID operationKey (200)', async () => {
      const validKey = crypto.randomUUID();
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(simpleProduct._id),
          type: 'in',
          quantity: 2,
          reason: 'Valid UUID test',
          operationKey: validKey
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.newStock).toBe(52);
    });
  });

  describe('5. Variant Ownership and Isolation Verification', () => {
    it('rejects variant ID that does not belong to the target product (404)', async () => {
      const unrelatedVariantId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', adminAuth)
        .send({
          productId: String(variableProduct._id),
          variantId: String(unrelatedVariantId),
          type: 'in',
          quantity: 5,
          reason: 'Mismatched variant test',
          operationKey: crypto.randomUUID()
        });

      expect(res.status).toBe(404);
      expect(res.body.error?.message || res.body.message).toContain('variant not found');
    });
  });

  describe('6. Canonical Runtime Environment Detection Table Tests', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('correctly evaluates deployed vs non-deployed environments across the full matrix', () => {
      const matrix = [
        { env: 'development', expectedDeployed: false },
        { env: 'test', expectedDeployed: false },
        { env: 'staging', expectedDeployed: true },
        { env: 'production', expectedDeployed: true }
      ];

      matrix.forEach(({ env, expectedDeployed }) => {
        const testEnv = {
          NODE_ENV: env,
          APP_ENV: env,
          PORT: '5000',
          MONGODB_URI: 'mongodb://localhost:27017/test',
          JWT_SECRET: 'test_jwt_secret_must_be_long_enough_1234567890',
          REFRESH_TOKEN_SECRET: 'test_refresh_secret_must_be_long_enough_1234567890',
          FRONTEND_URL: 'https://storefront.mevapur.test',
          ADMIN_URL: 'https://admin.mevapur.test',
          BACKEND_PUBLIC_URL: 'https://api.mevapur.test',
          AUTH_COOKIE_SAME_SITE: 'strict',
          AUTH_COOKIE_SECURE: 'true',
          TRUST_PROXY: '1',
          SESSION_COOKIE_SECRET: 'test_session_cookie_secret_12345678901234567890',
          EMAIL_MODE: expectedDeployed ? 'smtp' : 'mock',
          EMAIL_BRAND_NAME: 'Mevapur Commerce',
          SMTP_HOST: 'smtp.sendgrid.net',
          SMTP_PORT: '587',
          SMTP_SECURE: 'false',
          SMTP_USER: 'postmaster-live-smtp-acc-8742',
          SMTP_PASSWORD: 'kvn9834-live-credential-mvw982',
          SMTP_FROM: 'no-reply@mevapur.test',
          STORAGE_PROVIDER: 'mock',
          STORAGE_PUBLIC_BASE_URL: 'https://media.mevapur.test/media'
        };

        const config = createRuntimeConfig(testEnv);
        expect(config.isDeployed).toBe(expectedDeployed);
        expect(config.environment).toBe(env);
      });
    });

    it('fails closed in deployed environment when database transactions are unavailable', async () => {
      // Mock isDeployedEnvironment to return true
      const origFn = InventoryService.isDeployedEnvironment;
      InventoryService.isDeployedEnvironment = () => true;

      // Mock startSession to fail/throw
      const origStartSession = mongoose.startSession;
      mongoose.startSession = async () => {
        throw new Error('Standalone mongod does not support replica set transactions');
      };

      try {
        await expect(
          InventoryService.adjustStock({
            productId: String(simpleProduct._id),
            type: 'in',
            quantity: 5,
            reason: 'Deploy fail-closed test',
            operationKey: crypto.randomUUID(),
            actorId: adminUser._id
          })
        ).rejects.toMatchObject({
          statusCode: 503,
          code: 'SERVICE_UNAVAILABLE'
        });
      } finally {
        InventoryService.isDeployedEnvironment = origFn;
        mongoose.startSession = origStartSession;
      }
    });
  });
});
