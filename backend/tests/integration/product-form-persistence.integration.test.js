const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const MediaAsset = require('../../models/MediaAsset');
const SkuRegistry = require('../../models/SkuRegistry');
const InventoryTransaction = require('../../models/InventoryTransaction');

let sequence = 0;

const getAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `product-persist-${sequence}-${Date.now()}@example.test`,
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

describe('Product Form Persistence & Public Allowlist Protection Integration Tests', () => {
  let adminToken;
  let customerToken;
  let testCategory;
  let testMediaAsset;

  beforeEach(async () => {
    adminToken = await getAuthToken('admin');
    customerToken = await getAuthToken('customer');

    testCategory = await Category.create({
      name: `Persist Cat ${Date.now()}-${Math.random()}`,
      slug: `persist-cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    });

    const user = await global.createTestUser({
      email: `uploader-persist-${Date.now()}@example.test`,
      role: 'admin'
    });

    testMediaAsset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: `products/persist-${Date.now()}.webp`,
      publicUrl: `https://media.mock.mevapur.test/products/persist-${Date.now()}.webp`,
      mimeType: 'image/webp',
      sizeBytes: 2048,
      width: 400,
      height: 400,
      checksumSha256: crypto.randomBytes(32).toString('hex'),
      status: 'pending',
      uploader: user._id
    });
  });

  describe('1. Full Round-Trip Field Persistence', () => {
    it('creates draft product with all 24+ UI fields and hydrates correctly on getAdminProduct', async () => {
      const explicitSku = `EXP-SKU-${Date.now()}`;
      const payload = {
        name: 'Organic Raw Almonds',
        slug: `organic-raw-almonds-${Date.now()}`,
        shortDescription: 'Fresh California almonds.',
        description: 'Premium batch harvested raw organic almonds.',
        category: testCategory._id.toString(),
        sku: explicitSku,
        barcode: '1234567890123',
        costPrice: 850,
        price: 1200,
        originalPrice: 1400,
        initialStock: 45,
        lowStockThreshold: 8,
        isFeatured: true,
        isNewArrival: true,
        isBestSeller: true,
        isTrending: true,
        allowBackorders: true,
        trackInventory: true,
        tags: ['organic', 'nuts', 'raw'],
        ingredients: '100% Organic Almonds',
        nutritionalFacts: 'Protein: 21g, Fat: 50g, Carbs: 22g',
        storageInstructions: 'Store in a cool dry place',
        shelfLife: '12 months',
        countryOfOrigin: 'USA',
        weight: 500,
        dimensions: { length: 15, width: 10, height: 5, unit: 'cm' },
        shippingClass: 'express',
        freeShipping: true,
        taxClass: 'reduced',
        publishDate: '2026-10-01T00:00:00.000Z',
        enableReviews: true,
        allowWishlist: true,
        allowCompare: true,
        allowCOD: true,
        videoUrl: 'https://youtube.com/watch?v=sample',
        seo: {
          metaTitle: 'Buy Organic Raw Almonds Online',
          metaDescription: 'Shop premium organic raw almonds.',
          keywords: 'almonds, organic, raw, nuts',
          canonicalUrl: 'https://mevapur.com/products/organic-raw-almonds'
        }
      };

      const createRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send(payload);

      expect(createRes.status).toBe(201);
      const created = createRes.body.data.product;
      expect(created.sku).toBe(explicitSku);
      expect(created.costPrice).toBe(850);
      expect(created.ingredients).toBe('100% Organic Almonds');
      expect(created.storageInstructions).toBe('Store in a cool dry place');
      expect(created.shelfLife).toBe('12 months');
      expect(created.countryOfOrigin).toBe('USA');
      expect(created.isNewArrival).toBe(true);
      expect(created.isBestSeller).toBe(true);
      expect(created.isTrending).toBe(true);
      expect(created.allowBackorders).toBe(true);
      expect(created.trackInventory).toBe(true);
      expect(created.tags).toEqual(['organic', 'nuts', 'raw']);
      expect(created.barcode).toBe('1234567890123');
      expect(created.weight).toBe(500);
      expect(created.dimensions).toEqual({ length: 15, width: 10, height: 5, unit: 'cm' });
      expect(created.shippingClass).toBe('express');
      expect(created.freeShipping).toBe(true);
      expect(created.taxClass).toBe('reduced');
      expect(created.enableReviews).toBe(true);
      expect(created.allowWishlist).toBe(true);
      expect(created.allowCompare).toBe(true);
      expect(created.allowCOD).toBe(true);
      expect(created.seo.canonicalUrl).toBe('https://mevapur.com/products/organic-raw-almonds');

      // Hydrate via GET /api/admin/products/:id
      const getRes = await request(app)
        .get(`/api/admin/products/${created._id}`)
        .set('Authorization', adminToken);

      expect(getRes.status).toBe(200);
      const hydrated = getRes.body.data.product;
      expect(hydrated.costPrice).toBe(850);
      expect(hydrated.ingredients).toBe('100% Organic Almonds');
      expect(hydrated.storageInstructions).toBe('Store in a cool dry place');
      expect(hydrated.shelfLife).toBe('12 months');
      expect(hydrated.sku).toBe(explicitSku);
      expect(hydrated.isNewArrival).toBe(true);
      expect(hydrated.allowBackorders).toBe(true);
    });
  });

  describe('2. Public Allowlist Protection', () => {
    let publishedId;
    let publishedSlug;

    beforeEach(async () => {
      publishedSlug = `pub-protect-almonds-${Date.now()}`;
      const createRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', adminToken)
        .send({
          name: 'Public Protection Almonds',
          slug: publishedSlug,
          description: 'Delicious organic almonds for public catalog.',
          category: testCategory._id.toString(),
          sku: `PUB-ALM-${Date.now()}`,
          barcode: '999999999999',
          costPrice: 650,
          price: 1100,
          originalPrice: 1300,
          initialStock: 50,
          lowStockThreshold: 5,
          isFeatured: true,
          isNewArrival: true,
          allowBackorders: true,
          trackInventory: true,
          ingredients: 'Pure Almonds',
          mediaAssetIds: [testMediaAsset._id.toString()]
        });

      expect(createRes.status).toBe(201);
      publishedId = createRes.body.data.product._id;
    });

    const assertExcludedFields = (product) => {
      expect(product.costPrice).toBeUndefined();
      expect(product.lowStockThreshold).toBeUndefined();
      expect(product.trackInventory).toBeUndefined();
      expect(product.barcode).toBeUndefined();
      expect(product.__v).toBeUndefined();
      // allowBackorders is deliberately exposed as boolean
      expect(product.allowBackorders).toBe(true);
    };

    it('GET /api/products excludes internal fields', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(200);
      const found = res.body.data.find(p => String(p._id) === String(publishedId));
      expect(found).toBeDefined();
      assertExcludedFields(found);
    });

    it('GET /api/products/:id excludes internal fields', async () => {
      const res = await request(app).get(`/api/products/${publishedId}`);
      expect(res.status).toBe(200);
      assertExcludedFields(res.body.data);
    });

    it('GET /api/products/top excludes internal fields', async () => {
      const res = await request(app).get('/api/products/top');
      expect(res.status).toBe(200);
      res.body.data.forEach(assertExcludedFields);
    });

    it('GET /api/products/recommended excludes internal fields', async () => {
      const res = await request(app).get('/api/products/recommended');
      expect(res.status).toBe(200);
      res.body.data.forEach(assertExcludedFields);
    });

    it('GET /api/products/recently-viewed excludes internal fields', async () => {
      const res = await request(app).get(`/api/products/recently-viewed?ids=${publishedId}`);
      expect(res.status).toBe(200);
      res.body.data.forEach(assertExcludedFields);
    });

    it('rejects unauthorized access to admin product detail with costPrice', async () => {
      const unauth = await request(app).get(`/api/admin/products/${publishedId}`);
      expect(unauth.status).toBe(401);

      const customer = await request(app)
        .get(`/api/admin/products/${publishedId}`)
        .set('Authorization', customerToken);
      expect(customer.status).toBe(403);
    });
  });

  describe('3. Backend Publish Rules Enforcement', () => {
    it('rejects publishing without name, description, category, price, or media assets', async () => {
      // Missing description, category, price, media
      const res1 = await request(app)
        .post('/api/admin/products')
        .set('Authorization', adminToken)
        .send({ name: 'Incomplete Item' });
      expect(res1.status).toBe(400);

      // Missing media assets
      const res2 = await request(app)
        .post('/api/admin/products')
        .set('Authorization', adminToken)
        .send({
          name: 'No Media Item',
          description: 'A valid description.',
          category: testCategory._id.toString(),
          price: 500,
          mediaAssetIds: []
        });
      expect(res2.status).toBe(400);

      // Zero price on simple product
      const res3 = await request(app)
        .post('/api/admin/products')
        .set('Authorization', adminToken)
        .send({
          name: 'Zero Price Item',
          description: 'A valid description.',
          category: testCategory._id.toString(),
          price: 0,
          mediaAssetIds: [testMediaAsset._id.toString()]
        });
      expect(res3.status).toBe(400);
    });

    it('rejects /publish endpoint if draft lacks required fields', async () => {
      const draftRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({ name: 'Incomplete Draft' });
      expect(draftRes.status).toBe(201);
      const draftId = draftRes.body.data.product._id;

      const pubRes = await request(app)
        .post(`/api/admin/products/${draftId}/publish`)
        .set('Authorization', adminToken)
        .send({});
      expect(pubRes.status).toBe(400);
      expect(pubRes.body.error.code).toBe('PRODUCT_PUBLICATION_VALIDATION_FAILED');
    });
  });

  describe('4. Partial-Update Safety', () => {
    it('preserves omitted fields and allows explicit clearing of optional fields', async () => {
      const createRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({
          name: 'Partial Update Walnut',
          shortDescription: 'Initial Short',
          description: 'Initial Long Description',
          category: testCategory._id.toString(),
          costPrice: 900,
          price: 1500,
          ingredients: 'Walnuts',
          shelfLife: '6 months',
          isFeatured: true,
          freeShipping: true,
          tags: ['initial', 'walnut']
        });
      expect(createRes.status).toBe(201);
      const productId = createRes.body.data.product._id;

      // 1. Partial update: change only price and costPrice; omitted fields MUST remain unchanged
      const update1 = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send({
          costPrice: 950,
          price: 1600
        });
      expect(update1.status).toBe(200);
      const doc1 = update1.body.data.product;
      expect(doc1.costPrice).toBe(950);
      expect(doc1.price).toBe(1600);
      expect(doc1.name).toBe('Partial Update Walnut');
      expect(doc1.shortDescription).toBe('Initial Short');
      expect(doc1.description).toBe('Initial Long Description');
      expect(doc1.ingredients).toBe('Walnuts');
      expect(doc1.shelfLife).toBe('6 months');
      expect(doc1.isFeatured).toBe(true);
      expect(doc1.freeShipping).toBe(true);
      expect(doc1.tags).toEqual(['initial', 'walnut']);

      // 2. Explicit clearing: clear shelfLife and set isFeatured to false
      const update2 = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send({
          shelfLife: '',
          isFeatured: false,
          tags: []
        });
      expect(update2.status).toBe(200);
      const doc2 = update2.body.data.product;
      expect(doc2.shelfLife).toBe('');
      expect(doc2.isFeatured).toBe(false);
      expect(doc2.tags).toEqual([]);
      // Unrelated fields still intact (including costPrice)
      expect(doc2.costPrice).toBe(950);
      expect(doc2.ingredients).toBe('Walnuts');
      expect(doc2.freeShipping).toBe(true);
    });
  });

  describe('5. SKU Preservation and Collision Safety', () => {
    it('preserves explicit SKU and auto-generates only when omitted', async () => {
      // 1. Explicit SKU
      const customSku = `CUSTOM-SKU-${Date.now()}`;
      const res1 = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({ name: 'Explicit SKU Product', sku: customSku });
      expect(res1.status).toBe(201);
      expect(res1.body.data.product.sku).toBe(customSku);

      // Verify in SkuRegistry
      const reg1 = await SkuRegistry.findOne({ sku: customSku });
      expect(reg1).toBeDefined();
      expect(String(reg1.product)).toBe(String(res1.body.data.product._id));

      // 2. Auto-generated SKU
      const res2 = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({ name: 'Auto Generated Item' });
      expect(res2.status).toBe(201);
      expect(res2.body.data.product.sku).toMatch(/^AUTOGENE-\d{4}$/);

      // 3. Duplicate SKU collision returns 409 and does not corrupt registry
      const res3 = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({ name: 'Duplicate SKU Attempt', sku: customSku });
      expect(res3.status).toBe(409);
      expect(res3.body.error.code).toBe('SKU_ALREADY_EXISTS');
    });
  });

  describe('6. Inventory Architecture Integrity', () => {
    it('creates initial inventory transaction on product creation and preserves stock on updates', async () => {
      const createRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({
          name: 'Inventory Test Product',
          price: 500,
          initialStock: 100,
          trackInventory: true,
          allowBackorders: false
        });
      expect(createRes.status).toBe(201);
      const product = createRes.body.data.product;
      expect(product.stock).toBe(100);

      // Verify InventoryTransaction created
      const tx = await InventoryTransaction.findOne({ product: product._id, type: 'in' });
      expect(tx).toBeDefined();
      expect(tx.quantity).toBe(100);
      expect(tx.newStock).toBe(100);

      // Update product metadata (price, costPrice, allowBackorders)
      const updateRes = await request(app)
        .put(`/api/admin/products/${product._id}`)
        .set('Authorization', adminToken)
        .send({
          price: 550,
          costPrice: 350,
          allowBackorders: true
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.product.stock).toBe(100); // stock unchanged
      expect(updateRes.body.data.product.allowBackorders).toBe(true);

      // Verify no extra destructive transactions created
      const txCount = await InventoryTransaction.countDocuments({ product: product._id });
      expect(txCount).toBe(1);
    });
  });

  describe('7. Hotfix Regressions: Payload Normalization & Strict Update Validation', () => {
    it('accepts blank publishDate ("" or null) on draft update without validation error', async () => {
      const createRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({
          name: 'Draft Blank Publish Date',
          price: 200,
          publishDate: ''
        });
      expect(createRes.status).toBe(201);
      const productId = createRes.body.data.product._id;

      // Update with empty string publishDate
      const updateRes1 = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send({
          name: 'Draft Blank Publish Date Updated',
          publishDate: ''
        });
      expect(updateRes1.status).toBe(200);

      // Update with null publishDate
      const updateRes2 = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send({
          publishDate: null
        });
      expect(updateRes2.status).toBe(200);
    });

    it('accepts valid ISO publishDate on update', async () => {
      const createRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({ name: 'Scheduled Date Test', price: 300 });
      expect(createRes.status).toBe(201);
      const productId = createRes.body.data.product._id;

      const futureDate = '2026-12-01T10:00:00.000Z';
      const updateRes = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send({
          publishDate: futureDate
        });
      expect(updateRes.status).toBe(200);
      expect(new Date(updateRes.body.data.product.publishDate).toISOString()).toBe(futureDate);
    });

    it('strictly rejects initialStock and direct stock on update with HTTP 400', async () => {
      const createRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({
          name: 'Stock Update Rejection Test',
          price: 400,
          initialStock: 25
        });
      expect(createRes.status).toBe(201);
      const productId = createRes.body.data.product._id;

      // Attempting to send initialStock on PUT
      const updateRes1 = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send({
          name: 'Attempt Initial Stock Overwrite',
          initialStock: 50
        });
      expect(updateRes1.status).toBe(400);
      expect(updateRes1.body.error.code).toBe('VALIDATION_ERROR');

      // Attempting to send direct stock on PUT
      const updateRes2 = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send({
          stock: 99
        });
      expect(updateRes2.status).toBe(400);
      expect(updateRes2.body.error.code).toBe('VALIDATION_ERROR');

      // Verify stock and inventory transactions remain untouched
      const freshProduct = await Product.findById(productId);
      expect(freshProduct.stock).toBe(25);
      const txCount = await InventoryTransaction.countDocuments({ product: productId });
      expect(txCount).toBe(1);
    });

    it('accepts complete realistically hydrated edit form payload on update', async () => {
      const createRes = await request(app)
        .post('/api/admin/products/draft')
        .set('Authorization', adminToken)
        .send({
          name: 'Hydrated Edit Base',
          price: 700,
          initialStock: 30
        });
      expect(createRes.status).toBe(201);
      const productId = createRes.body.data.product._id;

      // Realistic full payload serialized by prepareProductPayload in 'update' mode
      const fullUpdatePayload = {
        name: 'Hydrated Edit Updated',
        status: 'draft',
        slug: `hydrated-edit-updated-${Date.now()}`,
        shortDescription: 'Short desc',
        description: 'Detailed description',
        category: testCategory._id.toString(),
        subcategory: null,
        brand: null,
        sku: `HYDR-${Date.now()}`,
        barcode: '123456789012',
        costPrice: 500,
        price: 750,
        originalPrice: 900,
        lowStockThreshold: 5,
        isFeatured: true,
        isNewArrival: false,
        isBestSeller: true,
        isTrending: false,
        allowBackorders: true,
        trackInventory: true,
        tags: ['walnuts', 'dryfruit'],
        ingredients: '100% Organic',
        nutritionalFacts: 'Calories: 200',
        storageInstructions: 'Dry place',
        shelfLife: '6 months',
        countryOfOrigin: 'Pakistan',
        weight: 250,
        dimensions: { length: 10, width: 5, height: 2, unit: 'cm' },
        shippingClass: 'standard',
        freeShipping: false,
        taxClass: 'standard',
        publishDate: null,
        enableReviews: true,
        allowWishlist: true,
        allowCompare: true,
        allowCOD: true,
        relatedProducts: [],
        mediaAssetIds: [testMediaAsset._id.toString()],
        videoUrl: '',
        seo: {
          metaTitle: 'SEO Title',
          metaDescription: 'SEO Desc',
          keywords: 'keywords',
          canonicalUrl: ''
        }
      };

      const updateRes = await request(app)
        .put(`/api/admin/products/${productId}`)
        .set('Authorization', adminToken)
        .send(fullUpdatePayload);

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.product.name).toBe('Hydrated Edit Updated');
      expect(updateRes.body.data.product.costPrice).toBe(500);
      expect(updateRes.body.data.product.stock).toBe(30);
    });
  });
});
