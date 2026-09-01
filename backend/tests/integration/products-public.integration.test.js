const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Product = require('../../models/Product');
const Category = require('../../models/Category');

describe('Public Products Catalog Integration Tests', () => {
  let publishedProduct;
  let draftProduct;
  let inactiveProduct;
  let archivedProduct;
  let testCategory;

  beforeEach(async () => {
    testCategory = await Category.create({
      name: `Public Cat ${Date.now()}-${Math.random()}`,
      slug: `pub-cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    });

    publishedProduct = await Product.create({
      name: 'Organic Cashews Published',
      slug: `organic-cashews-${Date.now()}`,
      description: 'Crunchy premium cashews.',
      category: testCategory._id,
      price: 1800,
      originalPrice: 2000,
      stock: 30,
      status: 'published',
      isActive: true,
      images: ['https://example.com/cashew.webp'],
      primaryImage: 'https://example.com/cashew.webp'
    });

    draftProduct = await Product.create({
      name: 'Unpublished Draft Item',
      slug: `draft-item-${Date.now()}`,
      description: 'Not ready for sale.',
      category: testCategory._id,
      price: 500,
      stock: 10,
      status: 'draft',
      isActive: false
    });

    inactiveProduct = await Product.create({
      name: 'Inactive Seasonal Item',
      slug: `inactive-item-${Date.now()}`,
      description: 'Out of season.',
      category: testCategory._id,
      price: 700,
      stock: 5,
      status: 'inactive',
      isActive: false
    });

    archivedProduct = await Product.create({
      name: 'Archived Discontinued Item',
      slug: `archived-item-${Date.now()}`,
      description: 'No longer sold.',
      category: testCategory._id,
      price: 400,
      stock: 0,
      status: 'archived',
      isActive: false
    });
  });

  it('GET /api/products returns only published active products', async () => {
    const response = await request(app).get('/api/products');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const productIds = response.body.data.map(p => String(p._id));
    expect(productIds).toContain(String(publishedProduct._id));
    expect(productIds).not.toContain(String(draftProduct._id));
    expect(productIds).not.toContain(String(inactiveProduct._id));
    expect(productIds).not.toContain(String(archivedProduct._id));
  });

  it('GET /api/products?admin=true strictly prevents public bypass', async () => {
    const response = await request(app).get('/api/products?admin=true');
    // Public endpoint strictly rejects unauthorized query parameters with 400
    expect(response.status).toBe(400);
  });

  it('GET /api/products/:id returns published product and rejects draft/inactive/archived items (404)', async () => {
    // Published by ID -> 200
    const resPublished = await request(app).get(`/api/products/${publishedProduct._id}`);
    expect(resPublished.status).toBe(200);
    expect(resPublished.body.data._id).toBe(String(publishedProduct._id));

    // Published by Slug -> 200
    const resSlug = await request(app).get(`/api/products/${publishedProduct.slug}`);
    expect(resSlug.status).toBe(200);
    expect(resSlug.body.data._id).toBe(String(publishedProduct._id));

    // Draft -> 404
    const resDraft = await request(app).get(`/api/products/${draftProduct._id}`);
    expect(resDraft.status).toBe(404);

    // Inactive -> 404
    const resInactive = await request(app).get(`/api/products/${inactiveProduct._id}`);
    expect(resInactive.status).toBe(404);

    // Archived -> 404
    const resArchived = await request(app).get(`/api/products/${archivedProduct._id}`);
    expect(resArchived.status).toBe(404);
  });

  it('GET /api/products/top and /recommended return only published items', async () => {
    const [top, rec] = await Promise.all([
      request(app).get('/api/products/top'),
      request(app).get('/api/products/recommended')
    ]);

    expect(top.status).toBe(200);
    expect(rec.status).toBe(200);

    top.body.data.forEach(item => {
      expect(item.isActive).toBe(true);
    });

    rec.body.data.forEach(item => {
      expect(item.isActive).toBe(true);
    });
  });
});
