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
      email: `cust-${Date.now()}-${Math.random()}@example.test`,
      role: 'customer'
    });
    adminUser = await global.createTestUser({
      email: `adm-${Date.now()}-${Math.random()}@example.test`,
      role: 'admin'
    });

    testCategory = await Category.create({
      name: `Integrity Cat ${Date.now()}`,
      slug: `cat-integ-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
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
          { _id: variant1Id, sku: `HON-500G-${Date.now()}`, attributes: [{ name: 'Size', value: '500g' }], price: 1000, initialStock: 20, isDefault: true },
          { _id: variant2Id, sku: `HON-1KG-${Date.now()}`, attributes: [{ name: 'Size', value: '1kg' }], price: 1800, initialStock: 15, isDefault: false }
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
        sku: product.variants[1].sku
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
        name: 'Draft Honey Item',
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

  it('rejects order creation when requested variant quantity exceeds stock (409)', async () => {
    const variantId = new mongoose.Types.ObjectId();
    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'Limited Stock Honey',
        description: 'Rare honey batch.',
        category: testCategory._id,
        status: 'published',
        images: ['https://example.com/honey.webp'],
        variants: [
          { _id: variantId, sku: `LTD-HON-${Date.now()}`, attributes: [{ name: 'Size', value: '250g' }], price: 500, initialStock: 2, isDefault: true }
        ]
      },
      userId: adminUser._id
    });

    const orderPayload = {
      items: [{ productId: product._id.toString(), variantId: variantId.toString(), quantity: 10 }], // requesting 10 but stock is 2
      shippingAddress: { fullName: 'Test', address: 'Road 1', province: 'Punjab', city: 'Lahore', country: 'PK', phone: '03001234567' },
      paymentMethod: 'cod'
    };

    await expect(OrderService.createOrder({
      userId: customerUser._id,
      orderData: orderPayload,
      idempotencyKey: crypto.randomUUID()
    })).rejects.toThrow('Insufficient stock');
  });

  it('resolves authoritative product price and ignores client-supplied spoofed price', async () => {
    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'Authoritative Price Item',
        description: 'Product with set price.',
        category: testCategory._id,
        price: 2500,
        initialStock: 10,
        status: 'published',
        images: ['https://example.com/item.webp']
      },
      userId: adminUser._id
    });

    const orderPayload = {
      items: [{ productId: product._id.toString(), price: 1, quantity: 1 }], // client attempts to spoof price as Rs.1
      shippingAddress: { fullName: 'Test', address: 'Road 1', province: 'Punjab', city: 'Lahore', country: 'PK', phone: '03001234567' },
      paymentMethod: 'cod'
    };

    const result = await OrderService.createOrder({
      userId: customerUser._id,
      orderData: orderPayload,
      idempotencyKey: crypto.randomUUID()
    });

    const order = result.order || result;
    expect(order.subtotal).toBe(2500); // Authoritative Rs.2500 applied!
    expect(order.items[0].price).toBe(2500);
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
          { _id: variantId, sku: `HIST-VAR-${Date.now()}`, attributes: [{ name: 'Size', value: 'S' }], price: 500, initialStock: 10, isDefault: true }
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
        sku: product.variants[0].sku,
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

  it('resolves authoritative variant salePrice and regular price, rejecting spoofed variant prices', async () => {
    const varRegId = new mongoose.Types.ObjectId();
    const varSaleId = new mongoose.Types.ObjectId();

    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'Multi-Priced Variant Product',
        description: 'Product with regular and sale variants.',
        category: testCategory._id,
        price: 9999, // Root dummy price
        status: 'published',
        images: ['https://example.com/item.webp'],
        variants: [
          { _id: varRegId, sku: `VAR-REG-${Date.now()}`, attributes: [{ name: 'Type', value: 'Regular' }], price: 1200, initialStock: 10, isDefault: true },
          { _id: varSaleId, sku: `VAR-SALE-${Date.now()}`, attributes: [{ name: 'Type', value: 'Discounted' }], price: 1500, salePrice: 950, initialStock: 10, isDefault: false }
        ]
      },
      userId: adminUser._id
    });

    // 1. Order regular variant with client spoofed price
    const order1 = await OrderService.createOrder({
      userId: customerUser._id,
      orderData: {
        items: [{ productId: product._id.toString(), variantId: varRegId.toString(), price: 5, quantity: 2 }],
        shippingAddress: { fullName: 'Test', address: 'Road 1', province: 'Punjab', city: 'Lahore', country: 'PK', phone: '03001234567' },
        paymentMethod: 'cod'
      },
      idempotencyKey: crypto.randomUUID()
    });

    const resOrder1 = order1.order || order1;
    expect(resOrder1.items[0].price).toBe(1200); // Authoritative regular price applied!
    expect(resOrder1.items[0].lineTotal).toBe(2400);

    // 2. Order sale variant with client spoofed price
    const order2 = await OrderService.createOrder({
      userId: customerUser._id,
      orderData: {
        items: [{ productId: product._id.toString(), variantId: varSaleId.toString(), price: 10, quantity: 1 }],
        shippingAddress: { fullName: 'Test', address: 'Road 1', province: 'Punjab', city: 'Lahore', country: 'PK', phone: '03001234567' },
        paymentMethod: 'cod'
      },
      idempotencyKey: crypto.randomUUID()
    });

    const resOrder2 = order2.order || order2;
    expect(resOrder2.items[0].price).toBe(950); // Authoritative salePrice applied!
    expect(resOrder2.items[0].lineTotal).toBe(950);
  });
});
