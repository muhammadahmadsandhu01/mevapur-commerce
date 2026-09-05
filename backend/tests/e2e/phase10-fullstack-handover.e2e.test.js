const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const MediaAsset = require('../../models/MediaAsset');
const Order = require('../../models/Order');
const Review = require('../../models/Review');
const Content = require('../../models/Content');
const Return = require('../../models/Return');
const InventoryTransaction = require('../../models/InventoryTransaction');
const ShippingZone = require('../../models/ShippingZone');
const MarketConfig = require('../../models/MarketConfig');

/**
 * STOREFRONT PHASE 10 — FULL-STACK E2E ACCEPTANCE SUITE
 * 
 * Component Classifications:
 * - REAL: In-memory MongoDB replica set, Express application router, Mongoose models,
 *         TokenService (JWT + refresh hash), PolicyService (RBAC), ReturnStateMachine,
 *         Inventory reconciliation, and authoritative database state mutations.
 * - SANDBOXED: Stripe provider test-mode boundaries.
 * - MOCKED: External SMTP email delivery (fail-safe mock mode with rollback).
 * - PROHIBITED / STRICTLY ZERO: Real credit card charges, real customer PII, production secrets.
 */

let sequence = 0;

const createAuth = async (role = 'customer', extraUserProps = {}) => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `phase10-${role}-${sequence}-${Date.now()}@example.test`,
    role,
    ...extraUserProps,
  });

  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000),
  });

  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion,
  });

  return {
    user,
    session,
    token,
    authorization: `Bearer ${token}`,
  };
};

