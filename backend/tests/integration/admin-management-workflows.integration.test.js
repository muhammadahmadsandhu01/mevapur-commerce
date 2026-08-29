const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');

let sequence = 0;

const adminAuthorization = async () => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `management-contract-${sequence}@example.test`,
    role: 'admin'
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

describe('Admin Content and Report contracts', () => {
  test('protects Content and Report operations', async () => {
    const [content, report] = await Promise.all([
      request(app).get('/api/content'),
      request(app).get('/api/reports/sales')
    ]);

    expect(content.status).toBe(401);
    expect(report.status).toBe(401);
  });

  test('supports the complete protected Content CRUD contract', async () => {
    const authorization = await adminAuthorization();
    const created = await request(app)
      .post('/api/content')
      .set('Authorization', authorization)
      .send({
        type: 'banner',
        title: 'Launch Banner',
        slug: 'launch-banner',
        subtitle: 'Stored subtitle',
        description: 'Stored description',
        image: 'https://images.example.test/banner.jpg',
        position: 2,
        isActive: true,
        isFeatured: false
      });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      type: 'banner',
      title: 'Launch Banner',
      slug: 'launch-banner',
      position: 2,
      isActive: true
    });

    const listed = await request(app)
      .get('/api/content?type=banner&search=Launch')
      .set('Authorization', authorization);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);

    const updated = await request(app)
      .put(`/api/content/${created.body.data._id}`)
      .set('Authorization', authorization)
      .send({ isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.isActive).toBe(false);

    const deleted = await request(app)
      .delete(`/api/content/${created.body.data._id}`)
      .set('Authorization', authorization);
    expect(deleted.status).toBe(200);

    const afterDelete = await request(app)
      .get('/api/content?type=banner')
      .set('Authorization', authorization);
    expect(afterDelete.body.data).toEqual([]);
  });

  test('returns the response shapes consumed by all Reports and Analytics tabs', async () => {
    const authorization = await adminAuthorization();
    const endpoints = [
      '/api/reports/sales?period=monthly',
      '/api/reports/products?sortBy=soldCount&limit=10',
      '/api/reports/customers?period=30',
      '/api/reports/orders',
      '/api/reports/analytics'
    ];
    const responses = await Promise.all(endpoints.map((endpoint) => (
      request(app).get(endpoint).set('Authorization', authorization)
    )));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses[0].body.data).toMatchObject({
      summary: { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 },
      chartData: [],
      paymentMethods: []
    });
    expect(responses[1].body.data).toMatchObject({
      topProducts: [],
      categoryStats: [],
      lowStockProducts: [],
      outOfStockCount: 0,
      totalProducts: 0
    });
    expect(responses[2].body.data).toMatchObject({
      summary: { totalCustomers: 0, newCustomers: 0 },
      topSpenders: [],
      customerGrowth: []
    });
    expect(responses[3].body.data).toMatchObject({
      statusBreakdown: [],
      recentOrders: [],
      avgProcessingTime: '0 days',
      totalOrders: 0
    });
    expect(responses[4].body.data).toEqual({
      thisMonth: { revenue: 0, orders: 0 },
      lastMonth: { revenue: 0, orders: 0 },
      growth: { revenue: 0, orders: 0 }
    });
  });

  test.each(['products', 'customers', 'orders'])(
    'provides an authenticated CSV export for %s',
    async (type) => {
      const authorization = await adminAuthorization();
      const response = await request(app)
        .get(`/api/reports/export/${type}`)
        .set('Authorization', authorization);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain(`${type}_report_`);
      expect(response.text.length).toBeGreaterThan(0);
    }
  );
});
