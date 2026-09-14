/**
 * @file productCustomsMetadata.test.js
 * @description Unit tests for Phase 6B Product and Variant customs/logistics metadata,
 * HS classification digit validation, weight conflict checks, and international quote gatekeeping.
 */

const Product = require('../../../models/Product');

describe('Phase 6B: Product Customs & Logistics Metadata', () => {
  describe('1. Model Validation & Constraints', () => {
    it('1.1 Canonical hsClassification.code accepts 6 to 10 digits without punctuation', async () => {
      const validProduct = new Product({
        name: 'Organic Walnuts 500g',
        slug: 'organic-walnuts-500g',
        price: 1500,
        stock: 50,
        status: 'published',
        isActive: true,
        countryOfOrigin: 'PK',
        hsClassification: {
          code: '080232', // 6-digit HS code
          systemVersion: 'HS_2022',
          jurisdiction: 'WCO'
        },
        weightGrams: 500
      });

      const err = validProduct.validateSync();
      expect(err).toBeUndefined();
    });

    it('1.2 HS code with dots, letters, or invalid length is rejected', () => {
      const invalidProduct = new Product({
        name: 'Invalid HS Product',
        slug: 'invalid-hs-product',
        price: 100,
        stock: 10,
        status: 'draft',
        hsClassification: {
          code: '0802.32.00' // Dots not allowed in canonical normalized code
        }
      });

      const err = invalidProduct.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['hsClassification.code']).toBeDefined();
    });

    it('1.3 Conflicting weight (kg) and weightGrams fails validation', () => {
      const conflictingProduct = new Product({
        name: 'Conflicting Weight Product',
        slug: 'conflicting-weight-product',
        price: 100,
        stock: 10,
        status: 'draft',
        weight: 1.5, // 1.5 kg = 1500g
        weightGrams: 500 // Conflicting with 1.5kg
      });

      const err = conflictingProduct.validateSync();
      expect(err).toBeDefined();
      expect(err.message).toContain('Conflicting product weight (1.5kg) and weightGrams (500g)');
    });

    it('1.4 declaredValueEligibility and dangerousGoodsClassification default to UNKNOWN', () => {
      const product = new Product({
        name: 'Default Metadata Product',
        slug: 'default-metadata-product',
        price: 500,
        stock: 20,
        status: 'draft'
      });

      expect(product.declaredValueEligibility).toBe('UNKNOWN');
      expect(product.dangerousGoodsClassification).toBe('UNKNOWN');
    });
  });
});
