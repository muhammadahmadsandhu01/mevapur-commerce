const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Category = require('../../models/Category');
const OrderService = require('../../services/order/OrderService');
const InventoryService = require('../../services/order/InventoryService');
const ProductCatalogService = require('../../services/product/ProductCatalogService');

describe('Product Commerce Integrity & Checkout Enforcement', () => {
  let customerUser;
  let adminUser;
  let testCategory;

  beforeEach(async () => {
    customerUser = await global.createTestUser({
      email: `cust-${Date.now()}@example.test`,
      role: 'customer'
    });
    adminUser = await global.createTestUser({
      email: `adm-${Date.now()}@example.test`,
      role: 'admin'
    });

    testCategory = await Category.create({
      name: `Integrity Cat ${Date.now()}`,
      slug: `cat-integ-${Date.now()}`
    });
  });

  it('synchronizes variant stock and root stock upon order reservation and cancellation restore', async () => {
    const variant1Id = new mongoose.Types.ObjectId();
    const variant2Id = new mongoose.Types.ObjectId();

    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'Multi-Variant Honey',
        description: 'Pure raw honey.',
        category: testCategory._id,
        status: 'published',
        images: ['https://example.com/honey.webp'],
        variants: [
          { _id: variant1Id, sku: 'HON-500G', attributes: [{ name: 'Size', value: '500g' }], price: 1000, initialStock: 20, isDefault: true },
          { _id: variant2Id, sku: 'HON-1KG', attributes: [{ name: 'Size', value: '1kg' }], price: 1800, initialStock: 15, isDefault: false }
        ]
      },
      userId: adminUser._id
    });

    expect(product.stock).toBe(35); // 20 + 15

    const orderId = `ORD-TEST-${Date.now()}`;
    const orderObjectId = new mongoose.Types.ObjectId();

    // 1. Reserve 5 units of non-default variant HON-1KG
    await InventoryService.reserve([
      {
        product: product._id,
        variantId: variant2Id,
        isDefaultVariant: false,
        name: product.name,
        quantity: 5,
        sku: 'HON-1KG'
      }
    ], {
      orderId,
      orderObjectId,
      userId: customerUser._id
    });

    const productAfterSale = await Product.findById(product._id);
    const var2After = productAfterSale.variants.id(variant2Id);
    expect(var2After.stock).toBe(10); // 15 - 5
    expect(productAfterSale.stock).toBe(30); // 35 - 5 (Synchronized root stock!)

    // 2. Restore cancelled order
    await InventoryService.restore({
      _id: orderObjectId,
      orderId,
      items: [
        {
          product: product._id,
          variantId: variant2Id,
          isDefaultVariant: false,
          quantity: 5
        }
      ]
    }, {
      userId: adminUser._id
    });

    const productAfterRestore = await Product.findById(product._id);
    expect(productAfterRestore.variants.id(variant2Id).stock).toBe(15);
    expect(productAfterRestore.stock).toBe(35);
  });

  it('rejects order creation for draft, inactive, or archived products (409)', async () => {
    const draft = await ProductCatalogService.createProduct({
      data: {
        name: 'Draft Honey',
        status: 'draft'
      },
      userId: adminUser._id
    });

    const orderPayload = {
      items: [{ productId: draft._id.toString(), quantity: 1 }],
      shippingAddress: { fullName: 'Test', addressLine1: 'Road 1', city: 'Lahore', country: 'PK', phone: '03001234567' },
      paymentMethod: 'cod'
    };

    await expect(OrderService.createOrder({
      userId: customerUser._id,
      orderData: orderPayload
    })).rejects.toThrow('A selected product is unavailable');
  });

  it('prevents removing a variant that has historical order reference (409)', async () => {
    const variantId = new mongoose.Types.ObjectId();
    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'Variant Reference Product',
        description: 'Description here',
        category: testCategory._id,
        status: 'published',
        images: ['https://example.com/variant.webp'],
        variants: [
          { _id: variantId, sku: 'HIST-VAR-1', attributes: [{ name: 'Size', value: 'S' }], price: 500, initialStock: 10, isDefault: true }
        ]
      },
      userId: adminUser._id
    });

    // Create order referencing this variant
    await Order.create({
      orderId: `ORD-${Date.now()}`,
      user: customerUser._id,
      items: [{
        product: product._id,
        variantId,
        name: product.name,
        sku: 'HIST-VAR-1',
        price: 500,
        quantity: 1,
        lineTotal: 500
      }],
      subtotal: 500,
      totalAmount: 500,
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      status: 'Pending',
      shippingAddress: {
        fullName: 'User',
        address: 'Street 1',
        province: 'Punjab',
        city: 'Lahore',
        country: 'PK',
        phone: '03001234567'
      },
      requestHash: crypto.randomBytes(32).toString('hex'),
      idempotencyKey: crypto.randomUUID(),
      statusTimeline: [
        {
          status: 'Pending',
          actor: customerUser._id,
          actorRole: 'customer',
          timestamp: new Date()
        }
      ]
    });

    // Attempt to update product and remove variant
    await expect(ProductCatalogService.updateProduct({
      id: product._id,
      data: {
        variants: [] // Attempting to remove variant!
      },
      userId: adminUser._id
    })).rejects.toThrow('A product variant referenced by an order cannot be removed');
  });
});
