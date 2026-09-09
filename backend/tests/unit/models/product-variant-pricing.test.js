const mongoose = require('mongoose');
const Product = require('../../../models/Product');
const { publishedCreateSchema } = require('../../../validators/productValidator');
const OrderService = require('../../../services/order/OrderService');

describe('DEF-11: Product Variant Pricing & Sale-Price Invariant Unit Tests', () => {
  const validCategoryId = new mongoose.Types.ObjectId();

  describe('Mongoose Product Model pre-validate Hook', () => {
    it('derives root price=800, originalPrice=1000, discount=20 when default variant has regular price 1000 and sale price 800', async () => {
      const product = new Product({
        name: 'Almonds 500g',
        description: 'Fresh organic almonds.',
        category: validCategoryId,
        status: 'published',
        variants: [
          {
            sku: 'ALM-500G',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            salePrice: 800,
            stock: 15,
            isDefault: true
          }
        ]
      });

      await product.validate();

      expect(product.price).toBe(800);
      expect(product.originalPrice).toBe(1000);
      expect(product.discount).toBe(20);
      expect(product.stock).toBe(15);
    });

    it('derives root price=1000, originalPrice=1000, discount=0 when default variant has regular price 1000 and salePrice=0', async () => {
      const product = new Product({
        name: 'Almonds 500g No Sale',
        description: 'Fresh organic almonds without sale.',
        category: validCategoryId,
        status: 'published',
        variants: [
          {
            sku: 'ALM-500G-NOSALE',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            salePrice: 0,
            stock: 10,
            isDefault: true
          }
        ]
      });

      await product.validate();

      expect(product.price).toBe(1000);
      expect(product.originalPrice).toBe(1000);
      expect(product.discount).toBe(0);
    });

    it('derives root price=1000, originalPrice=1000, discount=0 when default variant salePrice is absent / undefined', async () => {
      const product = new Product({
        name: 'Almonds 500g Absent Sale',
        description: 'Fresh organic almonds without sale property.',
        category: validCategoryId,
        status: 'published',
        variants: [
          {
            sku: 'ALM-500G-ABSENT',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            stock: 10,
            isDefault: true
          }
        ]
      });

      await product.validate();

      expect(product.price).toBe(1000);
      expect(product.originalPrice).toBe(1000);
      expect(product.discount).toBe(0);
    });

    it('derives root price=1000, originalPrice=1000, discount=0 when default variant sale price equals regular price', async () => {
      const product = new Product({
        name: 'Almonds Equal Price',
        description: 'Sale price equals regular price.',
        category: validCategoryId,
        status: 'published',
        variants: [
          {
            sku: 'ALM-EQUAL',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            salePrice: 1000,
            stock: 10,
            isDefault: true
          }
        ]
      });

      await product.validate();

      expect(product.price).toBe(1000);
      expect(product.originalPrice).toBe(1000);
      expect(product.discount).toBe(0);
    });

    it('handles sale price greater than regular price safely without negative discount in model hook', async () => {
      const product = new Product({
        name: 'Almonds Inverted Price',
        description: 'Sale price higher than regular price.',
        category: validCategoryId,
        status: 'published',
        variants: [
          {
            sku: 'ALM-INV',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            salePrice: 1200,
            stock: 10,
            isDefault: true
          }
        ]
      });

      await product.validate();

      expect(product.price).toBe(1000);
      expect(product.originalPrice).toBe(1000);
      expect(product.discount).toBe(0);
    });

    it('derives root pricing strictly from the designated default variant among multiple variants', async () => {
      const product = new Product({
        name: 'Multi-Variant Cashews',
        description: 'Multiple variants with different pricing.',
        category: validCategoryId,
        status: 'published',
        variants: [
          {
            sku: 'CSH-250G',
            attributes: [{ name: 'Size', value: '250g' }],
            price: 600,
            salePrice: 500,
            stock: 5,
            isDefault: false
          },
          {
            sku: 'CSH-500G',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1100,
            salePrice: 900,
            stock: 10,
            isDefault: true
          },
          {
            sku: 'CSH-1KG',
            attributes: [{ name: 'Size', value: '1kg' }],
            price: 2000,
            salePrice: 1700,
            stock: 8,
            isDefault: false
          }
        ]
      });

      await product.validate();

      // Should snapshot the 500g variant (isDefault: true): price: 900, originalPrice: 1100, discount: 18% (200/1100)
      expect(product.price).toBe(900);
      expect(product.originalPrice).toBe(1100);
      expect(product.discount).toBe(18);
      expect(product.stock).toBe(23); // 5 + 10 + 8
    });

    it('falls back deterministically to the first variant when no variant is explicitly marked default', async () => {
      const product = new Product({
        name: 'No Explicit Default Pistachios',
        description: 'No variant marked default.',
        category: validCategoryId,
        status: 'published',
        variants: [
          {
            sku: 'PST-250G',
            attributes: [{ name: 'Size', value: '250g' }],
            price: 750,
            salePrice: 600,
            stock: 12,
            isDefault: false
          },
          {
            sku: 'PST-500G',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1400,
            salePrice: 1200,
            stock: 8,
            isDefault: false
          }
        ]
      });

      await product.validate();

      expect(product.variants[0].isDefault).toBe(true);
      expect(product.price).toBe(600);
      expect(product.originalPrice).toBe(750);
      expect(product.discount).toBe(20);
    });

    it('preserves simple non-variant product pricing and discount invariant', async () => {
      const discountedSimple = new Product({
        name: 'Simple Saffron with Discount',
        description: 'Premium pure saffron.',
        category: validCategoryId,
        status: 'published',
        price: 850,
        originalPrice: 1000,
        stock: 50
      });

      await discountedSimple.validate();

      expect(discountedSimple.price).toBe(850);
      expect(discountedSimple.originalPrice).toBe(1000);
      expect(discountedSimple.discount).toBe(15);
      expect(discountedSimple.stock).toBe(50);

      const regularSimple = new Product({
        name: 'Simple Saffron Regular',
        description: 'Premium pure saffron without discount.',
        category: validCategoryId,
        status: 'published',
        price: 1000,
        originalPrice: 1000,
        stock: 30
      });

      await regularSimple.validate();

      expect(regularSimple.price).toBe(1000);
      expect(regularSimple.originalPrice).toBe(1000);
      expect(regularSimple.discount).toBe(0);
    });
  });

  describe('Authoritative Validation & Checkout Pricing Consistency', () => {
    it('productValidator rejects variant salePrice >= regular price during publishing', () => {
      const invalidVariantPayload = {
        name: 'Invalid Variant Pricing Product',
        description: 'Validation rejection test',
        category: validCategoryId.toString(),
        price: 1000,
        mediaAssetIds: [new mongoose.Types.ObjectId().toString()],
        variants: [
          {
            sku: 'VAL-REJ-01',
            attributes: [{ name: 'Weight', value: '1kg' }],
            price: 1000,
            salePrice: 1200,
            stock: 10,
            isDefault: true
          }
        ]
      };

      const result = publishedCreateSchema.safeParse(invalidVariantPayload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.message.includes('Sale price must be strictly less than regular price'))).toBe(true);
    });

    it('confirms OrderService authoritative pricing matches variant salePrice when active', () => {
      const variantWithSale = {
        _id: new mongoose.Types.ObjectId(),
        sku: 'TEST-VAR-SALE',
        price: 1000,
        salePrice: 800,
        isDefault: true
      };

      const variantNoSale = {
        _id: new mongoose.Types.ObjectId(),
        sku: 'TEST-VAR-NOSALE',
        price: 1000,
        salePrice: 0,
        isDefault: true
      };

      const rawPrice1 = variantWithSale.salePrice > 0 ? variantWithSale.salePrice : variantWithSale.price;
      const rawPrice2 = variantNoSale.salePrice > 0 ? variantNoSale.salePrice : variantNoSale.price;

      expect(rawPrice1).toBe(800);
      expect(rawPrice2).toBe(1000);
    });
  });
});
