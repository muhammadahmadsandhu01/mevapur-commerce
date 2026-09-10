const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Order = require('../../models/Order');
const { ORDER_STATUSES } = require('../../constants/orderConstants');
const { PAYMENT_STATUSES } = require('../../constants/paymentConstants');

describe('DEF-04: Enterprise Category Identity & Product/SKU Resolution Integration Tests', () => {
  let activeCategory1;
  let activeCategory2;
  let inactiveCategory;
  let adminUser;
  let productCat1A;
  let productCat1B;
  let productCat2;
  let draftProductCat1;
  let inactiveProductCat1;
  let archivedItem;

  beforeEach(async () => {
    adminUser = await global.createTestUser({
      email: `admin-cat-${Date.now()}-${Math.random()}@example.test`,
      role: 'admin'
    });

    activeCategory1 = await Category.create({
      name: 'Dry Fruits & Nuts',
      slug: 'dry-fruits-nuts',
      description: 'Premium quality dry fruits.',
      isActive: true,
      displayOrder: 1
    });

    activeCategory2 = await Category.create({
      name: 'Organic Honey',
      slug: 'organic-honey',
      description: 'Pure wild mountain honey.',
      isActive: true,
      displayOrder: 2
    });

    inactiveCategory = await Category.create({
      name: 'Seasonal Special Archived',
      slug: 'seasonal-special-archived',
      description: 'Archived category not visible to public.',
      isActive: false,
      displayOrder: 99
    });

    // 1. Published active products in Category 1
    productCat1A = await Product.create({
      name: 'Premium Almonds 500g',
      slug: 'premium-almonds-500g',
      description: 'Crisp Californian almonds.',
      category: activeCategory1._id,
      status: 'published',
      isActive: true,
      price: 1500,
      originalPrice: 1600,
      stock: 50,
      images: ['https://example.com/almonds.webp']
    });

    productCat1B = await Product.create({
      name: 'Roasted Cashews 250g',
      slug: 'roasted-cashews-250g',
      description: 'Salted roasted whole cashews.',
      category: activeCategory1._id,
      status: 'published',
      isActive: true,
      price: 950,
      originalPrice: 1000,
      stock: 30,
      images: ['https://example.com/cashews.webp']
    });

    // 2. Published active product in Category 2
    productCat2 = await Product.create({
      name: 'Wild Sidr Honey 1kg',
      slug: 'wild-sidr-honey-1kg',
      description: 'Pure organic mountain Sidr honey.',
      category: activeCategory2._id,
      status: 'published',
      isActive: true,
      price: 3200,
      originalPrice: 3500,
      stock: 25,
      images: ['https://example.com/honey.webp']
    });

    // 3. Draft product in Category 1 (must remain hidden from public)
    draftProductCat1 = await Product.create({
      name: 'Draft Walnuts 500g',
      slug: 'draft-walnuts-500g',
      description: 'Unpublished draft walnuts.',
      category: activeCategory1._id,
      status: 'draft',
      isActive: false,
      price: 1200,
      stock: 10
    });

    // 4. Inactive product in Category 1 (must remain hidden from public)
    inactiveProductCat1 = await Product.create({
      name: 'Inactive Pistachios 250g',
      slug: 'inactive-pistachios-250g',
      description: 'Discontinued pistachios.',
      category: activeCategory1._id,
      status: 'inactive',
      isActive: false,
      price: 1400,
      stock: 0
    });

    // 5. Product in Inactive Category
    archivedItem = await Product.create({
      name: 'Archived Seasonal Item',
      slug: 'archived-seasonal-item',
      description: 'Belongs to inactive category.',
      category: inactiveCategory._id,
      status: 'published',
      isActive: true,
      price: 500,
      stock: 10
    });
  });

  describe('Part A: Public Product Listing Category Filtering (Tests 1 - 18)', () => {
    it('1. Existing ObjectId returns only products from that category', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1._id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      const ids = res.body.data.map(p => p._id.toString());
      expect(ids).toContain(productCat1A._id.toString());
      expect(ids).toContain(productCat1B._id.toString());
      expect(ids).not.toContain(productCat2._id.toString());
    });

    it('2. Existing slug returns the same eligible product set', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      const ids = res.body.data.map(p => p._id.toString());
      expect(ids).toContain(productCat1A._id.toString());
      expect(ids).toContain(productCat1B._id.toString());
      expect(ids).not.toContain(productCat2._id.toString());
    });

    it('3. ObjectId and slug resolution are semantically equivalent', async () => {
      const [resId, resSlug] = await Promise.all([
        request(app).get(`/api/products?category=${activeCategory2._id}`),
        request(app).get(`/api/products?category=${activeCategory2.slug}`)
      ]);

      expect(resId.status).toBe(200);
      expect(resSlug.status).toBe(200);
      expect(resId.body.data.length).toBe(1);
      expect(resSlug.body.data.length).toBe(1);
      expect(resId.body.data[0]._id.toString()).toBe(resSlug.body.data[0]._id.toString());
      expect(resId.body.data[0].slug).toBe('wild-sidr-honey-1kg');
    });

    it('4. Leading/trailing whitespace follows locked normalization behavior', async () => {
      const res = await request(app).get(`/api/products?category=%20${activeCategory1.slug}%20`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('5. Unknown slug never returns the unfiltered catalog (fail-closed)', async () => {
      const res = await request(app).get('/api/products?category=completely-unknown-category');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it('6. Malformed identifier does not crash or produce CastError', async () => {
      const res = await request(app).get('/api/products?category=invalid-cat-!@#$');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('COMMERCIAL_CORE_VALIDATION_FAILED');
    });

    it('7. Inactive category does not expose products to the public', async () => {
      const resSlug = await request(app).get(`/api/products?category=${inactiveCategory.slug}`);
      expect(resSlug.status).toBe(200);
      expect(resSlug.body.data).toEqual([]);
      expect(resSlug.body.pagination.total).toBe(0);

      const resId = await request(app).get(`/api/products?category=${inactiveCategory._id}`);
      expect(resId.status).toBe(200);
      expect(resId.body.data).toEqual([]);
      expect(resId.body.pagination.total).toBe(0);
    });

    it('8. Draft/unpublished products remain hidden under category filter', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}`);
      const slugs = res.body.data.map(p => p.slug);
      expect(slugs).not.toContain(draftProductCat1.slug);
    });

    it('9. Inactive products remain hidden under category filter', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}`);
      const slugs = res.body.data.map(p => p.slug);
      expect(slugs).not.toContain(inactiveProductCat1.slug);
    });

    it('10. Search remains compatible with category filtering', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}&keyword=Almonds`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].slug).toBe(productCat1A.slug);

      // Search for keyword not in Category 1
      const resEmpty = await request(app).get(`/api/products?category=${activeCategory1.slug}&keyword=Honey`);
      expect(resEmpty.status).toBe(200);
      expect(resEmpty.body.data.length).toBe(0);
    });

    it('11. Sorting remains compatible with category filtering', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}&sortBy=price-asc`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].price).toBe(950); // Cashews
      expect(res.body.data[1].price).toBe(1500); // Almonds
    });

    it('12. Pagination and totals remain correct under category filter', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}&page=1&limit=1`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.pages).toBe(2);
      expect(res.body.pagination.hasNext).toBe(true);
    });

    it('13. Price filtering remains compatible with category filtering', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}&minPrice=1000`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].slug).toBe(productCat1A.slug);
    });

    it('14. Operator-shaped input cannot bypass the category restriction', async () => {
      const res = await request(app).get('/api/products?category[$ne]=1');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('15. Array/object category inputs are rejected safely', async () => {
      const res = await request(app).get('/api/products?category[]=dry-fruits&category[]=honey');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('16. Oversized values are rejected safely', async () => {
      const oversized = 'a'.repeat(250);
      const res = await request(app).get(`/api/products?category=${oversized}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('17. A nonexistent valid ObjectId produces no unrelated products', async () => {
      const randomObjectId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/products?category=${randomObjectId}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it('18. No category parameter preserves existing unfiltered published-catalog behavior', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(4); // Almonds, Cashews, Honey, and Archived Seasonal Item (published)
      const slugs = res.body.data.map(p => p.slug);
      expect(slugs).toContain(productCat1A.slug);
      expect(slugs).toContain(productCat1B.slug);
      expect(slugs).toContain(productCat2.slug);
      expect(slugs).toContain(archivedItem.slug);
    });
  });

  describe('Part B: Category Detail Endpoint Resolution (Tests 19 - 26)', () => {
    it('19. Valid ObjectId succeeds in GET /api/categories/:id', async () => {
      const res = await request(app).get(`/api/categories/${activeCategory1._id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(activeCategory1._id.toString());
      expect(res.body.data.slug).toBe(activeCategory1.slug);
    });

    it('20. Valid slug succeeds in GET /api/categories/:id without CastError', async () => {
      const res = await request(app).get(`/api/categories/${activeCategory1.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(activeCategory1._id.toString());
      expect(res.body.data.name).toBe(activeCategory1.name);
    });

    it('21. Both ObjectId and slug resolve to the same category entity', async () => {
      const [resId, resSlug] = await Promise.all([
        request(app).get(`/api/categories/${activeCategory2._id}`),
        request(app).get(`/api/categories/${activeCategory2.slug}`)
      ]);

      expect(resId.status).toBe(200);
      expect(resSlug.status).toBe(200);
      expect(resId.body.data._id.toString()).toBe(resSlug.body.data._id.toString());
      expect(resId.body.data.name).toBe('Organic Honey');
    });

    it('22. Unknown slug returns truthful 404 response', async () => {
      const res = await request(app).get('/api/categories/nonexistent-category-slug');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Category not found');
    });

    it('23. Invalid non-ObjectId string cannot cause CastError (returns 404)', async () => {
      const res = await request(app).get('/api/categories/12345nonobjectid');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Category not found');
    });

    it('24. Nonexistent valid hexadecimal ObjectId returns 404', async () => {
      const nonExistent = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/categories/${nonExistent}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Category not found');
    });

    it('25. Operator-shaped input cannot produce query injection', async () => {
      const res = await request(app).get('/api/categories/$where');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('26. Inactive category returns category details if requested directly by ID/slug', async () => {
      const res = await request(app).get(`/api/categories/${inactiveCategory.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });
  });

  describe('Part C: Regression and Immutability Locks (Tests 27 - 31)', () => {
    it('27. Existing product detail behavior remains unchanged', async () => {
      const res = await request(app).get(`/api/products/${productCat1A.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Premium Almonds 500g');
      expect(res.body.data.price).toBe(1500);
      expect(res.body.data.category.name).toBe('Dry Fruits & Nuts');
      expect(res.body.data.category.slug).toBe('dry-fruits-nuts');
    });

    it('28. Product price/variant data remains unaffected by category filtering', async () => {
      const res = await request(app).get(`/api/products?category=${activeCategory1.slug}`);
      const almond = res.body.data.find(p => p.slug === productCat1A.slug);
      expect(almond.price).toBe(1500);
      expect(almond.originalPrice).toBe(1600);
      expect(almond.stock).toBe(50);
    });

    it('29. Product stock fields are not mutated by read operations', async () => {
      const stockBefore = (await Product.findById(productCat1A._id)).stock;
      await request(app).get(`/api/products?category=${activeCategory1.slug}`);
      await request(app).get(`/api/products/${productCat1A.slug}`);
      const stockAfter = (await Product.findById(productCat1A._id)).stock;
      expect(stockAfter).toBe(stockBefore);
    });

    it('30. Historical order-line references remain unaffected', async () => {
      const order = await Order.create({
        orderId: `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        user: adminUser._id,
        idempotencyKey: crypto.randomBytes(16).toString('hex'),
        requestHash: crypto.randomBytes(32).toString('hex'),
        items: [{
          product: productCat1A._id,
          name: productCat1A.name,
          sku: productCat1A.sku || 'ALM-500G',
          price: productCat1A.price,
          quantity: 2,
          lineTotal: productCat1A.price * 2,
          image: 'https://example.com/almonds.webp'
        }],
        shippingAddress: {
          fullName: 'Test Customer',
          phone: '+923001234567',
          address: '123 Main St',
          city: 'Lahore',
          province: 'Punjab',
          country: 'Pakistan',
          postalCode: '54000'
        },
        paymentMethod: 'cod',
        subtotal: 3000,
        shippingFee: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 3000,
        paymentStatus: PAYMENT_STATUSES.PENDING,
        orderStatus: ORDER_STATUSES.PENDING,
        statusTimeline: [{
          status: ORDER_STATUSES.PENDING,
          actor: adminUser._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const fetchedOrder = await Order.findById(order._id);
      expect(fetchedOrder.items[0].product.toString()).toBe(productCat1A._id.toString());
      expect(fetchedOrder.items[0].name).toBe('Premium Almonds 500g');
    });

    it('31. Existing admin product/category contracts remain compatible', async () => {
      const categories = await Category.find({}).sort({ displayOrder: 1 }).lean();
      expect(categories.length).toBe(3);
      expect(categories[0]._id).toBeDefined();
      expect(categories[0].slug).toBeDefined();
    });
  });
});
