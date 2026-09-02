const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Coupon = require('../../models/Coupon');
const TokenService = require('../../services/TokenService');
const authConfig = require('../../config/auth.config');

describe('Phase 4 Optional Authentication & Public Preview Behavioral Tests', () => {
  let customerUser;
  let anotherUser;
  let testProduct;
  let testCoupon;

  beforeEach(async () => {
    customerUser = await User.create({
      fullName: 'Preview Customer',
      email: 'preview@example.com',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true,
      tokenVersion: 1
    });

    anotherUser = await User.create({
      fullName: 'Another Customer',
      email: 'another@example.com',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true,
      tokenVersion: 1
    });

    testProduct = await Product.create({
      name: 'Preview Item',
      slug: 'preview-item',
      price: 1000,
      stock: 50,
      status: 'published',
      isActive: true,
      category: new mongoose.Types.ObjectId()
    });

    testCoupon = await Coupon.create({
      code: 'PREVIEW10',
      type: 'percentage',
      value: 10,
      status: 'active',
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(Date.now() + 86400000),
      usageLimit: 100
    });
  });

  test('missing token proceeds as unauthenticated preview', async () => {
    const res = await request(app)
      .post('/api/coupons/validate')
      .send({
        code: 'PREVIEW10',
        items: [{ productId: testProduct._id.toString(), quantity: 1 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('PREVIEW10');
    expect(res.body.data.discountAmount).toBe(100);
  });

  test('valid token derives the authenticated user identity', async () => {
    const token = TokenService.generateAccessToken({
      userId: customerUser._id.toString(),
      sessionId: new mongoose.Types.ObjectId().toString(),
      tokenVersion: customerUser.tokenVersion
    });

    const res = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'PREVIEW10',
        items: [{ productId: testProduct._id.toString(), quantity: 1 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.discountAmount).toBe(100);
  });

  test('invalid token returns 401', async () => {
    const res = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', 'Bearer invalid-token-string')
      .send({
        code: 'PREVIEW10',
        items: [{ productId: testProduct._id.toString(), quantity: 1 }]
      });

    expect(res.status).toBe(401);
  });

  test('expired token returns 401', async () => {
    const expiredToken = jwt.sign(
      {
        sub: customerUser._id.toString(),
        sid: new mongoose.Types.ObjectId().toString(),
        tokenVersion: customerUser.tokenVersion,
        type: 'access'
      },
      authConfig.jwt.secret,
      {
        expiresIn: '-1s',
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience
      }
    );

    const res = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({
        code: 'PREVIEW10',
        items: [{ productId: testProduct._id.toString(), quantity: 1 }]
      });

    expect(res.status).toBe(401);
  });

  test('revoked/tokenVersion-invalid token returns 401', async () => {
    const revokedToken = TokenService.generateAccessToken({
      userId: customerUser._id.toString(),
      sessionId: new mongoose.Types.ObjectId().toString(),
      tokenVersion: 999 // Mismatched tokenVersion
    });

    const res = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${revokedToken}`)
      .send({
        code: 'PREVIEW10',
        items: [{ productId: testProduct._id.toString(), quantity: 1 }]
      });

    expect(res.status).toBe(401);
  });

  test('body userId cannot override authenticated identity or impersonate user', async () => {
    const token = TokenService.generateAccessToken({
      userId: customerUser._id.toString(),
      sessionId: new mongoose.Types.ObjectId().toString(),
      tokenVersion: customerUser.tokenVersion
    });

    // Provide userPerCouponLimit: 1 on coupon and have anotherUser exceed it
    const limitedCoupon = await Coupon.create({
      code: 'USERLIMIT1',
      type: 'percentage',
      value: 10,
      status: 'active',
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(Date.now() + 86400000),
      userPerCouponLimit: 1,
      redemptions: [{ user: anotherUser._id, count: 1 }]
    });

    // Customer logs in as customerUser, but tries to pass anotherUser's id in body
    const res = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'USERLIMIT1',
        userId: anotherUser._id.toString(),
        items: [{ productId: testProduct._id.toString(), quantity: 1 }]
      });

    // Should evaluate against authenticated customerUser (who has 0 redemptions), NOT the body userId
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
