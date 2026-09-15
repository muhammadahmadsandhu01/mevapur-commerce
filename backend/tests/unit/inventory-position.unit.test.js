/**
 * @file inventory-position.unit.test.js
 * @description Unit tests for InventoryPosition model, ATP calculation formulas,
 * safety stock protection, unavailable inventory isolation, and backorder boundaries.
 */

const mongoose = require('mongoose');
const InventoryPosition = require('../../models/InventoryPosition');

describe('Phase 6D-2: InventoryPosition Unit Tests', () => {
  const dummyLocationId = new mongoose.Types.ObjectId();
  const dummyProductId = new mongoose.Types.ObjectId();
  const dummyVariantId = new mongoose.Types.ObjectId();

  describe('ATP Authoritative Calculation', () => {
    it('calculates ATP strictly as onHand - reserved - unavailable - safetyStock', () => {
      const position = new InventoryPosition({
        merchantScopeId: 'default',
        locationId: dummyLocationId,
        locationCode: 'WH-LHE-01',
        productId: dummyProductId,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: 'MEVA-ALM-500G',
        onHand: 100,
        reserved: 20,
        unavailable: 10,
        safetyStock: 15,
        reorderPoint: 25
      });

      // ATP = 100 - 20 - 10 - 15 = 55
      expect(position.calculateATP()).toBe(55);
      expect(position.atp).toBe(55);
    });

    it('clamps ATP to zero when reservations and safety stock exceed onHand', () => {
      const position = new InventoryPosition({
        merchantScopeId: 'default',
        locationId: dummyLocationId,
        locationCode: 'WH-LHE-01',
        productId: dummyProductId,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: 'MEVA-ALM-500G',
        onHand: 30,
        reserved: 25,
        unavailable: 5,
        safetyStock: 10
      });

      // 30 - 25 - 5 - 10 = -10 -> clamped to 0
      expect(position.calculateATP()).toBe(0);
      expect(position.atp).toBe(0);
    });

    it('factors backorderLimit into ATP when allowBackorder is explicitly enabled', () => {
      const position = new InventoryPosition({
        merchantScopeId: 'default',
        locationId: dummyLocationId,
        locationCode: 'WH-LHE-01',
        productId: dummyProductId,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: 'MEVA-ALM-500G',
        onHand: 10,
        reserved: 10,
        unavailable: 0,
        safetyStock: 5,
        allowBackorder: true,
        backorderLimit: 20
      });

      // Base = 10 - 10 - 0 - 5 = -5; with backorderLimit 20 -> -5 + 20 = 15
      expect(position.calculateATP()).toBe(15);
    });

    it('enforces non-negative integer bounds and rejects floating-point quantities', () => {
      const position = new InventoryPosition({
        merchantScopeId: 'default',
        locationId: dummyLocationId,
        locationCode: 'WH-LHE-01',
        productId: dummyProductId,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: 'MEVA-ALM-500G',
        onHand: 12.5 // Invalid float
      });

      const err = position.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['onHand']).toBeDefined();
    });

    it('rejects negative stock counters', () => {
      const position = new InventoryPosition({
        merchantScopeId: 'default',
        locationId: dummyLocationId,
        locationCode: 'WH-LHE-01',
        productId: dummyProductId,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: 'MEVA-ALM-500G',
        onHand: -5
      });

      const err = position.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['onHand']).toBeDefined();
    });

    it('correctly validates variant-level scopeType and sets scopeKey to variantId', () => {
      const position = new InventoryPosition({
        merchantScopeId: 'default',
        locationId: dummyLocationId,
        locationCode: 'WH-LHE-01',
        productId: dummyProductId,
        variantId: dummyVariantId,
        scopeType: 'variant',
        canonicalSku: 'MEVA-ALM-VAR-1KG',
        onHand: 50
      });

      const err = position.validateSync();
      expect(err).toBeUndefined();
      expect(position.scopeKey).toBe(String(dummyVariantId));
    });
  });
});
