const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Category = require('../../models/Category');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Session = require('../../models/Session');
const InventoryTransaction = require('../../models/InventoryTransaction');
const Wishlist = require('../../models/Wishlist');
const Coupon = require('../../models/Coupon');
const { searchPublicProducts, getPublicProductDetails } = require('../../modules/assistant/tools/assistantReadTools');
const CouponService = require('../../services/order/CouponService');
const { CANONICAL_ROLES } = require('../../constants/roleConstants');
const ERROR_CODES = require('../../constants/errorCodes');

let sequence = 0;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `def27-user-${sequence}-${Date.now()}@example.test`,
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

describe('DEF-27: Category-Based Product Visibility Inheritance Integration Suite', () => {
  let customerAuth;
  let adminAuth;

  let activeParentCategory;
  let activeSubCategory;
  let inactiveParentCategory;
  let inactiveSubCategory;
  let orphanedChildCategory;

  let visibleProduct;
  let inactiveCatProduct;
  let inactiveSubCatProduct;
  let inactiveAncestorProduct;
  let draftProduct;
  let inactiveStatusProduct;
  let unassignedCategoryProduct;

  beforeEach(async () => {
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await InventoryTransaction.deleteMany({});
    await Wishlist.deleteMany({});
    await Coupon.deleteMany({});

    customerAuth = await createAuth(CANONICAL_ROLES.CUSTOMER);
    adminAuth = await createAuth(CANONICAL_ROLES.ADMIN);

    // 1. Setup Categories
    activeParentCategory = await Category.create({
      name: 'Dry Fruits',
      slug: 'dry-fruits',
      description: 'Active Top Level Dry Fruits',
      isActive: true,
      displayOrder: 1
    });

    activeSubCategory = await Category.create({
      name: 'Almonds',
      slug: 'almonds',
      parentId: activeParentCategory._id,
      description: 'Active Subcategory Almonds',
      isActive: true,
      displayOrder: 2
    });

    inactiveParentCategory = await Category.create({
      name: 'Seasonal Exotics',
      slug: 'seasonal-exotics',
      description: 'Inactive Top Level Category',
      isActive: false,
      displayOrder: 3
    });

    inactiveSubCategory = await Category.create({
      name: 'Exotic Berries',
      slug: 'exotic-berries',
      parentId: activeParentCategory._id,
      description: 'Inactive Subcategory under Active Parent',
      isActive: false,
      displayOrder: 4
    });

    orphanedChildCategory = await Category.create({
      name: 'Rare Saffron',
      slug: 'rare-saffron',
      parentId: inactiveParentCategory._id,
      description: 'Active Subcategory under Inactive Ancestor',
      isActive: true,
      displayOrder: 5
    });

    // 2. Setup Products
    visibleProduct = await Product.create({
      name: 'Premium California Almonds',
      slug: 'premium-california-almonds',
      sku: 'ALM-PREM-001',
      category: activeParentCategory._id,
      subcategory: activeSubCategory._id,
      price: 1500,
      stock: 50,
      status: 'published',
      isActive: true,
      isFeatured: true,
      rating: 4.8,
      reviewCount: 12,
      soldCount: 45
    });

    inactiveCatProduct = await Product.create({
      name: 'Wild Exotic Berries Pack',
      slug: 'wild-exotic-berries-pack',
      sku: 'EXO-BER-001',
      category: inactiveParentCategory._id,
      price: 2500,
      description: 'Wild exotic berries rich in antioxidants',
      images: ['https://example.com/berries.jpg'],
      stock: 20,
      status: 'published',
      isActive: true,
      isFeatured: true,
      rating: 4.5,
      reviewCount: 5,
      soldCount: 10
    });

    inactiveSubCatProduct = await Product.create({
      name: 'Kashmiri Dried Berries',
      slug: 'kashmiri-dried-berries',
      sku: 'KASH-BER-002',
      category: activeParentCategory._id,
      subcategory: inactiveSubCategory._id,
      price: 1800,
      stock: 30,
      status: 'published',
      isActive: true
    });

    inactiveAncestorProduct = await Product.create({
      name: 'Royal Saffron Strands',
      slug: 'royal-saffron-strands',
      sku: 'SAF-ROYAL-003',
      category: orphanedChildCategory._id,
      price: 3500,
      stock: 15,
      status: 'published',
      isActive: true
    });

    draftProduct = await Product.create({
      name: 'Draft Walnut Kernels',
      slug: 'draft-walnut-kernels',
      sku: 'WAL-DRF-004',
      category: activeParentCategory._id,
      price: 1200,
      stock: 40,
      status: 'draft',
      isActive: false
    });

    inactiveStatusProduct = await Product.create({
      name: 'Inactive Pine Nuts',
      slug: 'inactive-pine-nuts',
      sku: 'PIN-INA-005',
      category: activeParentCategory._id,
      price: 2800,
      stock: 25,
      status: 'inactive',
      isActive: false
    });

    unassignedCategoryProduct = await Product.create({
      name: 'Mystery Product Without Category',
      slug: 'mystery-product-no-cat',
      sku: 'MYS-NOCAT-006',
      category: null,
      price: 999,
      stock: 10,
      status: 'published',
      isActive: true
    });
  });

  // Minimum Test 1: Active/published product with active category is publicly visible
  it('1. should return active/published product with active category in public list', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).toContain(visibleProduct.slug);
  });

  // Minimum Test 2: Inactive product remains hidden
  it('2. should exclude inactive product from public list', async () => {
    const res = await request(app).get('/api/products');
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(inactiveStatusProduct.slug);
  });

  // Minimum Test 3: Draft/unpublished product remains hidden
  it('3. should exclude draft product from public list', async () => {
    const res = await request(app).get('/api/products');
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(draftProduct.slug);
  });

  // Minimum Test 4: Active product with inactive primary category is hidden from public list
  it('4. should exclude active product with inactive primary category from public list', async () => {
    const res = await request(app).get('/api/products');
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(inactiveCatProduct.slug);
  });

  // Minimum Test 5: Same product returns truthful 404 by public ID
  it('5. should return 404 by ID for active product with inactive category', async () => {
    const res = await request(app).get(`/api/products/${inactiveCatProduct._id}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Product not found');
  });

  // Minimum Test 6: Same product returns truthful 404 by public slug
  it('6. should return 404 by slug for active product with inactive category', async () => {
    const res = await request(app).get(`/api/products/${inactiveCatProduct.slug}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Product not found');
  });

  // Minimum Test 7: Search excludes it
  it('7. should exclude inactive-category products from search', async () => {
    const res = await request(app).get('/api/products?keyword=Exotic');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(inactiveCatProduct.slug);
  });

  // Minimum Test 8: Autocomplete excludes it
  it('8. should exclude inactive-category products from autocomplete search', async () => {
    const res = await request(app).get('/api/products?autocomplete=true&keyword=Exotic');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(inactiveCatProduct.slug);
  });

  // Minimum Test 9: Featured/trending/recommended/recently-viewed feeds exclude it
  it('9. should exclude inactive-category products from top, recommended, and recently-viewed feeds', async () => {
    const topRes = await request(app).get('/api/products/top');
    expect(topRes.status).toBe(200);
    expect(topRes.body.data.map((p) => p.slug)).not.toContain(inactiveCatProduct.slug);

    const recRes = await request(app).get('/api/products/recommended');
    expect(recRes.status).toBe(200);
    expect(recRes.body.data.map((p) => p.slug)).not.toContain(inactiveCatProduct.slug);

    const recentRes = await request(app).get(`/api/products/recently-viewed?ids=${visibleProduct._id},${inactiveCatProduct._id}`);
    expect(recentRes.status).toBe(200);
    const recentSlugs = recentRes.body.data.map((p) => p.slug);
    expect(recentSlugs).toContain(visibleProduct.slug);
    expect(recentSlugs).not.toContain(inactiveCatProduct.slug);
  });

  // Minimum Test 10: Category-filtered counts and pagination exclude it
  it('10. should fail-closed and return 0 count when filtering by inactive category', async () => {
    const res = await request(app).get(`/api/products?category=${inactiveParentCategory.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  // Minimum Test 11: Missing/deleted category reference fails closed
  it('11. should exclude products with unassigned, missing, or deleted category from public list', async () => {
    const res = await request(app).get('/api/products');
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(unassignedCategoryProduct.slug);

    const detailRes = await request(app).get(`/api/products/${unassignedCategoryProduct._id}`);
    expect(detailRes.status).toBe(404);
  });

  // Minimum Test 12: Inactive optional subcategory hides product
  it('12. should exclude product if its assigned subcategory is inactive', async () => {
    const res = await request(app).get('/api/products');
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(inactiveSubCatProduct.slug);

    const detailRes = await request(app).get(`/api/products/${inactiveSubCatProduct.slug}`);
    expect(detailRes.status).toBe(404);
  });

  // Minimum Test 13: Deleted optional subcategory fails closed
  it('13. should exclude product if its assigned subcategory reference is deleted from database', async () => {
    const deletedSubCatId = new mongoose.Types.ObjectId();
    const productWithDeletedSub = await Product.create({
      name: 'Product With Ghost Subcategory',
      slug: 'prod-ghost-sub',
      sku: 'GHOST-SUB-001',
      category: activeParentCategory._id,
      subcategory: deletedSubCatId,
      price: 1000,
      stock: 10,
      status: 'published',
      isActive: true
    });

    const res = await request(app).get('/api/products');
    expect(res.body.data.map((p) => p.slug)).not.toContain(productWithDeletedSub.slug);

    const detailRes = await request(app).get(`/api/products/${productWithDeletedSub.slug}`);
    expect(detailRes.status).toBe(404);
  });

  // Minimum Test 14: Inactive ancestor hides product
  it('14. should exclude product if any category ancestor in the hierarchy is inactive', async () => {
    const res = await request(app).get('/api/products');
    const slugs = res.body.data.map((p) => p.slug);
    expect(slugs).not.toContain(inactiveAncestorProduct.slug);

    const detailRes = await request(app).get(`/api/products/${inactiveAncestorProduct.slug}`);
    expect(detailRes.status).toBe(404);
  });

  // Minimum Test 15: Reactivating category restores independently eligible product without modifying Product
  it('15. should automatically restore product visibility upon category reactivation with zero Product writes', async () => {
    const initialProductDoc = await Product.findById(inactiveCatProduct._id).lean();

    // Reactivate category
    await Category.findByIdAndUpdate(inactiveParentCategory._id, { isActive: true });

    // Now product should immediately be publicly visible
    const res = await request(app).get('/api/products');
    expect(res.body.data.map((p) => p.slug)).toContain(inactiveCatProduct.slug);

    const detailRes = await request(app).get(`/api/products/${inactiveCatProduct.slug}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.slug).toBe(inactiveCatProduct.slug);

    // Verify Product document was not mutated
    const productAfter = await Product.findById(inactiveCatProduct._id).lean();
    expect(productAfter.updatedAt).toEqual(initialProductDoc.updatedAt);
    expect(productAfter.__v).toBe(initialProductDoc.__v);
  });

  // Minimum Test 16: Category deactivate/reactivate does not change product status, SKU, price or stock
  it('16. should preserve product status, SKU, price, and stock when category is toggled', async () => {
    await Category.findByIdAndUpdate(activeParentCategory._id, { isActive: false });
    let p = await Product.findById(visibleProduct._id);
    expect(p.status).toBe('published');
    expect(p.isActive).toBe(true);
    expect(p.sku).toBe('ALM-PREM-001');
    expect(p.price).toBe(1500);
    expect(p.stock).toBe(50);

    await Category.findByIdAndUpdate(activeParentCategory._id, { isActive: true });
    p = await Product.findById(visibleProduct._id);
    expect(p.status).toBe('published');
    expect(p.isActive).toBe(true);
    expect(p.stock).toBe(50);
  });

  // Minimum Test 17: No InventoryTransaction is produced by category visibility changes
  it('17. should create zero InventoryTransaction records when categories change visibility', async () => {
    const txCountBefore = await InventoryTransaction.countDocuments();

    await Category.findByIdAndUpdate(activeParentCategory._id, { isActive: false });
    await Category.findByIdAndUpdate(activeParentCategory._id, { isActive: true });

    const txCountAfter = await InventoryTransaction.countDocuments();
    expect(txCountAfter).toBe(txCountBefore);
  });

  // Minimum Test 18-22: Stale cart product rejected during checkout & Atomic Checkout Safety
  it('18-22. should reject checkout atomically when cart contains inactive-category product, creating zero order/payments/stock decrements', async () => {
    const payload = {
      items: [
        { productId: visibleProduct._id.toString(), quantity: 2 },
        { productId: inactiveCatProduct._id.toString(), quantity: 1 }
      ],
      shippingAddress: {
        fullName: 'Stale Cart Customer',
        phone: '03001234567',
        address: '12 Test Street',
        city: 'Lahore',
        province: 'Punjab',
        country: 'Pakistan'
      },
      paymentMethod: 'cod'
    };

    const initialStockVisible = visibleProduct.stock;
    const initialStockInactive = inactiveCatProduct.stock;

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', customerAuth.token)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(payload);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE);

    // Verify zero orders created
    const orderCount = await Order.countDocuments();
    expect(orderCount).toBe(0);

    // Verify zero stock changes
    const visibleAfter = await Product.findById(visibleProduct._id);
    const inactiveAfter = await Product.findById(inactiveCatProduct._id);
    expect(visibleAfter.stock).toBe(initialStockVisible);
    expect(inactiveAfter.stock).toBe(initialStockInactive);

    // Verify zero inventory transactions
    const txCount = await InventoryTransaction.countDocuments();
    expect(txCount).toBe(0);
  });

  // Minimum Test 23: Admin can still list and inspect the product
  it('23. should allow Admin to list and inspect products regardless of category active status', async () => {
    const listRes = await request(app)
      .get('/api/admin/products')
      .set('Authorization', adminAuth.token);

    expect(listRes.status).toBe(200);
    const adminSlugs = listRes.body.data.map((p) => p.slug);
    expect(adminSlugs).toContain(inactiveCatProduct.slug);
    expect(adminSlugs).toContain(visibleProduct.slug);
    expect(adminSlugs).toContain(draftProduct.slug);

    const detailRes = await request(app)
      .get(`/api/admin/products/${inactiveCatProduct._id}`)
      .set('Authorization', adminAuth.token);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.product.slug).toBe(inactiveCatProduct.slug);
  });

  // Minimum Test 24: Admin can retain the current inactive category during edit
  it('24. should allow Admin to edit product and retain its current inactive category', async () => {
    const updateRes = await request(app)
      .put(`/api/admin/products/${inactiveCatProduct._id}`)
      .set('Authorization', adminAuth.token)
      .send({
        description: 'Updated description while retaining inactive category',
        category: inactiveParentCategory._id.toString(),
        expectedVersion: inactiveCatProduct.__v
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.product.description).toBe('Updated description while retaining inactive category');
  });

  // Minimum Test 25-27: Historical workflows (Orders, Invoices, Tracking, Returns) preserved
  it('25-27. should preserve historical order, invoice, and tracking data when product category becomes inactive', async () => {
    // 1. Create a historical order with visibleProduct
    const order = await Order.create({
      orderId: 'ORD-HIST-001',
      user: customerAuth.user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.createHash('sha256').update('ORD-HIST-001').digest('hex'),
      items: [{
        product: visibleProduct._id,
        name: visibleProduct.name,
        sku: visibleProduct.sku,
        price: visibleProduct.price,
        quantity: 2,
        lineTotal: visibleProduct.price * 2,
        image: ''
      }],
      shippingAddress: {
        fullName: 'Historical Customer',
        phone: '03001234567',
        address: '100 Heritage Road',
        city: 'Lahore',
        province: 'Punjab',
        country: 'Pakistan'
      },
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      payment: { provider: 'Cash on Delivery', currency: 'PKR', paidAt: null },
      subtotal: 3000,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 3000,
      orderStatus: 'Delivered',
      deliveredAt: new Date(),
      statusTimeline: [{
        status: 'Delivered',
        actor: customerAuth.user._id,
        actorRole: 'customer',
        timestamp: new Date(),
        note: 'Delivered historical order'
      }]
    });

    // 2. Now deactivate the product's category
    await Category.findByIdAndUpdate(activeParentCategory._id, { isActive: false });

    // 3. Customer order list still returns the historical order
    const ordersRes = await request(app)
      .get('/api/orders/my-orders')
      .set('Authorization', customerAuth.token);
    expect(ordersRes.status).toBe(200);
    expect(ordersRes.body.data.orders.map((o) => o.orderId)).toContain('ORD-HIST-001');

    // 4. Customer invoice lookup returns truthful snapshot
    const invoiceRes = await request(app)
      .get(`/api/account/orders/${order._id}/invoice`)
      .set('Authorization', customerAuth.token);
    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.body.data.invoice.items[0].sku).toBe('ALM-PREM-001');
    expect(invoiceRes.body.data.invoice.total).toBe(3000);

    // 5. Tracking endpoint works
    const trackingRes = await request(app)
      .get(`/api/account/orders/${order._id}/tracking`)
      .set('Authorization', customerAuth.token);
    expect(trackingRes.status).toBe(200);
    expect(trackingRes.body.data.tracking.orderStatus).toBe('Delivered');
  });

  // Minimum Test 28: Unknown or malformed public identifiers remain injection-safe
  it('28. should handle malformed or injection public parameters safely and fail-closed', async () => {
    const res1 = await request(app).get('/api/products/%24ne');
    expect([400, 404]).toContain(res1.status);

    const res2 = await request(app).get('/api/products?category[$ne]=null');
    expect([400, 422]).toContain(res2.status);
  });

  // Minimum Test 29: Assistant tools exclude inactive categories
  it('29. should exclude products with inactive categories in assistant tools', async () => {
    const searchResults = await searchPublicProducts({ query: 'Exotic Berries' });
    expect(searchResults).toEqual([]);

    const productDetails = await getPublicProductDetails({ productId: inactiveCatProduct._id });
    expect(productDetails).toBeNull();

    const validDetails = await getPublicProductDetails({ productId: visibleProduct._id });
    expect(validDetails).not.toBeNull();
    expect(validDetails.slug).toBe(visibleProduct.slug);
  });

  // Minimum Test 30: Wishlist and Coupon preview enforce category product visibility inheritance
  it('30. should enforce category visibility in Wishlist and Coupon preview', async () => {
    // Setup active coupon
    await Coupon.create({
      code: 'TESTCOUPON',
      type: 'fixed',
      value: 100,
      minOrderAmount: 0,
      status: 'active',
      isActive: true,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000)
    });

    // Cannot add inactive category product to wishlist
    const addRes = await request(app)
      .post(`/api/account/wishlist/${inactiveCatProduct._id}`)
      .set('Authorization', customerAuth.token);
    expect(addRes.status).toBe(404);

    // Can add active category product
    const addValidRes = await request(app)
      .post(`/api/account/wishlist/${visibleProduct._id}`)
      .set('Authorization', customerAuth.token);
    expect(addValidRes.status).toBe(201);

    // Coupon preview with inactive-category product fails
    await expect(CouponService.preview({
      code: 'TESTCOUPON',
      items: [{ productId: inactiveCatProduct._id.toString(), quantity: 1 }]
    })).rejects.toThrow('Product not available');
  });
});
