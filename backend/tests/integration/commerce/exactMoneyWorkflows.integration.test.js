'use strict';

const mongoose = require('mongoose');
const Order = require('../../../models/Order');
const Product = require('../../../models/Product');
const Payment = require('../../../models/Payment');
const Refund = require('../../../models/Refund');
const Coupon = require('../../../models/Coupon');
const ShippingZone = require('../../../models/ShippingZone');
const User = require('../../../models/User');
const OrderService = require('../../../services/order/OrderService');
const CouponService = require('../../../services/order/CouponService');
const ProductCatalogService = require('../../../services/product/ProductCatalogService');
const CustomerCommerceService = require('../../../services/CustomerCommerceService');
const MarketService = require('../../../services/MarketService');
const { Money, MoneyMapper, RolloutAuthority, CountryRegistry } = require('../../../modules/commerce');

describe('Exact Money Persistence & Backend Workflows Integration Tests', () => {
  let customerUser;
  let adminUser;
  let testCategory;

  beforeAll(async () => {
    // Ensure default MarketConfig exists
    await MarketService.getConfig();
  });

  beforeEach(async () => {
    customerUser = await User.create({
      fullName: 'Global Customer',
      email: `customer-${Date.now()}@example.com`,
      password: 'StrongPassword123!',
      phone: '03001234567',
      role: 'customer',
      isVerified: true
    });

    adminUser = await User.create({
      fullName: 'System Admin',
      email: `admin-${Date.now()}@example.com`,
      password: 'StrongPassword123!',
      phone: '03007654321',
      role: 'admin',
      isVerified: true
    });

    const Category = require('../../../models/Category');
    testCategory = await Category.create({
      name: 'Dry Fruits',
      slug: `dry-fruits-${Date.now()}`,
      isActive: true
    });
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
    await Coupon.deleteMany({});
    await ShippingZone.deleteMany({});
  });

  describe('Governed Product Mutations & Exact Shadow Fields', () => {
    it('automatically generates exact money shadow fields on product and variants during creation', async () => {
      const product = await ProductCatalogService.createProduct({
        data: {
          name: 'Premium Roasted Cashews',
          category: testCategory._id,
          price: 1500,
          costPrice: 950,
          originalPrice: 1800,
          status: 'published',
          variants: [
            {
              sku: 'CASHEW-500G',
              price: 800,
              salePrice: 750,
              costPrice: 500,
              attributes: [{ name: 'Weight', value: '500g' }]
            },
            {
              sku: 'CASHEW-1KG',
              price: 1500,
              salePrice: 0,
              costPrice: 950,
              attributes: [{ name: 'Weight', value: '1kg' }]
            }
          ]
        },
        userId: adminUser._id
      });

      expect(product.price).toBe(750);
      expect(product.priceExact).toBeDefined();
      expect(product.priceExact.amountMinor.toString()).toBe('75000');
      expect(product.priceExact.currency).toBe('PKR');
      expect(product.priceExact.exponent).toBe(2);

      expect(product.costPriceExact.amountMinor.toString()).toBe('95000');
      expect(product.originalPriceExact.amountMinor.toString()).toBe('80000');

      // Variant shadow fields
      const v500 = product.variants.find((v) => v.sku === 'CASHEW-500G');
      expect(v500.priceExact.amountMinor.toString()).toBe('80000');
      expect(v500.salePriceExact.amountMinor.toString()).toBe('75000');
      expect(v500.costPriceExact.amountMinor.toString()).toBe('50000');
    });
  });

  describe('Order Creation, Exact Price Snapshots & Parity Verification', () => {
    it('creates an order with server-side authoritative exact prices, line totals, and address normalization', async () => {
      const product = await ProductCatalogService.createProduct({
        data: {
          name: 'Organic Walnuts',
          category: testCategory._id,
          price: 1200,
          status: 'published',
          initialStock: 50
        },
        userId: adminUser._id
      });

      const orderData = {
        items: [{ productId: String(product._id), quantity: 2 }],
        shippingAddress: {
          fullName: 'Muhammad Ahmad',
          phone: '03001234567',
          address: 'Main Boulevard, Gulberg III',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'Pakistan'
        },
        paymentMethod: 'cod'
      };

      const result = await OrderService.createOrder({
        userId: customerUser._id,
        orderData,
        idempotencyKey: `ord-exact-test-${Date.now()}`
      });

      expect(result.order).toBeDefined();
      const order = result.order;

      // Legacy fields
      expect(order.subtotal).toBe(2400); // 1200 * 2
      expect(order.shippingCost).toBe(250);
      expect(order.totalAmount).toBe(2650); // 2400 + 250 shipping

      // Exact persistent fields
      expect(order.subtotalExact).toBeDefined();
      expect(order.subtotalExact.amountMinor.toString()).toBe('240000');
      expect(order.subtotalExact.currency).toBe('PKR');
      expect(order.subtotalExact.exponent).toBe(2);

      expect(order.shippingCostExact).toBeDefined();
      expect(order.shippingCostExact.amountMinor.toString()).toBe('25000');

      expect(order.totalAmountExact).toBeDefined();
      expect(order.totalAmountExact.amountMinor.toString()).toBe('265000');

      // Line item exact fields
      expect(order.items[0].unitPriceExact.amountMinor.toString()).toBe('120000');
      expect(order.items[0].lineTotalExact.amountMinor.toString()).toBe('240000');

      // Address normalization
      expect(order.shippingAddress.countryCode).toBe('PK');
      expect(order.shippingAddress.phoneE164).toBe('+923001234567');
      expect(order.shippingAddress.administrativeArea).toBe('Punjab');
    });

    it('rejects coupon application when coupon currency mismatches order currency', async () => {
      const usdCoupon = await Coupon.create({
        code: 'USDONLY10',
        type: 'fixed',
        value: 10,
        currency: 'USD',
        status: 'active',
        startDate: new Date(Date.now() - 10000),
        endDate: new Date(Date.now() + 86400000)
      });

      const product = await ProductCatalogService.createProduct({
        data: {
          name: 'Almond Kernels',
          category: testCategory._id,
          price: 2000,
          status: 'published',
          initialStock: 20
        },
        userId: adminUser._id
      });

      // Attempt to place PKR order with USD coupon
      const orderData = {
        items: [{ productId: String(product._id), quantity: 1 }],
        couponCode: 'USDONLY10',
        currency: 'PKR',
        shippingAddress: {
          fullName: 'Test User',
          phone: '03001234567',
          address: 'Street 1',
          city: 'Lahore',
          province: 'Punjab',
          country: 'Pakistan'
        },
        paymentMethod: 'cod'
      };

      await expect(
        OrderService.createOrder({
          userId: customerUser._id,
          orderData,
          idempotencyKey: `ord-mismatch-${Date.now()}`
        })
      ).rejects.toThrow(/does not match order currency/);
    });
  });

  describe('Customer Address & Phone Value Object Integration', () => {
    it('normalizes international customer address and phone correctly via CustomerCommerceService', async () => {
      // Enable AE in market config
      const config = await MarketService.getConfig();
      config.enabledCountries.push('AE');
      config.enabledCurrencies.push('AED');
      await config.save();

      const address = await CustomerCommerceService.createAddress(customerUser._id, {
        fullName: 'Zayd Al-Mansoor',
        phone: '+971 50 123 4567',
        address: 'Downtown Dubai, Boulevard Plaza',
        city: 'Dubai',
        province: 'Dubai',
        postalCode: '00000',
        country: 'AE',
        isDefault: true
      });

      expect(address.countryCode).toBe('AE');
      expect(address.phoneE164).toBe('+971501234567');
      expect(address.administrativeArea).toBe('Dubai');
      expect(address.isDefault).toBe(true);
    });
  });
});