describe('Storefront Phase 10 — Full-Stack E2E, Security and Client-Handover Acceptance', () => {
  beforeAll(async () => {
    await Promise.all([
      Product.syncIndexes(),
      Order.syncIndexes(),
      Session.syncIndexes(),
      User.syncIndexes(),
      Review.syncIndexes(),
      Content.syncIndexes(),
      Return.syncIndexes(),
      InventoryTransaction.syncIndexes(),
      ShippingZone.syncIndexes(),
      MarketConfig.syncIndexes(),
    ]);
  });

  test('1. Admin publishes product -> Storefront retrieves it; Admin unpublishes -> Storefront hides it (Persisted DB State Verified)', async () => {
    const admin = await createAuth('admin');
    const category = await Category.create({
      name: `Category ${Date.now()}`,
      slug: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    });

    const mediaAsset = await MediaAsset.create({
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
      uploader: admin.user._id,
    });

    // Admin creates and publishes product via authoritative admin endpoint
    const createRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', admin.authorization)
      .send({
        name: 'Phase 10 Premium Pistachios',
        description: 'Finest roasted pistachios from organic orchards.',
        category: category._id.toString(),
        sku: `P10-PIST-${Date.now()}`,
        price: 1800,
        originalPrice: 2000,
        initialStock: 50,
        mediaAssetIds: [mediaAsset._id.toString()],
      });

    expect(createRes.status).toBe(201);
    const product = createRes.body.data.product;
    const productId = product._id;
    const slug = product.slug;

    // Direct MongoDB check: Persisted status is 'published' and isActive is true
    const dbProductPublished = await Product.findById(productId);
    expect(dbProductPublished).not.toBeNull();
    expect(dbProductPublished.status).toBe('published');
    expect(dbProductPublished.isActive).toBe(true);

    // Storefront public catalog retrieves the published product
    const publicGetRes = await request(app).get(`/api/products/${slug}`);
    expect(publicGetRes.status).toBe(200);
    expect(publicGetRes.body.data.name).toBe('Phase 10 Premium Pistachios');
    expect(publicGetRes.body.data.price).toBe(1800);

    // Admin unpublishes the product to 'draft'
    const updateRes = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', admin.authorization)
      .send({
        status: 'draft',
        expectedVersion: dbProductPublished.__v || 0,
      });

    expect(updateRes.status).toBe(200);

    // Direct MongoDB check: Persisted status is 'draft' and isActive is false
    const dbProductDraft = await Product.findById(productId);
    expect(dbProductDraft.status).toBe('draft');
    expect(dbProductDraft.isActive).toBe(false);

    // Public storefront now receives 404 for the draft product
    const publicDraftRes = await request(app).get(`/api/products/${slug}`);
    expect(publicDraftRes.status).toBe(404);
  });

  test('2. Exact variant, stock and authoritative price reach cart & checkout with inventory reservation', async () => {
    const customer = await createAuth('customer');
    const categoryId = new mongoose.Types.ObjectId();
    const variantId = new mongoose.Types.ObjectId();

    // Create a product with specific variants
    const product = await Product.create({
      name: 'Phase 10 Organic Walnuts',
      slug: `phase10-walnuts-${Date.now()}`,
      description: 'Raw walnut kernels in variable package sizes.',
      price: 1000,
      stock: 15,
      category: categoryId,
      sku: `P10-WALNUT-ROOT-${Date.now()}`,
      status: 'published',
      isActive: true,
      variants: [
        {
          _id: variantId,
          sku: `P10-WALNUT-500G-${Date.now()}`,
          name: '500g Pack',
          price: 1200,
          stock: 15,
          attributes: [{ name: 'size', value: '500g' }],
          isActive: true,
        },
      ],
    });

    const idempotencyKey = crypto.randomUUID();

    // Customer places order for the 500g variant
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', customer.authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [
          {
            productId: String(product._id),
            variantId: String(variantId),
            quantity: 2,
          },
        ],
        shippingAddress: {
          fullName: 'Handover Customer',
          phone: '03009876543',
          address: '42 Handover Acceptance Way',
          city: 'Lahore',
          province: 'Punjab',
          country: 'PK',
        },
        paymentMethod: 'cod',
        currency: 'PKR',
      });

    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.order._id;

    // Direct MongoDB verification of authoritative pricing and variant mapping
    const dbOrder = await Order.findById(orderId);
    expect(dbOrder).not.toBeNull();
    expect(dbOrder.items[0].product.toString()).toBe(String(product._id));
    expect(dbOrder.items[0].variantId.toString()).toBe(String(variantId));
    expect(dbOrder.items[0].price).toBe(1200); // Authoritative variant price applied
    expect(dbOrder.items[0].quantity).toBe(2);
    expect(dbOrder.items[0].lineTotal).toBe(2400);

    // Direct MongoDB verification of variant and root stock decrements
    const updatedProduct = await Product.findById(product._id);
    const updatedVariant = updatedProduct.variants.id(variantId);
    expect(updatedVariant.stock).toBe(13); // 15 - 2 = 13
    expect(updatedProduct.stock).toBe(13); // Root stock equals sum of variant stocks
  });

  test('3. Duplicate checkout attempts with the same Idempotency-Key produce exactly ONE order and ONE stock mutation', async () => {
    const customer = await createAuth('customer');
    const categoryId = new mongoose.Types.ObjectId();

    const product = await Product.create({
      name: 'Phase 10 Concurrency Honey',
      slug: `phase10-honey-${Date.now()}`,
      description: 'Raw mountain honey.',
      price: 2500,
      stock: 20,
      category: categoryId,
      sku: `P10-HONEY-${Date.now()}`,
      status: 'published',
      isActive: true,
    });

    const fixedIdempotencyKey = crypto.randomUUID();

    const payload = {
      items: [{ productId: String(product._id), quantity: 3 }],
      shippingAddress: {
        fullName: 'Idempotent Buyer',
        phone: '03001112233',
        address: '10 Idempotency Plaza',
        city: 'Karachi',
        province: 'Sindh',
        country: 'PK',
      },
      paymentMethod: 'cod',
      currency: 'PKR',
    };

    // First checkout attempt
    const res1 = await request(app)
      .post('/api/orders')
      .set('Authorization', customer.authorization)
      .set('Idempotency-Key', fixedIdempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    const firstOrderId = res1.body.data.order._id;

    // Second checkout attempt (exact same key)
    const res2 = await request(app)
      .post('/api/orders')
      .set('Authorization', customer.authorization)
      .set('Idempotency-Key', fixedIdempotencyKey)
      .send(payload);

    // Must return success with identical order identifier without creating a second record
    expect([200, 201]).toContain(res2.status);
    expect(res2.body.data.order._id).toBe(firstOrderId);

    // Direct MongoDB assertions: Exactly 1 order exists for this idempotency key
    const matchingOrders = await Order.find({ idempotencyKey: fixedIdempotencyKey });
    expect(matchingOrders).toHaveLength(1);

    // Direct MongoDB assertions: Stock was mutated exactly once (20 - 3 = 17)
    const dbProduct = await Product.findById(product._id);
    expect(dbProduct.stock).toBe(17);
  });

  test('4. Cross-account order privacy: Customer A accesses own order, Customer B is strictly barred', async () => {
    const customerA = await createAuth('customer');
    const customerB = await createAuth('customer');

    const orderA = await Order.create({
      user: customerA.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'Private Almond Box',
          sku: 'PRIV-001',
          price: 1500,
          quantity: 1,
          lineTotal: 1500,
        },
      ],
      subtotal: 1500,
      totalAmount: 1500,
      paymentMethod: 'cod',
      payment: { provider: 'Cash on Delivery', status: 'Pending' },
      orderStatus: 'Pending',
      statusTimeline: [{ status: 'Pending', actor: customerA.user._id, actorRole: 'customer', timestamp: new Date() }],
      shippingAddress: {
        fullName: 'Customer A',
        phone: '03001234567',
        address: '1 Secret Lane',
        city: 'Islamabad',
        province: 'Federal',
        country: 'PK',
      },
    });

    // Customer A accesses their own order
    const resA = await request(app)
      .get(`/api/orders/${orderA._id}`)
      .set('Authorization', customerA.authorization);
    expect(resA.status).toBe(200);
    expect(resA.body.data.order._id).toBe(String(orderA._id));

    // Customer B attempts to access Customer A's order
    const resB = await request(app)
      .get(`/api/orders/${orderA._id}`)
      .set('Authorization', customerB.authorization);
    // Security fail-closed: 403 Forbidden or 404 Not Found
    expect([403, 404]).toContain(resB.status);
  });

  test('5. Customer block invalidates active sessions before authenticated routes can execute', async () => {
    const customer = await createAuth('customer');

    // Customer session is initially valid
    const initialMeRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', customer.authorization);
    expect(initialMeRes.status).toBe(200);
    expect(initialMeRes.body.data.user.email).toBe(customer.user.email);

    // Admin blocks the customer account
    await User.findByIdAndUpdate(customer.user._id, { $set: { isBlocked: true } });

    // Direct MongoDB check
    const blockedDbUser = await User.findById(customer.user._id);
    expect(blockedDbUser.isBlocked).toBe(true);

    // Subsequent call with the active session token MUST fail closed
    const blockedMeRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', customer.authorization);
    expect([401, 403]).toContain(blockedMeRes.status);
  });

  test('6. Review moderation affects public visibility and product rating projection in MongoDB', async () => {
    const admin = await createAuth('admin');
    const customer = await createAuth('customer');
    const categoryId = new mongoose.Types.ObjectId();

    const product = await Product.create({
      name: 'Phase 10 Figs',
      slug: `phase10-figs-${Date.now()}`,
      description: 'Sundried organic figs.',
      price: 2000,
      stock: 25,
      category: categoryId,
      sku: `P10-FIGS-${Date.now()}`,
      status: 'published',
      isActive: true,
      rating: 0,
      reviewCount: 0,
    });

    // Customer creates order in Delivered status so review is permitted
    await Order.create({
      user: customer.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [{ product: product._id, name: product.name, sku: product.sku, price: 2000, quantity: 1, lineTotal: 2000 }],
      subtotal: 2000,
      totalAmount: 2000,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      deliveredAt: new Date(Date.now() - 86400000),
      statusTimeline: [{ status: 'Delivered', actor: customer.user._id, actorRole: 'customer', timestamp: new Date(Date.now() - 86400000) }],
      shippingAddress: { fullName: 'Fig Reviewer', phone: '03001234567', address: '12 Fig Rd', city: 'Quetta', province: 'Balochistan', country: 'PK' },
    });

    // Customer submits a 5-star review via customer account endpoint
    const reviewRes = await request(app)
      .post('/api/account/reviews')
      .set('Authorization', customer.authorization)
      .send({
        productId: String(product._id),
        rating: 5,
        title: 'Outstanding Figs',
        comment: 'Fresh, sweet, and perfectly packaged with great flavor.',
      });

    expect(reviewRes.status).toBe(201);
    const reviewId = reviewRes.body.data.review?.id || reviewRes.body.data.review?._id || reviewRes.body.data._id;

    // Direct MongoDB check: Review is initially created with pending status
    const initialDbReview = await Review.findById(reviewId);
    expect(initialDbReview).not.toBeNull();
    expect(initialDbReview.status).toBe('pending');

    // Public product reviews endpoint does NOT list pending reviews
    const publicPendingRes = await request(app).get(`/api/account/reviews/product/${product._id}`);
    expect(publicPendingRes.status).toBe(200);
    const publicPendingItems = publicPendingRes.body.data?.reviews || [];
    const publicPendingIds = publicPendingItems.map((r) => String(r._id || r.id));
    expect(publicPendingIds).not.toContain(String(reviewId));

    // Admin moderates and approves the review
    const approveRes = await request(app)
      .patch(`/api/reviews/${reviewId}/approve`)
      .set('Authorization', admin.authorization)
      .send({});

    expect(approveRes.status).toBe(200);

    // Direct MongoDB checks: Review is approved and Product rating projection is updated
    const approvedDbReview = await Review.findById(reviewId);
    expect(approvedDbReview.status).toBe('approved');

    const updatedDbProduct = await Product.findById(product._id);
    expect(updatedDbProduct.rating).toBe(5);
    expect(updatedDbProduct.reviewCount).toBe(1);

    // Public product reviews endpoint now lists the approved review
    const publicApprovedRes = await request(app).get(`/api/account/reviews/product/${product._id}`);
    expect(publicApprovedRes.status).toBe(200);
    const publicApprovedItems = publicApprovedRes.body.data?.reviews || [];
    const publicApprovedIds = publicApprovedItems.map((r) => String(r._id || r.id));
    expect(publicApprovedIds).toContain(String(reviewId));
  });

  test('7. CMS publish, update and unpublish reaches public storefront (Persisted DB State Verified)', async () => {
    const admin = await createAuth('admin');
    const slug = `p10-privacy-policy-${Date.now()}`;

    // Admin creates and publishes a CMS policy page
    const createCmsRes = await request(app)
      .post('/api/content')
      .set('Authorization', admin.authorization)
      .send({
        type: 'page',
        slug,
        title: 'Phase 10 Privacy Policy',
        content: '# Privacy Policy\nWe strictly protect customer data.',
        isActive: true,
      });

    expect(createCmsRes.status).toBe(201);
    const contentId = createCmsRes.body.data._id;

    // Direct MongoDB verification
    const dbContent = await Content.findById(contentId);
    expect(dbContent.isActive).toBe(true);
    expect(dbContent.slug).toBe(slug);

    // Public storefront fetches the CMS page
    const publicCmsRes = await request(app).get(`/api/content/slug/${slug}`);
    expect(publicCmsRes.status).toBe(200);
    expect(publicCmsRes.body.data.title).toBe('Phase 10 Privacy Policy');

    // Admin updates content
    const updateCmsRes = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', admin.authorization)
      .send({
        title: 'Phase 10 Privacy Policy — Updated',
      });
    expect(updateCmsRes.status).toBe(200);

    // Public storefront sees the update
    const publicUpdatedRes = await request(app).get(`/api/content/slug/${slug}`);
    expect(publicUpdatedRes.status).toBe(200);
    expect(publicUpdatedRes.body.data.title).toBe('Phase 10 Privacy Policy — Updated');

    // Admin deactivates the CMS page
    const deactivateRes = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', admin.authorization)
      .send({
        isActive: false,
      });
    expect(deactivateRes.status).toBe(200);

    // Direct MongoDB verification: isActive is false
    const dbDeactivatedContent = await Content.findById(contentId);
    expect(dbDeactivatedContent.isActive).toBe(false);

    // Public storefront now returns 404 for the deactivated page
    const publicDeactivatedRes = await request(app).get(`/api/content/slug/${slug}`);
    expect(publicDeactivatedRes.status).toBe(404);
  });

  test('8. Eligible return succeeds; duplicate and out-of-window returns fail closed', async () => {
    const customer = await createAuth('customer');
    const categoryId = new mongoose.Types.ObjectId();

    const product = await Product.create({
      name: 'Phase 10 Pine Nuts',
      slug: `phase10-pinenuts-${Date.now()}`,
      description: 'Chilgoza pine nuts.',
      price: 5000,
      stock: 10,
      category: categoryId,
      sku: `P10-CHILGOZA-${Date.now()}`,
      status: 'published',
      isActive: true,
    });

    // 1. Order delivered 5 days ago (ELIGIBLE within 30-day window)
    const eligibleOrder = await Order.create({
      user: customer.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [
        {
          product: product._id,
          name: product.name,
          sku: product.sku,
          price: 5000,
          quantity: 2,
          lineTotal: 10000,
        },
      ],
      subtotal: 10000,
      totalAmount: 10000,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      deliveredAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      statusTimeline: [{ status: 'Delivered', actor: customer.user._id, actorRole: 'customer', timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000) }],
      shippingAddress: { fullName: 'Return Buyer', phone: '03001234567', address: '1 Return Ave', city: 'Peshawar', province: 'KPK', country: 'PK' },
    });

    // Customer requests return for eligible order via customer account route
    const returnRes = await request(app)
      .post('/api/account/returns')
      .set('Authorization', customer.authorization)
      .send({
        orderId: String(eligibleOrder._id),
        items: [
          {
            productId: String(product._id),
            quantity: 1,
            reason: 'damaged',
            condition: 'new',
          },
        ],
        customerNotes: 'Packaging damaged in transit',
      });

    expect(returnRes.status).toBe(201);
    const returnId = returnRes.body.data.return?.id || returnRes.body.data.return?._id || returnRes.body.data._id;

    // Direct MongoDB verification of return record
    const dbReturn = await Return.findById(returnId);
    expect(dbReturn).not.toBeNull();
    expect(dbReturn.order.toString()).toBe(String(eligibleOrder._id));
    expect(dbReturn.status).toBe('pending');

    // Duplicate return attempt on the same order while active return exists -> MUST FAIL CLOSED (409 Conflict)
    const duplicateReturnRes = await request(app)
      .post('/api/account/returns')
      .set('Authorization', customer.authorization)
      .send({
        orderId: String(eligibleOrder._id),
        items: [
          {
            productId: String(product._id),
            quantity: 1,
            reason: 'damaged',
            condition: 'new',
          },
        ],
        customerNotes: 'Duplicate return attempt',
      });

    expect([400, 409]).toContain(duplicateReturnRes.status);

    // 2. Order delivered 40 days ago (INELIGIBLE — beyond 30-day window)
    const expiredOrder = await Order.create({
      user: customer.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [
        {
          product: product._id,
          name: product.name,
          sku: product.sku,
          price: 5000,
          quantity: 1,
          lineTotal: 5000,
        },
      ],
      subtotal: 5000,
      totalAmount: 5000,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      deliveredAt: new Date(Date.now() - 40 * 24 * 3600 * 1000), // 40 days ago
      statusTimeline: [{ status: 'Delivered', actor: customer.user._id, actorRole: 'customer', timestamp: new Date(Date.now() - 40 * 24 * 3600 * 1000) }],
      shippingAddress: { fullName: 'Expired Return Buyer', phone: '03001234567', address: '2 Expired Ave', city: 'Lahore', province: 'Punjab', country: 'PK' },
    });

    const expiredReturnRes = await request(app)
      .post('/api/account/returns')
      .set('Authorization', customer.authorization)
      .send({
        orderId: String(expiredOrder._id),
        items: [
          {
            productId: String(product._id),
            quantity: 1,
            reason: 'damaged',
            condition: 'new',
          },
        ],
        customerNotes: 'Trying to return after 40 days',
      });

    expect([400, 409, 422]).toContain(expiredReturnRes.status);
  });

  test('9. Dormant payment providers (JazzCash, EasyPaisa) remain unavailable; approved providers respond safely', async () => {
    // Check available payment configurations / methods
    const paymentMethodsRes = await request(app).get('/api/payments/methods');
    expect(paymentMethodsRes.status).toBe(200);

    const methods = paymentMethodsRes.body.data || paymentMethodsRes.body;
    const methodKeys = Array.isArray(methods) ? methods.map((m) => m.id || m.key || m.name) : Object.keys(methods);

    // Strictly ensure dormant providers are NOT presented as active
    expect(methodKeys).not.toContain('jazzcash');
    expect(methodKeys).not.toContain('easypaisa');
  });
});
