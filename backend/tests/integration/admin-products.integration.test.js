const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const SkuRegistry = require('../../models/SkuRegistry');
const MediaAsset = require('../../models/MediaAsset');
const InventoryTransaction = require('../../models/InventoryTransaction');
const Category = require('../../models/Category');

let sequence = 0;

const getAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `product-auth-${sequence}@example.test`,
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

describe('Admin Product Workflows Integration Tests', () => {
  let adminToken;
  let superAdminToken;
  let customerToken;
  let testCategory;
  let testMediaAsset;

  beforeEach(async () => {
    adminToken = await getAuthToken('admin');
    superAdminToken = await getAuthToken('super_admin');
    customerToken = await getAuthToken('customer');

    testCategory = await Category.create({
      name: `Category ${Date.now()}-${Math.random()}`,
      slug: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    });

    const user = await global.createTestUser({
      email: `uploader-${Date.now()}@example.test`,
      role: 'admin'
    });

    testMediaAsset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: `products/test-${Date.now()}.webp`,
      publicUrl: `https://media.mock.mevapur.test/products/test-${Date.now()}.webp`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 200,
      height: 200,
      checksumSha256: crypto.randomBytes(32).toString('hex'),
      status: 'pending',
      uploader: user._id
    });
  });

  it('enforces RBAC on admin product routes', async () => {
    // 401 unauthenticated
    const unauth = await request(app).get('/api/admin/products');
    expect(unauth.status).toBe(401);

    // 403 customer
    const forbidden = await request(app)
      .get('/api/admin/products')
      .set('Authorization', customerToken);
    expect(forbidden.status).toBe(403);

    // 200 admin
    const allowed = await request(app)
      .get('/api/admin/products')
      .set('Authorization', adminToken);
    expect(allowed.status).toBe(200);
  });

  it('creates a minimal draft product and verifies derived lifecycle', async () => {
    const response = await request(app)
      .post('/api/admin/products/draft')
      .set('Authorization', adminToken)
      .send({
        name: 'Organic Walnuts Draft'
      });

    expect(response.status).toBe(201);
    expect(response.body.data.product).toMatchObject({
      name: 'Organic Walnuts Draft',
      status: 'draft',
      isActive: false,
      stock: 0
    });

    // Zero-quantity inventory rule: initialStock = 0 creates NO transaction
    const txCount = await InventoryTransaction.countDocuments({ product: response.body.data.product._id });
    expect(txCount).toBe(0);
  });

  it('rejects client-supplied isActive on creation with 400', async () => {
    const response = await request(app)
      .post('/api/admin/products/draft')
      .set('Authorization', adminToken)
      .send({
        name: 'Malicious Active Draft',
        isActive: true
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.error)).toContain('isActive is a derived system field');
  });

  it('creates a published simple product with initial positive stock and logs an initial InventoryTransaction', async () => {
    const response = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminToken)
      .send({
        name: 'Published Pistachios',
        description: 'Fresh salted pistachios in premium pack.',
        category: testCategory._id.toString(),
        sku: 'PIST-500G',
        price: 2200,
        originalPrice: 2500,
        initialStock: 50,
        mediaAssetIds: [testMediaAsset._id.toString()]
      });

    expect(response.status).toBe(201);
    const product = response.body.data.product;
    expect(product.status).toBe('published');
    expect(product.isActive).toBe(true);
    expect(product.stock).toBe(50);
    expect(product.discount).toBe(12);

    // Initial stock transaction created
    const tx = await InventoryTransaction.findOne({ product: product._id });
    expect(tx).not.toBeNull();
    expect(tx.type).toBe('in');
    expect(tx.quantity).toBe(50);
    expect(tx.previousStock).toBe(0);
    expect(tx.newStock).toBe(50);

    // SkuRegistry registered
    const skuEntry = await SkuRegistry.findOne({ sku: 'PIST-500G' });
    expect(skuEntry).not.toBeNull();
    expect(skuEntry.product.toString()).toBe(product._id);
  });

  it('handles optimistic concurrency conflict on update (409)', async () => {
    // Create product
    const created = await request(app)
      .post('/api/admin/products/draft')
      .set('Authorization', adminToken)
      .send({ name: 'Concurrency Test Item' });

    const product = created.body.data.product;
    const initialVersion = product.__v || 0;

    // First update with valid version
    const update1 = await request(app)
      .put(`/api/admin/products/${product._id}`)
      .set('Authorization', adminToken)
      .send({
        name: 'First Edit',
        expectedVersion: initialVersion
      });
    expect(update1.status).toBe(200);

    // Second update with stale initialVersion returns 409
    const update2 = await request(app)
      .put(`/api/admin/products/${product._id}`)
      .set('Authorization', adminToken)
      .send({
        name: 'Conflicting Edit',
        expectedVersion: initialVersion // Stale version!
      });
    expect(update2.status).toBe(409);
    expect(update2.body.error.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('blocks publication of incomplete draft until mandatory fields are supplied', async () => {
    const draft = await request(app)
      .post('/api/admin/products/draft')
      .set('Authorization', adminToken)
      .send({ name: 'Incomplete Draft' });

    const productId = draft.body.data.product._id;

    // Attempt to publish incomplete draft
    const failPublish = await request(app)
      .post(`/api/admin/products/${productId}/publish`)
      .set('Authorization', adminToken)
      .send({});
    expect(failPublish.status).toBe(400);

    // Supply required fields and publish
    const successPublish = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', adminToken)
      .send({
        description: 'Complete description of item.',
        category: testCategory._id.toString(),
        price: 999,
        mediaAssetIds: [testMediaAsset._id.toString()],
        status: 'published'
      });

    expect(successPublish.status).toBe(200);
    expect(successPublish.body.data.product.status).toBe('published');
    expect(successPublish.body.data.product.isActive).toBe(true);
  });

  it('enforces two-stage hard deletion policy (Archive first, superAdmin only)', async () => {
    const published = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminToken)
      .send({
        name: 'Delete Target Item',
        description: 'Description here',
        category: testCategory._id.toString(),
        price: 500,
        initialStock: 0,
        mediaAssetIds: [testMediaAsset._id.toString()]
      });

    const productId = published.body.data.product._id;

    // 1. Attempting to delete active/published product is blocked
    const directDelete = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', superAdminToken);
    expect(directDelete.status).toBe(400);
    expect(directDelete.body.error.code).toBe('PRODUCT_MUST_BE_ARCHIVED_BEFORE_DELETE');

    // 2. Archive product first
    const archive = await request(app)
      .post(`/api/admin/products/${productId}/archive`)
      .set('Authorization', adminToken)
      .send({});
    expect(archive.status).toBe(200);
    expect(archive.body.data.product.status).toBe('archived');

    // 3. Regular admin cannot hard delete (restricted to superAdmin)
    const adminDelete = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', adminToken);
    expect(adminDelete.status).toBe(403);

    // 4. superAdmin can delete product with 0 inventory/order history
    const superDelete = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', superAdminToken);
    expect(superDelete.status).toBe(200);

    const check = await Product.findById(productId);
    expect(check).toBeNull();
  });
});
