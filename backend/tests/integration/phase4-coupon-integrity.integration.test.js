const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Coupon = require('../../models/Coupon');
const CouponRedemption = require('../../models/CouponRedemption');
const Product = require('../../models/Product');
const CouponService = require('../../services/order/CouponService');
const OrderService = require('../../services/order/OrderService');

let sequence = 0;

const createAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `coupon-test-${sequence}-${role}@example.test`,
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
    name: 'Walnuts Supreme',
    slug: `walnuts-supreme-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fresh organic walnuts',
    price: 2000,
    costPrice: 1200,
    stock: 50,
    sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    status: 'published',
    isActive: true,
    category: new mongoose.Types.ObjectId(),
    ...overrides
  });
};

describe('Phase 4: Coupon Integrity, Durable Ledger & Checkout Integration', () => {
  describe('RBAC matrix verification', () => {
    const CANONICAL_ROLES = ['customer', 'support', 'inventory', 'manager', 'admin', 'super_admin'];

    test('GET /api/coupons is allowed for support, manager, admin, super_admin', async () => {
      for (const role of CANONICAL_ROLES) {
        const { token } = await createAuthToken(role);
        const res = await request(app).get('/api/coupons').set('Authorization', token);
        if (['support', 'manager', 'admin', 'super_admin'].includes(role)) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      }
    });

    test('POST /api/coupons is allowed only for manager, admin, super_admin', async () => {
      for (const role of CANONICAL_ROLES) {
        const { token } = await createAuthToken(role);
        const code = `PROMO-${role.toUpperCase()}-${Date.now()}`;
        const res = await request(app)
          .post('/api/coupons')
          .set('Authorization', token)
          .send({
            code,
            type: 'percentage',
            value: 15,
            startDate: new Date(Date.now() - 3600000),
            endDate: new Date(Date.now() + 86400000)
          });

        if (['manager', 'admin', 'super_admin'].includes(role)) {
          expect(res.status).toBe(201);
        } else {
          expect(res.status).toBe(403);
        }
      }
    });

    test('DELETE /api/coupons/:id/draft is restricted to super_admin', async () => {
      const coupon = await Coupon.create({
        code: `DRAFT-${Date.now()}`,
        type: 'fixed',
        value: 100,
        status: 'draft',
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000)
      });

      for (const role of CANONICAL_ROLES) {
        const { token } = await createAuthToken(role);
        const res = await request(app)
          .delete(`/api/coupons/${coupon._id}/draft`)
          .set('Authorization', token);

        if (role === 'super_admin') {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      }
    });
  });

  describe('Public Non-binding Coupon Preview', () => {
    test('preview calculates discount from authoritative product prices without trusting client totals', async () => {
      const product = await createTestProduct({ price: 1000 });
      const coupon = await Coupon.create({
        code: 'SAVE20',
        type: 'percentage',
        value: 20,
        maxDiscount: 150,
        status: 'active',
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000)
      });

      // Public call with arbitrary client manipulated subtotal and fake userId in body
      const res = await request(app)
        .post('/api/coupons/validate')
        .send({
          code: 'SAVE20',
          subtotal: 50, // Client tries to spoof low subtotal
          userId: '65f000000000000000000099', // Client tries to spoof arbitrary userId
          items: [{
            product: String(product._id),
            quantity: 2 // Authoritative subtotal: 2 * 1000 = 2000
          }]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('SAVE20');
      // 20% of 2000 = 400, capped by maxDiscount: 150
      expect(res.body.data.estimatedDiscount).toBe(150);
      expect(res.body.data.eligibleSubtotal).toBe(2000);
      expect(res.body.data.isNonBindingPreview).toBe(true);
    });

    test('preview rejects expired or inactive coupon', async () => {
      await Coupon.create({
        code: 'EXPIRED10',
        type: 'fixed',
        value: 100,
        status: 'active',
        startDate: new Date(Date.now() - 7200000),
        endDate: new Date(Date.now() - 3600000)
      });

      const res = await request(app)
        .post('/api/coupons/validate')
        .send({ code: 'EXPIRED10' });

      expect(res.status).toBe(400);
    });
  });

  describe('Coupon Arithmetic and Strict Bounds', () => {
    test('fixed discount is strictly capped by eligibleSubtotal and cannot produce negative total', async () => {
      const product = await createTestProduct({ price: 300 });
      const coupon = await Coupon.create({
        code: 'BIGDISCOUNT500',
        type: 'fixed',
        value: 500, // Exceeds product price of 300
        status: 'active',
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000)
      });

      const result = CouponService.calculateDiscount({
        coupon,
        items: [{ product: product._id, lineTotal: 300 }],
        subtotal: 300
      });

      // Fixed discount capped by eligible subtotal: 300
      expect(result.discountAmount).toBe(300);
      const payable = Math.max(0, 300 - result.discountAmount);
      expect(payable).toBe(0);
    });
  });

  describe('Durable CouponRedemption Ledger & Idempotent Restoration', () => {
    test('validateAndReserve writes reserved ledger record and increments usedCount', async () => {
      const product = await createTestProduct({ price: 1000 });
      const { user } = await createAuthToken('customer');

      const coupon = await Coupon.create({
        code: 'LEDGER25',
        type: 'percentage',
        value: 25,
        status: 'active',
        usedCount: 0,
        perCustomerLimit: 1,
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000)
      });

      const checkoutKey = `CHK-TEST-${Date.now()}`;
      const reserved = await CouponService.validateAndReserve({
        code: 'LEDGER25',
        subtotal: 1000,
        items: [{ product: product._id, lineTotal: 1000 }],
        userId: user._id,
        checkoutKey
      });

      expect(reserved.discountAmount).toBe(250);
      expect(reserved.checkoutKey).toBe(checkoutKey);

      // Verify coupon usedCount incremented
      const checkCoupon = await Coupon.findById(coupon._id);
      expect(checkCoupon.usedCount).toBe(1);

      // Verify CouponRedemption record exists in reserved state
      const redemption = await CouponRedemption.findOne({ checkoutKey });
      expect(redemption).not.toBeNull();
      expect(redemption.status).toBe('reserved');
      expect(redemption.discountSnapshot.discountAmount).toBe(250);

      // Per-customer limit: second reservation by same customer should fail
      await expect(CouponService.validateAndReserve({
        code: 'LEDGER25',
        subtotal: 1000,
        items: [{ product: product._id, lineTotal: 1000 }],
        userId: user._id,
        checkoutKey: `CHK-TEST-2-${Date.now()}`
      })).rejects.toThrow();

      // Commit redemption
      const orderObjectId = new mongoose.Types.ObjectId();
      await CouponService.commitRedemption({
        checkoutKey,
        orderId: orderObjectId
      });

      const committedRedemption = await CouponRedemption.findOne({ checkoutKey });
      expect(committedRedemption.status).toBe('committed');
      expect(String(committedRedemption.orderId)).toBe(String(orderObjectId));

      // Idempotent release: restoreUsage transitions status to released and decrements usedCount
      await CouponService.restoreUsage({
        checkoutKey,
        couponSnapshot: { couponId: coupon._id },
        userId: user._id,
        releaseReason: 'order_cancelled'
      });

      const releasedCoupon = await Coupon.findById(coupon._id);
      expect(releasedCoupon.usedCount).toBe(0);

      const releasedRedemption = await CouponRedemption.findOne({ checkoutKey });
      expect(releasedRedemption.status).toBe('released');

      // Calling restoreUsage a second time should be completely idempotent (never decrement again)
      await CouponService.restoreUsage({
        checkoutKey,
        couponSnapshot: { couponId: coupon._id },
        userId: user._id,
        releaseReason: 'order_cancelled'
      });

      const doubleCheckCoupon = await Coupon.findById(coupon._id);
      expect(doubleCheckCoupon.usedCount).toBe(0);
    });
  });

  describe('Optimistic Concurrency & Used Coupon Protection', () => {
    test('blocks altering code or type if coupon has already been used in orders', async () => {
      const { token: adminToken } = await createAuthToken('admin');
      const coupon = await Coupon.create({
        code: 'LOCKED10',
        type: 'percentage',
        value: 10,
        usedCount: 3, // Already used in 3 orders
        status: 'active',
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await request(app)
        .put(`/api/coupons/${coupon._id}`)
        .set('Authorization', adminToken)
        .send({
          code: 'NEWCODE20' // Attempt to modify code
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot change coupon code after it has already been used');
    });

    test('enforces optimistic concurrency version check', async () => {
      const { token: adminToken } = await createAuthToken('admin');
      const coupon = await Coupon.create({
        code: 'VERSION10',
        type: 'fixed',
        value: 100,
        status: 'active',
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000)
      });

      // Pass outdated __v (e.g. 99 instead of 0)
      const res = await request(app)
        .put(`/api/coupons/${coupon._id}`)
        .set('Authorization', adminToken)
        .send({
          value: 150,
          __v: 99
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('VERSION_CONFLICT');
    });
  });
});
