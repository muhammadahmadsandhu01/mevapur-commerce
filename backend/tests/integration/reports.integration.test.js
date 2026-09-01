const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const User = require('../../models/User');

let sequence = 0;
const authAdmin = async () => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `admin-rep-${sequence}@example.test`,
    role: 'admin',
    isActive: true
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });
  return {
    user,
    authorization: `Bearer ${TokenService.generateAccessToken({
      userId: user._id,
      sessionId: session._id,
      tokenVersion: user.tokenVersion
    })}`
  };
};

describe('Reports API & Safe CSV Export Integration', () => {
  let adminAuth;
  let testCustomer;
  let testCategory;
  let testProduct;

  beforeEach(async () => {
    sequence += 1;
    adminAuth = await authAdmin();

    testCustomer = await global.createTestUser({
      fullName: '+123 Formula Name',
      email: `customer-rep-${sequence}@example.test`,
      role: 'customer',
      isActive: true
    });

    testCategory = await Category.create({
      name: 'Dry Fruits',
      slug: `dry-fruits-${sequence}`
    });

    testProduct = await Product.create({
      name: '=CMD() Injected Product',
      slug: `prd-inj-${sequence}`,
      description: 'A test product description for reporting',
      sku: `PRD-INJ-${sequence}`,
      price: 150.50,
      stock: 5,
      lowStockThreshold: 10,
      category: testCategory._id,
      images: ['https://example.test/img.png']
    });

    // Create a paid order
    await Order.create({
      user: testCustomer._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      totalAmount: 150.50,
      subtotal: 150.50,
      paymentMethod: 'cod',
      orderStatus: 'Delivered',
      paymentStatus: 'Paid',
      shippingAddress: {
        fullName: '+123 Formula Name',
        phone: '03001234567',
        address: 'Street 1',
        city: 'Lahore',
        province: 'Punjab',
        country: 'Pakistan'
      },
      items: [{
        product: testProduct._id,
        name: testProduct.name,
        price: testProduct.price,
        quantity: 1,
        lineTotal: 150.50
      }],
      statusTimeline: [{
        status: 'Delivered',
        actor: testCustomer._id,
        actorRole: 'customer',
        timestamp: new Date(),
        note: ''
      }]
    });
  });

  describe('Reports endpoints authentication & structure', () => {
    it('GET /api/reports/sales returns valid sales summary and charts', async () => {
      const res = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalRevenue).toBe(150.50);
      expect(res.body.data.summary.totalOrders).toBe(1);
      expect(Array.isArray(res.body.data.chartData)).toBe(true);
      expect(Array.isArray(res.body.data.paymentMethods)).toBe(true);
    });

    it('GET /api/reports/products returns low stock products respecting threshold', async () => {
      const res = await request(app)
        .get('/api/reports/products')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.topProducts)).toBe(true);
      expect(Array.isArray(res.body.data.lowStockProducts)).toBe(true);
      expect(res.body.data.lowStockProducts.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/reports/customers returns top spenders and growth timeline', async () => {
      const res = await request(app)
        .get('/api/reports/customers')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.topSpenders)).toBe(true);
    });

    it('GET /api/reports/orders returns status breakdown and recent orders', async () => {
      const res = await request(app)
        .get('/api/reports/orders')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.statusBreakdown)).toBe(true);
      expect(Array.isArray(res.body.data.recentOrders)).toBe(true);
    });

    it('GET /api/reports/analytics returns month comparison and growth numbers', async () => {
      const res = await request(app)
        .get('/api/reports/analytics')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.thisMonth).toBeDefined();
      expect(res.body.data.lastMonth).toBeDefined();
      expect(res.body.data.growth).toBeDefined();
    });
  });

  describe('Safe CSV Export & Neutralization', () => {
    it('exports orders CSV with UTF-8 BOM and neutralizes formula injection on customer names', async () => {
      const res = await request(app)
        .get('/api/reports/export/orders')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="orders_report_');

      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xFEFF); // UTF-8 BOM
      expect(text).toContain("'+123 Formula Name"); // Formula neutralized with '
      expect(text).toContain('150.5');
    });

    it('exports products CSV and neutralizes formula injection on product names', async () => {
      const res = await request(app)
        .get('/api/reports/export/products')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');

      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xFEFF);
      expect(text).toContain("'=CMD() Injected Product");
    });

    it('exports customers CSV strictly with allowlisted fields (no passwords or tokens)', async () => {
      const res = await request(app)
        .get('/api/reports/export/customers')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xFEFF);
      expect(text).toContain('Customer Name,Email,Phone,Role,Joined Date');
      expect(text).not.toContain('password');
      expect(text).not.toContain('refreshToken');
      expect(text).not.toContain('tokenFamilyId');
    });

    it('returns 400 for unsupported export types', async () => {
      const res = await request(app)
        .get('/api/reports/export/invalid_type')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unsupported export type');
    });
  });
});
