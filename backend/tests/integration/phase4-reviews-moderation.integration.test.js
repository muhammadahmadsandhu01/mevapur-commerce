const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Review = require('../../models/Review');
const ReviewReport = require('../../models/ReviewReport');
const AuditLog = require('../../models/AuditLog');

let sequence = 0;

const createAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `review-test-${sequence}-${role}@example.test`,
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

  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  });

  return { token: `Bearer ${token}`, user, session };
};

const createTestProduct = async (overrides = {}) => {
  return Product.create({
    name: 'Organic Almonds',
    slug: `organic-almonds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fresh organic almonds directly sourced from farms',
    price: 1500,
    costPrice: 1000,
    stock: 50,
    sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    status: 'published',
    isActive: true,
    rating: 0,
    reviewCount: 0,
    category: new mongoose.Types.ObjectId(),
    ...overrides
  });
};

describe('Phase 4: Reviews Moderation, Abuse Resistance & Rating Projection', () => {
  describe('RBAC matrix verification', () => {
    const CANONICAL_ROLES = ['customer', 'support', 'inventory', 'manager', 'admin', 'super_admin'];

    test('GET /api/reviews is allowed only for support, manager, admin, super_admin', async () => {
      for (const role of CANONICAL_ROLES) {
        const { token } = await createAuthToken(role);
        const res = await request(app).get('/api/reviews').set('Authorization', token);
        if (['support', 'manager', 'admin', 'super_admin'].includes(role)) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      }

      // Unauthenticated
      const unauth = await request(app).get('/api/reviews');
      expect(unauth.status).toBe(401);
    });

    test('PATCH /api/reviews/:id/approve is allowed only for manager, admin, super_admin', async () => {
      for (const role of CANONICAL_ROLES) {
        const product = await createTestProduct();
        const { user: author } = await createAuthToken('customer');
        const review = await Review.create({
          product: product._id,
          user: author._id,
          rating: 5,
          comment: 'Excellent almonds quality',
          status: 'pending'
        });

        const { token } = await createAuthToken(role);
        const res = await request(app)
          .patch(`/api/reviews/${review._id}/approve`)
          .set('Authorization', token);

        if (['manager', 'admin', 'super_admin'].includes(role)) {
          expect(res.status).toBe(200);
          expect(res.body.data.status).toBe('approved');
        } else {
          expect(res.status).toBe(403);
        }
      }
    });

    test('DELETE /api/reviews/:id/exceptional-erase is restricted strictly to super_admin', async () => {
      for (const role of CANONICAL_ROLES) {
        const product = await createTestProduct();
        const { user: author } = await createAuthToken('customer');
        const review = await Review.create({
          product: product._id,
          user: author._id,
          rating: 4,
          comment: 'Good product',
          status: 'pending'
        });

        const { token } = await createAuthToken(role);
        const res = await request(app)
          .delete(`/api/reviews/${review._id}/exceptional-erase`)
          .set('Authorization', token)
          .send({ legalReason: 'Court ordered legal compliance' });

        if (role === 'super_admin') {
          expect(res.status).toBe(200);
          const found = await Review.findById(review._id);
          expect(found).toBeNull();
        } else {
          expect(res.status).toBe(403);
        }
      }
    });
  });

  describe('Customer Review Submission and Delivered Purchase Guard', () => {
    test('rejects customer review if product was never delivered to customer', async () => {
      const product = await createTestProduct();
      const { token } = await createAuthToken('customer');

      const res = await request(app)
        .post('/api/account/reviews')
        .set('Authorization', token)
        .send({
          productId: String(product._id),
          rating: 5,
          comment: 'Best quality ever'
        });

      expect(res.status).toBe(403);
      expect(res.body.code || res.body.error?.code).toBe('CUSTOMER_REVIEW_NOT_ELIGIBLE');
    });

    test('accepts customer review with status: pending and verifiedPurchase: true when delivered order exists', async () => {
      const product = await createTestProduct();
      const { token, user } = await createAuthToken('customer');

      // Create a delivered order with all required schema fields
      await Order.create({
        orderId: `ORD-${Date.now()}-1001`,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        user: user._id,
        items: [{
          product: product._id,
          name: product.name,
          price: product.price,
          quantity: 1,
          lineTotal: product.price
        }],
        shippingAddress: {
          fullName: 'Test Customer',
          phone: '03001234567',
          address: 'Main Street 1',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'Pakistan'
        },
        paymentMethod: 'cod',
        paymentStatus: 'Paid',
        orderStatus: 'Delivered',
        subtotal: product.price,
        totalAmount: product.price,
        statusTimeline: [{
          status: 'Delivered',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date(),
          note: 'Order delivered'
        }]
      });

      const res = await request(app)
        .post('/api/account/reviews')
        .set('Authorization', token)
        .send({
          productId: String(product._id),
          rating: 5,
          title: 'Outstanding quality',
          comment: 'Very fresh almonds and prompt delivery.'
        });

      expect(res.status).toBe(201);
      const reviewId = res.body.data.review?._id || res.body.data.review?.id || res.body.data.id || res.body.data._id;
      const createdReview = await Review.findById(reviewId);
      expect(createdReview.status).toBe('pending');
      expect(createdReview.isApproved).toBe(false);
      expect(createdReview.isVerifiedPurchase).toBe(true);

      // Product rating should not include pending review
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.rating).toBe(0);
      expect(updatedProduct.reviewCount).toBe(0);
    });
  });

  describe('Report abuse resistance: Customer reporting does not auto-hide approved reviews', () => {
    test('customer report creates ReviewReport in pending and keeps review approved & visible', async () => {
      const product = await createTestProduct();
      const { user: author } = await createAuthToken('customer');
      const { token: reporterToken, user: reporter } = await createAuthToken('customer');
      const { token: adminToken } = await createAuthToken('admin');

      // Create approved review
      const review = await Review.create({
        product: product._id,
        user: author._id,
        rating: 5,
        title: 'Authentic taste',
        comment: 'Really loved this product.',
        status: 'approved'
      });

      // Update product rating
      const ReviewService = require('../../services/ReviewService');
      await ReviewService.recalculateProductRating(product._id);

      let prod = await Product.findById(product._id);
      expect(prod.rating).toBe(5);
      expect(prod.reviewCount).toBe(1);

      // Customer reports review
      const reportRes = await request(app)
        .post(`/api/reviews/${review._id}/reports`)
        .set('Authorization', reporterToken)
        .send({
          category: 'misleading',
          details: 'I believe this review contains exaggerated claims.'
        });

      expect(reportRes.status).toBe(201);
      expect(reportRes.body.data.status).toBe('pending');

      // Verify review remains approved and visible
      const checkReview = await Review.findById(review._id);
      expect(checkReview.status).toBe('approved');
      expect(checkReview.isApproved).toBe(true);

      prod = await Product.findById(product._id);
      expect(prod.rating).toBe(5);
      expect(prod.reviewCount).toBe(1);

      // Duplicate pending report from same user on same review must fail with 409
      const dupReport = await request(app)
        .post(`/api/reviews/${review._id}/reports`)
        .set('Authorization', reporterToken)
        .send({ category: 'spam', details: 'Spam report duplicate' });

      expect(dupReport.status).toBe(409);

      // Moderator resolves report as valid: review becomes flagged and removed from rating
      const resolveRes = await request(app)
        .patch(`/api/reviews/${review._id}/reports/${reportRes.body.data._id}/resolve`)
        .set('Authorization', adminToken)
        .send({
          action: 'approve_report',
          resolutionNote: 'Review violates guidelines.'
        });

      expect(resolveRes.status).toBe(200);

      const flaggedReview = await Review.findById(review._id);
      expect(flaggedReview.status).toBe('flagged');
      expect(flaggedReview.isApproved).toBe(false);
      expect(flaggedReview.isFlagged).toBe(true);

      // Product rating projection recalculated
      prod = await Product.findById(product._id);
      expect(prod.rating).toBe(0);
      expect(prod.reviewCount).toBe(0);
    });
  });

  describe('Customer edits and soft withdrawal', () => {
    test('customer edit resets approved review to pending and removes from product rating', async () => {
      const product = await createTestProduct();
      const { token: customerToken, user: author } = await createAuthToken('customer');

      const review = await Review.create({
        product: product._id,
        user: author._id,
        rating: 5,
        comment: 'Initial great review',
        status: 'approved'
      });

      const ReviewService = require('../../services/ReviewService');
      await ReviewService.recalculateProductRating(product._id);

      let prod = await Product.findById(product._id);
      expect(prod.rating).toBe(5);
      expect(prod.reviewCount).toBe(1);

      // Customer edits review
      const editRes = await request(app)
        .patch(`/api/account/reviews/${review._id}`)
        .set('Authorization', customerToken)
        .send({
          rating: 4,
          comment: 'Edited review after 1 month of use'
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.data.review.status).toBe('pending');
      expect(editRes.body.data.review.isApproved).toBe(false);

      // Product rating is now 0 because review is pending re-moderation
      prod = await Product.findById(product._id);
      expect(prod.rating).toBe(0);
      expect(prod.reviewCount).toBe(0);
    });

    test('customer deletion soft-withdraws review and updates rating projection', async () => {
      const product = await createTestProduct();
      const { token: customerToken, user: author } = await createAuthToken('customer');

      const review = await Review.create({
        product: product._id,
        user: author._id,
        rating: 5,
        comment: 'Review to be withdrawn',
        status: 'approved'
      });

      const ReviewService = require('../../services/ReviewService');
      await ReviewService.recalculateProductRating(product._id);

      // Withdraw
      const delRes = await request(app)
        .delete(`/api/account/reviews/${review._id}`)
        .set('Authorization', customerToken);

      expect(delRes.status).toBe(204);

      const checkReview = await Review.findById(review._id);
      expect(checkReview.status).toBe('withdrawn');
      expect(checkReview.isApproved).toBe(false);

      const prod = await Product.findById(product._id);
      expect(prod.rating).toBe(0);
      expect(prod.reviewCount).toBe(0);
    });
  });

  describe('AuditLog transactional recording', () => {
    test('records immutable AuditLog entries on review actions', async () => {
      const product = await createTestProduct();
      const { user: author } = await createAuthToken('customer');
      const { token: adminToken, user: adminUser } = await createAuthToken('admin');

      const review = await Review.create({
        product: product._id,
        user: author._id,
        rating: 4,
        comment: 'Nice quality packaging',
        status: 'pending'
      });

      await request(app)
        .patch(`/api/reviews/${review._id}/approve`)
        .set('Authorization', adminToken);

      const auditEntry = await AuditLog.findOne({
        eventName: 'REVIEW.APPROVED',
        userId: adminUser._id
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry.metadata.reviewId).toBe(String(review._id));
      expect(auditEntry.metadata.toStatus).toBe('approved');
    });
  });
});
