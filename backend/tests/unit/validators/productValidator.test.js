const mongoose = require('mongoose');
const {
  draftCreateSchema,
  publishedCreateSchema,
  productUpdateSchema,
  validateMergedPublishedState
} = require('../../../validators/productValidator');

describe('Product Validators Unit Tests', () => {
  const validCategoryId = new mongoose.Types.ObjectId().toString();

  describe('draftCreateSchema', () => {
    it('accepts a minimal draft with only a name', () => {
      const result = draftCreateSchema.safeParse({
        name: 'Minimal Draft Product'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Minimal Draft Product');
        expect(result.data.status).toBe('draft');
        expect(result.data.initialStock).toBe(0);
      }
    });

    it('rejects client-supplied isActive on draft creation', () => {
      const result = draftCreateSchema.safeParse({
        name: 'Invalid Draft',
        isActive: true
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('isActive is a derived system field');
    });

    it('rejects client-supplied stock on draft creation', () => {
      const result = draftCreateSchema.safeParse({
        name: 'Invalid Stock Draft',
        stock: 50
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Direct stock edits are prohibited');
    });
  });

  describe('publishedCreateSchema', () => {
    it('requires name, description, category, and price for simple product publication', () => {
      const validMediaId = new mongoose.Types.ObjectId().toString();
      const result = publishedCreateSchema.safeParse({
        name: 'Published Organic Almonds',
        description: 'Premium quality organic almonds.',
        category: validCategoryId,
        price: 1500,
        originalPrice: 1800,
        mediaAssetIds: [validMediaId],
        initialStock: 25
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('published');
        expect(result.data.price).toBe(1500);
      }
    });

    it('rejects zero or negative price for published simple product', () => {
      const validMediaId = new mongoose.Types.ObjectId().toString();
      const result = publishedCreateSchema.safeParse({
        name: 'Zero Price Product',
        description: 'Description here',
        category: validCategoryId,
        price: 0,
        mediaAssetIds: [validMediaId]
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.message.includes('Price must be strictly greater than zero'))).toBe(true);
    });

    it('rejects published product with 0 media assets', () => {
      const result = publishedCreateSchema.safeParse({
        name: 'No Media Product',
        description: 'Description here',
        category: validCategoryId,
        price: 1000,
        mediaAssetIds: []
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.message.includes('At least one product image is required'))).toBe(true);
    });

    it('rejects duplicate normalized variant attributes in a product', () => {
      const validMediaId = new mongoose.Types.ObjectId().toString();
      const result = publishedCreateSchema.safeParse({
        name: 'Variable Almonds',
        description: 'Description here',
        category: validCategoryId,
        price: 1000,
        mediaAssetIds: [validMediaId],
        variants: [
          {
            sku: 'ALM-500G',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            stock: 10,
            isDefault: true
          },
          {
            sku: 'ALM-500G-DUP',
            attributes: [{ name: 'size ', value: ' 500G' }], // Normalized duplicate!
            price: 1000,
            stock: 10,
            isDefault: false
          }
        ]
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.message.includes('Duplicate variant attribute combination'))).toBe(true);
    });

    it('rejects duplicate variant SKUs inside one product', () => {
      const validMediaId = new mongoose.Types.ObjectId().toString();
      const result = publishedCreateSchema.safeParse({
        name: 'Variable Almonds',
        description: 'Description here',
        category: validCategoryId,
        price: 1000,
        mediaAssetIds: [validMediaId],
        variants: [
          {
            sku: 'ALM-VAR-1',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            stock: 10,
            isDefault: true
          },
          {
            sku: 'alm-var-1', // Same SKU in lowercase
            attributes: [{ name: 'Size', value: '1kg' }],
            price: 1900,
            stock: 10,
            isDefault: false
          }
        ]
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.message.includes('Duplicate variant SKU'))).toBe(true);
    });

    it('rejects variant salePrice that is greater than or equal to regular price', () => {
      const validMediaId = new mongoose.Types.ObjectId().toString();
      const result = publishedCreateSchema.safeParse({
        name: 'Variable Almonds',
        description: 'Description here',
        category: validCategoryId,
        price: 1000,
        mediaAssetIds: [validMediaId],
        variants: [
          {
            sku: 'ALM-VAR-1',
            attributes: [{ name: 'Size', value: '500g' }],
            price: 1000,
            salePrice: 1200, // Invalid: salePrice >= price
            stock: 10,
            isDefault: true
          }
        ]
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.message.includes('Sale price must be strictly less than regular price'))).toBe(true);
    });
  });

  describe('productUpdateSchema (PATCH)', () => {
    it('allows partial updates without injecting default values for omitted fields', () => {
      const result = productUpdateSchema.safeParse({
        name: 'Updated Product Name',
        expectedVersion: 3
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Product Name');
        expect(result.data.expectedVersion).toBe(3);
        // Omitted fields should be undefined, not defaults!
        expect(result.data.price).toBeUndefined();
        expect(result.data.description).toBeUndefined();
        expect(result.data.category).toBeUndefined();
      }
    });

    it('rejects client-supplied isActive on update', () => {
      const result = productUpdateSchema.safeParse({
        isActive: false
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('isActive is a derived system field');
    });
  });

  describe('validateMergedPublishedState', () => {
    it('validates a complete merged product state for publication', () => {
      const validMediaId = new mongoose.Types.ObjectId();
      const merged = {
        name: 'Persisted Almonds',
        description: 'Fresh organic almonds.',
        category: new mongoose.Types.ObjectId(),
        price: 1200,
        mediaAssetIds: [validMediaId],
        status: 'published'
      };

      const errors = validateMergedPublishedState(merged);
      expect(errors).toHaveLength(0);
    });

    it('flags missing category or description in merged state', () => {
      const merged = {
        name: 'Incomplete Almonds',
        description: '',
        category: null,
        price: 1200,
        mediaAssetIds: [],
        status: 'published'
      };

      const errors = validateMergedPublishedState(merged);
      expect(errors.length).toBeGreaterThanOrEqual(3);
      expect(errors.some(e => e.field === 'description')).toBe(true);
      expect(errors.some(e => e.field === 'category')).toBe(true);
      expect(errors.some(e => e.field === 'mediaAssetIds')).toBe(true);
    });
  });
});
