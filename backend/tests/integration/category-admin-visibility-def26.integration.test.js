const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Category = require('../../models/Category');
const Product = require('../../models/Product');
const { CANONICAL_ROLES } = require('../../constants/roleConstants');

let sequence = 0;

const createAuthenticatedUserWithToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `def26-user-${sequence}-${Date.now()}@example.test`,
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

  return {
    user,
    session,
    token: `Bearer ${token}`,
    rawToken: token
  };
};

describe('DEF-26: Public/Admin Category Visibility & Authorization Integration Suite', () => {
  let activeCat1;
  let activeCat2;
  let inactiveCat1;
  let inactiveCat2;

  let adminAuth;
  let superAdminAuth;
  let customerAuth;
  let supportAuth;
  let inventoryAuth;
  let managerAuth;

  beforeEach(async () => {
    // Clear categories
    await Category.deleteMany({});
    await Product.deleteMany({});

    // Seed active categories
    activeCat1 = await Category.create({
      name: 'Dry Fruits Active',
      slug: 'dry-fruits-active',
      description: 'Premium organic dry fruits',
      isActive: true,
      displayOrder: 1
    });

    activeCat2 = await Category.create({
      name: 'Organic Honey Active',
      slug: 'organic-honey-active',
      description: 'Pure mountain honey',
      isActive: true,
      displayOrder: 2
    });

    // Seed inactive categories
    inactiveCat1 = await Category.create({
      name: 'Draft Seasonal Inactive',
      slug: 'draft-seasonal-inactive',
      description: 'Unreleased seasonal dry fruits',
      isActive: false,
      displayOrder: 3
    });

    inactiveCat2 = await Category.create({
      name: 'Archived Herbs Inactive',
      slug: 'archived-herbs-inactive',
      description: 'Discontinued herbal tea',
      isActive: false,
      displayOrder: 4
    });

    // Setup Auth fixtures
    adminAuth = await createAuthenticatedUserWithToken(CANONICAL_ROLES.ADMIN);
    superAdminAuth = await createAuthenticatedUserWithToken(CANONICAL_ROLES.SUPER_ADMIN);
    customerAuth = await createAuthenticatedUserWithToken(CANONICAL_ROLES.CUSTOMER);
    supportAuth = await createAuthenticatedUserWithToken(CANONICAL_ROLES.SUPPORT);
    inventoryAuth = await createAuthenticatedUserWithToken(CANONICAL_ROLES.INVENTORY);
    managerAuth = await createAuthenticatedUserWithToken(CANONICAL_ROLES.MANAGER);
  });

  // ==========================================
  // Part 1: Public Category Visibility Matrix
  // ==========================================
  describe('Part 1: Public Category Visibility Matrix (Tests 1-10)', () => {
    it('1. Anonymous public list returns active categories', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const returnedSlugs = res.body.data.map(c => c.slug);
      expect(returnedSlugs).toContain(activeCat1.slug);
      expect(returnedSlugs).toContain(activeCat2.slug);
    });

    it('2. Public list excludes inactive categories', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);

      const returnedSlugs = res.body.data.map(c => c.slug);
      expect(returnedSlugs).not.toContain(inactiveCat1.slug);
      expect(returnedSlugs).not.toContain(inactiveCat2.slug);
      expect(res.body.data.every(c => c.isActive === true)).toBe(true);
    });

    it('3. Public detail by active ObjectId succeeds', async () => {
      const res = await request(app).get(`/api/categories/${activeCat1._id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(activeCat1._id.toString());
      expect(res.body.data.name).toBe('Dry Fruits Active');
    });

    it('4. Public detail by active slug succeeds', async () => {
      const res = await request(app).get(`/api/categories/${activeCat2.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(activeCat2._id.toString());
      expect(res.body.data.name).toBe('Organic Honey Active');
    });

    it('5. Public detail for inactive ObjectId returns 404', async () => {
      const res = await request(app).get(`/api/categories/${inactiveCat1._id}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Category not found');
    });

    it('6. Public detail for inactive slug returns 404', async () => {
      const res = await request(app).get(`/api/categories/${inactiveCat1.slug}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Category not found');
    });

    it('7. Unknown category returns truthful not-found (404)', async () => {
      const unknownSlugRes = await request(app).get('/api/categories/non-existent-category-xyz');
      expect(unknownSlugRes.status).toBe(404);
      expect(unknownSlugRes.body.success).toBe(false);
      expect(unknownSlugRes.body.message).toBe('Category not found');

      const unknownIdRes = await request(app).get(`/api/categories/${new mongoose.Types.ObjectId()}`);
      expect(unknownIdRes.status).toBe(404);
      expect(unknownIdRes.body.success).toBe(false);
      expect(unknownIdRes.body.message).toBe('Category not found');
    });

    it('8. Malformed identity does not cause CastError (returns 404)', async () => {
      const malformedRes = await request(app).get('/api/categories/invalid--id$$--not-hex');
      expect(malformedRes.status).toBe(404);
      expect(malformedRes.body.success).toBe(false);
      expect(malformedRes.body.message).toBe('Category not found');
    });

    it('9. Public query cannot request inactive records via query manipulation', async () => {
      // Query parameters like ?includeInactive=true, ?all=true, ?status=all must not expose inactive categories
      const resQuery1 = await request(app).get('/api/categories?includeInactive=true');
      expect(resQuery1.status).toBe(200);
      const returnedSlugs1 = resQuery1.body.data.map(c => c.slug);
      expect(returnedSlugs1).not.toContain(inactiveCat1.slug);
      expect(returnedSlugs1).not.toContain(inactiveCat2.slug);

      const resQuery2 = await request(app).get('/api/categories?isActive=false');
      expect(resQuery2.status).toBe(200);
      const returnedSlugs2 = resQuery2.body.data.map(c => c.slug);
      expect(returnedSlugs2).not.toContain(inactiveCat1.slug);
      expect(returnedSlugs2).not.toContain(inactiveCat2.slug);
    });

    it('10. Public category behavior preserves storefront envelope and compatibility', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);

      const firstItem = res.body.data[0];
      expect(firstItem).toHaveProperty('_id');
      expect(firstItem).toHaveProperty('name');
      expect(firstItem).toHaveProperty('slug');
      expect(firstItem).toHaveProperty('isActive', true);
    });
  });

  // ==========================================
  // Part 2: Admin Authentication & RBAC Matrix
  // ==========================================
  describe('Part 2: Admin Authentication & RBAC Matrix (Tests 11-24)', () => {
    it('11. Anonymous admin-list request returns 401', async () => {
      const res = await request(app).get('/api/admin/categories');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('12. Malformed token returns 401', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('13. Expired token returns 401', async () => {
      // Session with expired timestamp
      const expiredSession = await Session.create({
        user: adminAuth.user._id,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        tokenFamilyId: crypto.randomUUID(),
        isActive: true,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 3600000) // Expired 1 hour ago
      });

      const expiredToken = TokenService.generateAccessToken({
        userId: adminAuth.user._id,
        sessionId: expiredSession._id,
        tokenVersion: adminAuth.user.tokenVersion
      });

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });

    it('14. Revoked session returns 401', async () => {
      await Session.findByIdAndUpdate(adminAuth.session._id, { isRevoked: true });

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', adminAuth.token);
      expect(res.status).toBe(401);
    });

    it('15. Customer role returns 403', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', customerAuth.token);
      expect(res.status).toBe(403);
    });

    it('16. Every unauthorized staff role is tested separately (support, inventory, manager -> 403)', async () => {
      const supportRes = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', supportAuth.token);
      expect(supportRes.status).toBe(403);

      const inventoryRes = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', inventoryAuth.token);
      expect(inventoryRes.status).toBe(403);

      const managerRes = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', managerAuth.token);
      expect(managerRes.status).toBe(403);
    });

    it('17. Authorized admin role can list active and inactive categories', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', adminAuth.token);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const slugs = res.body.data.map(c => c.slug);
      expect(slugs).toContain(activeCat1.slug);
      expect(slugs).toContain(activeCat2.slug);
      expect(slugs).toContain(inactiveCat1.slug);
      expect(slugs).toContain(inactiveCat2.slug);
    });

    it('18. Authorized super-admin role can list active and inactive categories', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', superAdminAuth.token);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const slugs = res.body.data.map(c => c.slug);
      expect(slugs).toContain(activeCat1.slug);
      expect(slugs).toContain(inactiveCat1.slug);
    });

    it('19. Authorized admin can retrieve inactive category by ObjectId', async () => {
      const res = await request(app)
        .get(`/api/admin/categories/${inactiveCat1._id}`)
        .set('Authorization', adminAuth.token);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(inactiveCat1._id.toString());
      expect(res.body.data.isActive).toBe(false);
      expect(res.body.data.name).toBe('Draft Seasonal Inactive');
    });

    it('20. Authorized admin can retrieve inactive category by slug', async () => {
      const res = await request(app)
        .get(`/api/admin/categories/${inactiveCat1.slug}`)
        .set('Authorization', adminAuth.token);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(inactiveCat1._id.toString());
      expect(res.body.data.isActive).toBe(false);
      expect(res.body.data.name).toBe('Draft Seasonal Inactive');
    });

    it('21. Unknown admin category returns truthful 404', async () => {
      const resSlug = await request(app)
        .get('/api/admin/categories/unknown-slug-123')
        .set('Authorization', adminAuth.token);
      expect(resSlug.status).toBe(404);
      expect(resSlug.body.success).toBe(false);
      expect(resSlug.body.message).toBe('Category not found');

      const resId = await request(app)
        .get(`/api/admin/categories/${new mongoose.Types.ObjectId()}`)
        .set('Authorization', adminAuth.token);
      expect(resId.status).toBe(404);
      expect(resId.body.success).toBe(false);
      expect(resId.body.message).toBe('Category not found');
    });

    it('22. Operator-shaped identity cannot inject a MongoDB query on admin route', async () => {
      const res = await request(app)
        .get('/api/admin/categories/$where')
        .set('Authorization', adminAuth.token);
      expect(res.status).toBe(404);
    });

    it('23. Admin route cannot be shadowed by public /:id', async () => {
      // Accessing /api/admin/categories must reach admin router, not public category detail route with id="admin"
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', adminAuth.token);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('24. Response does not expose credentials or unrelated sensitive fields', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', adminAuth.token);
      expect(res.status).toBe(200);

      res.body.data.forEach(item => {
        expect(item).not.toHaveProperty('password');
        expect(item).not.toHaveProperty('tokenVersion');
        expect(item).not.toHaveProperty('refreshTokenHash');
      });
    });
  });

  // ==========================================
  // Part 3: Mutations & Legacy Compatibility
  // ==========================================
  describe('Part 3: Mutation Workflows & Legacy Compatibility (Tests 25-32)', () => {
    it('25. Existing authorized create on /api/admin/categories succeeds', async () => {
      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', adminAuth.token)
        .send({
          name: 'Super Spices',
          slug: 'super-spices',
          description: 'Aromatic pure spices',
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Super Spices');
      expect(res.body.data.slug).toBe('super-spices');

      const saved = await Category.findOne({ slug: 'super-spices' });
      expect(saved).not.toBeNull();
    });

    it('26. Existing authorized update on /api/admin/categories/:id succeeds', async () => {
      const res = await request(app)
        .put(`/api/admin/categories/${inactiveCat1._id}`)
        .set('Authorization', adminAuth.token)
        .send({
          name: 'Draft Seasonal Activated',
          isActive: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.name).toBe('Draft Seasonal Activated');

      const updated = await Category.findById(inactiveCat1._id);
      expect(updated.isActive).toBe(true);
    });

    it('27. Existing authorized delete on /api/admin/categories/:id succeeds when unassigned', async () => {
      const disposable = await Category.create({
        name: 'Disposable Category',
        slug: 'disposable-cat',
        isActive: false
      });

      const res = await request(app)
        .delete(`/api/admin/categories/${disposable._id}`)
        .set('Authorization', adminAuth.token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await Category.findById(disposable._id);
      expect(deleted).toBeNull();
    });

    it('28. Unauthorized mutation on /api/admin/categories returns 401/403', async () => {
      // 401 Unauthenticated
      const unauthRes = await request(app)
        .post('/api/admin/categories')
        .send({ name: 'Hacker Category', slug: 'hacker-cat' });
      expect(unauthRes.status).toBe(401);

      // 403 Customer
      const customerRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', customerAuth.token)
        .send({ name: 'Customer Category', slug: 'customer-cat' });
      expect(customerRes.status).toBe(403);
    });

    it('29. Legacy mutation compatibility route POST /api/categories succeeds with RFC 9745 Deprecation date and replacement hint', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminAuth.token)
        .send({
          name: 'Legacy Created Category',
          slug: 'legacy-created-cat',
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.headers['deprecation']).toBe('@1789084800');
      expect(res.headers['deprecation']).toMatch(/^@[0-9]+$/);
      expect(res.headers['x-api-deprecated']).toBe('true');
      expect(res.headers['x-api-replacement']).toBe('/api/admin/categories');
      expect(res.headers['sunset']).toBeUndefined();
    });

    it('30. Legacy mutation compatibility route PUT /api/categories/:id succeeds with RFC 9745 Deprecation date and replacement hint', async () => {
      const res = await request(app)
        .put(`/api/categories/${activeCat1._id}`)
        .set('Authorization', adminAuth.token)
        .send({
          name: 'Updated Dry Fruits'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['deprecation']).toBe('@1789084800');
      expect(res.headers['deprecation']).toMatch(/^@[0-9]+$/);
      expect(res.headers['x-api-deprecated']).toBe('true');
      expect(res.headers['x-api-replacement']).toBe('/api/admin/categories');
      expect(res.headers['sunset']).toBeUndefined();
    });

    it('31. Legacy mutation compatibility route DELETE /api/categories/:id succeeds with RFC 9745 Deprecation date and replacement hint', async () => {
      const disposable = await Category.create({
        name: 'Legacy Disposable',
        slug: 'legacy-disposable',
        isActive: false
      });

      const res = await request(app)
        .delete(`/api/categories/${disposable._id}`)
        .set('Authorization', adminAuth.token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['deprecation']).toBe('@1789084800');
      expect(res.headers['deprecation']).toMatch(/^@[0-9]+$/);
      expect(res.headers['x-api-deprecated']).toBe('true');
      expect(res.headers['x-api-replacement']).toBe('/api/admin/categories');
      expect(res.headers['sunset']).toBeUndefined();
    });

    it('32. Legacy mutation routes reject anonymous/unauthorized callers (401/403) before execution', async () => {
      const unauthPost = await request(app)
        .post('/api/categories')
        .send({ name: 'Unauth Cat', slug: 'unauth-cat' });
      expect(unauthPost.status).toBe(401);

      const customerPut = await request(app)
        .put(`/api/categories/${activeCat1._id}`)
        .set('Authorization', customerAuth.token)
        .send({ name: 'Tampered Name' });
      expect(customerPut.status).toBe(403);

      const managerDelete = await request(app)
        .delete(`/api/categories/${activeCat1._id}`)
        .set('Authorization', managerAuth.token);
      expect(managerDelete.status).toBe(403);
    });

    it('33. Canonical admin routes and public GET routes do NOT contain Deprecation or Sunset headers', async () => {
      // Canonical Admin routes
      const adminListRes = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', adminAuth.token);
      expect(adminListRes.status).toBe(200);
      expect(adminListRes.headers['deprecation']).toBeUndefined();
      expect(adminListRes.headers['x-api-deprecated']).toBeUndefined();
      expect(adminListRes.headers['sunset']).toBeUndefined();

      const adminPostRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', adminAuth.token)
        .send({ name: 'Canonical Cat', slug: 'canonical-cat' });
      expect(adminPostRes.status).toBe(201);
      expect(adminPostRes.headers['deprecation']).toBeUndefined();
      expect(adminPostRes.headers['x-api-deprecated']).toBeUndefined();
      expect(adminPostRes.headers['sunset']).toBeUndefined();

      // Public GET routes
      const publicListRes = await request(app).get('/api/categories');
      expect(publicListRes.status).toBe(200);
      expect(publicListRes.headers['deprecation']).toBeUndefined();
      expect(publicListRes.headers['x-api-deprecated']).toBeUndefined();
      expect(publicListRes.headers['sunset']).toBeUndefined();

      const publicDetailRes = await request(app).get(`/api/categories/${activeCat1._id}`);
      expect(publicDetailRes.status).toBe(200);
      expect(publicDetailRes.headers['deprecation']).toBeUndefined();
      expect(publicDetailRes.headers['x-api-deprecated']).toBeUndefined();
      expect(publicDetailRes.headers['sunset']).toBeUndefined();
    });
  });
});
