const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Category = require('../../models/Category');

let sequence = 0;

const getAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `category-auth-${sequence}-${Date.now()}@example.test`,
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

describe('Category Parent ID Normalization & Validation Integration Tests', () => {
  let adminToken;

  beforeEach(async () => {
    adminToken = await getAuthToken('admin');
  });

  describe('Category Creation Parent Normalization (POST /api/categories)', () => {
    it('creates a root category when parentId is empty string ("")', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminToken)
        .send({
          name: 'Main Category Empty Parent',
          slug: `main-empty-${Date.now()}`,
          parentId: '',
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBeNull();

      // Assert database document state
      const savedDoc = await Category.findById(res.body.data._id);
      expect(savedDoc).not.toBeNull();
      expect(savedDoc.parentId).toBeNull();
    });

    it('creates a root category when parentId is whitespace-only string', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminToken)
        .send({
          name: 'Main Category Whitespace Parent',
          slug: `main-whitespace-${Date.now()}`,
          parentId: '    ',
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBeNull();

      const savedDoc = await Category.findById(res.body.data._id);
      expect(savedDoc.parentId).toBeNull();
    });

    it('creates a root category when parentId is explicitly null', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminToken)
        .send({
          name: 'Main Category Explicit Null',
          slug: `main-null-${Date.now()}`,
          parentId: null,
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBeNull();

      const savedDoc = await Category.findById(res.body.data._id);
      expect(savedDoc.parentId).toBeNull();
    });

    it('creates a root category when parentId is omitted', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminToken)
        .send({
          name: 'Main Category Omitted Parent',
          slug: `main-omitted-${Date.now()}`,
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBeNull();

      const savedDoc = await Category.findById(res.body.data._id);
      expect(savedDoc.parentId).toBeNull();
    });

    it('creates a child category with a valid existing parent ID', async () => {
      const parent = await Category.create({
        name: 'Parent Dry Fruits',
        slug: `parent-nuts-${Date.now()}`
      });

      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminToken)
        .send({
          name: 'Sub Almonds',
          slug: `sub-almonds-${Date.now()}`,
          parentId: parent._id.toString(),
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId.toString()).toBe(parent._id.toString());

      const savedDoc = await Category.findById(res.body.data._id);
      expect(savedDoc.parentId.toString()).toBe(parent._id.toString());
    });

    it('returns controlled 400 when parentId is an invalid non-empty string', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminToken)
        .send({
          name: 'Invalid Parent Category',
          slug: `invalid-parent-${Date.now()}`,
          parentId: 'not-a-valid-id',
          isActive: true
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid parent category id/i);
    });

    it('returns controlled 400 when parentId is a non-existent ObjectId', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', adminToken)
        .send({
          name: 'Ghost Parent Category',
          slug: `ghost-parent-${Date.now()}`,
          parentId: nonExistentId,
          isActive: true
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/parent category not found/i);
    });
  });

  describe('Category Update Parent Normalization (PUT /api/categories/:id)', () => {
    let parentCategory;
    let childCategory;

    beforeEach(async () => {
      parentCategory = await Category.create({
        name: `Root Level ${Date.now()}`,
        slug: `root-level-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      });

      childCategory = await Category.create({
        name: `Child Level ${Date.now()}`,
        slug: `child-level-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        parentId: parentCategory._id
      });
    });

    it('clears parent when updated with parentId: "" (promotes to root category)', async () => {
      const res = await request(app)
        .put(`/api/categories/${childCategory._id}`)
        .set('Authorization', adminToken)
        .send({
          name: childCategory.name,
          parentId: ''
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBeNull();

      const updatedDoc = await Category.findById(childCategory._id);
      expect(updatedDoc.parentId).toBeNull();
    });

    it('clears parent when updated with parentId: null', async () => {
      const res = await request(app)
        .put(`/api/categories/${childCategory._id}`)
        .set('Authorization', adminToken)
        .send({
          name: childCategory.name,
          parentId: null
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBeNull();

      const updatedDoc = await Category.findById(childCategory._id);
      expect(updatedDoc.parentId).toBeNull();
    });

    it('clears parent when updated with whitespace-only parentId', async () => {
      const res = await request(app)
        .put(`/api/categories/${childCategory._id}`)
        .set('Authorization', adminToken)
        .send({
          name: childCategory.name,
          parentId: '   '
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBeNull();

      const updatedDoc = await Category.findById(childCategory._id);
      expect(updatedDoc.parentId).toBeNull();
    });

    it('preserves existing parent when parentId is omitted on update', async () => {
      const res = await request(app)
        .put(`/api/categories/${childCategory._id}`)
        .set('Authorization', adminToken)
        .send({
          name: 'Renamed Child Category'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId.toString()).toBe(parentCategory._id.toString());

      const updatedDoc = await Category.findById(childCategory._id);
      expect(updatedDoc.parentId.toString()).toBe(parentCategory._id.toString());
    });

    it('prevents a category from being its own parent', async () => {
      const res = await request(app)
        .put(`/api/categories/${parentCategory._id}`)
        .set('Authorization', adminToken)
        .send({
          name: parentCategory.name,
          parentId: parentCategory._id.toString()
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot be its own parent/i);
    });

    it('prevents cyclic category hierarchies (parent cannot become child of its own child)', async () => {
      const res = await request(app)
        .put(`/api/categories/${parentCategory._id}`)
        .set('Authorization', adminToken)
        .send({
          name: parentCategory.name,
          parentId: childCategory._id.toString()
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cyclic category hierarchy/i);
    });
  });

  describe('Model-Level Setter Defense in Depth', () => {
    it('Category model setter normalizes empty string parentId to null on direct save', async () => {
      const doc = new Category({
        name: 'Model Level Direct Test',
        slug: `model-test-${Date.now()}`,
        parentId: ''
      });

      expect(doc.parentId).toBeNull();
      await doc.save();
      expect(doc.parentId).toBeNull();

      const fetched = await Category.findById(doc._id);
      expect(fetched.parentId).toBeNull();
    });
  });
});
