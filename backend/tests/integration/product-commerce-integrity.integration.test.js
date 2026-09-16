const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Category = require('../../models/Category');
const InventoryTransaction = require('../../models/InventoryTransaction');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const InventoryPosition = require('../../models/InventoryPosition');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const { MoneyMapper } = require('../../modules/commerce');
const OrderService = require('../../services/order/OrderService');
const InventoryService = require('../../services/order/InventoryService');
const ProductCatalogService = require('../../services/product/ProductCatalogService');

const seedOfferingAndPrice = async (product, options = {}) => {
  const country = options.marketCountry || 'PK';
  const currency = options.currency || 'PKR';
  const priceNum = options.price !== undefined ? options.price : (product.price || 100);

  await ProductMarketOffering.create({
    merchantScopeId: 'default',
    productId: product._id,
    scopeType: 'product',
    scopeKey: 'product',
    marketCountry: country,
    status: 'active',
    visibility: 'visible',
    fulfillmentMode: 'local',
    effectiveFrom: new Date(Date.now() - 60000),
    lockVersion: 1
  });

  await MarketPriceBook.create({
    merchantScopeId: 'default',
    productId: product._id,
    scopeType: 'product',
    scopeKey: 'product',
    marketCountry: country,
    currency,
    currencyExponent: 2,
    amountMinor: MoneyMapper.fromLegacy(priceNum, currency).amountMinor.toString(),
    priceSource: 'manual',
    status: 'active',
    effectiveFrom: new Date(Date.now() - 60000),
    lockVersion: 1
  });

  if (product.variants && product.variants.length > 0) {
    for (const v of product.variants) {
      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: product._id,
        variantId: v._id,
        sku: v.sku,
        scopeType: 'variant',
        scopeKey: String(v._id),
        marketCountry: country,
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });

      const varPrice = v.salePrice > 0 ? v.salePrice : (v.price || priceNum);
      const compareAtPrice = v.salePrice > 0 && v.price ? v.price : undefined;
      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: product._id,
        variantId: v._id,
        sku: v.sku,
        scopeType: 'variant',
        scopeKey: String(v._id),
        marketCountry: country,
        currency,
        currencyExponent: 2,
        amountMinor: MoneyMapper.fromLegacy(varPrice, currency).amountMinor.toString(),
        compareAtAmountMinor: compareAtPrice ? MoneyMapper.fromLegacy(compareAtPrice, currency).amountMinor.toString() : undefined,
        priceSource: 'manual',
        status: 'active',
        effectiveFrom: new Date(Date.now() - 60000),
        lockVersion: 1
      });
    }
  }
};

describe('Product Commerce Integrity & Checkout Enforcement', () => {
  let prevCompat;
  beforeAll(async () => {
    prevCompat = process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY;
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = 'true';
    await Promise.all([
      Product.syncIndexes(),
      Order.syncIndexes(),
      Category.syncIndexes(),
      InventoryTransaction.syncIndexes(),
      ProductMarketOffering.syncIndexes(),
      MarketPriceBook.syncIndexes()
    ]);
  });

  afterAll(async () => {
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = prevCompat;
  });

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

    await CommerceConfigurationVersion.deleteMany({});
    await CommerceConfigurationVersion.create({
      merchantScopeId: 'default',
      version: Math.floor(Math.random() * 100000) + 1,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE', 'GB', 'US'],
        enabledCurrencies: ['PKR', 'AED', 'GBP', 'USD'],
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        supportedIncoterms: ['DOMESTIC', 'DDP', 'DAP'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [
          {
            originId: 'origin-pk-central',
            name: 'Pakistan Central Warehouse',
            country: 'PK',
            city: 'Karachi',
            timeZone: 'Asia/Karachi',
            enabled: true,
            isDefault: true
          }
        ]
      },
      shippingRules: [
        {
          ruleId: 'GOV-SHIP-PK-STD',
          name: 'Pakistan Domestic Standard',
          serviceCode: 'standard',
          displayName: 'TCS Ground Standard',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
          freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
          remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
          remoteCities: ['Gwadar', 'Skardu'],
          remotePostalPrefixes: ['89100'],
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          weightBands: [
            { minWeightGrams: 0, maxWeightGrams: 1000, rateExact: MoneyMapper.fromLegacy(250, 'PKR'), pricingMode: 'REPLACE_BASE' },
            { minWeightGrams: 1000, maxWeightGrams: 50000, rateExact: MoneyMapper.fromLegacy(100, 'PKR'), pricingMode: 'ADD_TO_BASE' }
          ],
          supportedIncoterms: ['DOMESTIC'],
          priority: 10,
          enabled: true
        }
      ],
      taxRules: []
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
        weightGrams: 500,
        variants: [
          { _id: variant1Id, sku: `HON-500G-${Date.now()}`, attributes: [{ name: 'Size', value: '500g' }], price: 1000, initialStock: 20, isDefault: true, weightGrams: 500 },
          { _id: variant2Id, sku: `HON-1KG-${Date.now()}`, attributes: [{ name: 'Size', value: '1kg' }], price: 1800, initialStock: 15, isDefault: false, weightGrams: 1000 }
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

    const pos2After = await InventoryPosition.findOne({ productId: product._id, variantId: variant2Id });
    expect(pos2After.reserved).toBe(5);
    expect(pos2After.onHand).toBe(15);
    expect(pos2After.calculateATP()).toBe(10);

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

    const pos2Restored = await InventoryPosition.findOne({ productId: product._id, variantId: variant2Id });
    expect(pos2Restored.reserved).toBe(0);
    expect(pos2Restored.onHand).toBe(15);
    expect(pos2Restored.calculateATP()).toBe(15);
  });

  it('rejects order creation for draft, inactive, or archived products (409)', async () => {
    const draft = await ProductCatalogService.createProduct({
      data: {
        name: 'Draft Honey Item',
        status: 'draft',
        weightGrams: 500
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
        weightGrams: 250,
        variants: [
          { _id: variantId, sku: `LTD-HON-${Date.now()}`, attributes: [{ name: 'Size', value: '250g' }], price: 500, initialStock: 2, isDefault: true, weightGrams: 250 }
        ]
      },
      userId: adminUser._id
    });
    await seedOfferingAndPrice(product);

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
        weightGrams: 500,
        images: ['https://example.com/item.webp']
      },
      userId: adminUser._id
    });
    await seedOfferingAndPrice(product, { price: 2500 });

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
        weightGrams: 500,
        variants: [
          { _id: variantId, sku: `HIST-VAR-${Date.now()}`, attributes: [{ name: 'Size', value: 'S' }], price: 500, initialStock: 10, isDefault: true, weightGrams: 500 }
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
        weightGrams: 500,
        variants: [
          { _id: varRegId, sku: `VAR-REG-${Date.now()}`, attributes: [{ name: 'Type', value: 'Regular' }], price: 1200, initialStock: 10, isDefault: true, weightGrams: 500 },
          { _id: varSaleId, sku: `VAR-SALE-${Date.now()}`, attributes: [{ name: 'Type', value: 'Discounted' }], price: 1500, salePrice: 950, initialStock: 10, isDefault: false, weightGrams: 500 }
        ]
      },
      userId: adminUser._id
    });
    await seedOfferingAndPrice(product);

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
