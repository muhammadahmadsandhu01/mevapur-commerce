'use strict';

/**
 * @file phase6d1-index-migration.unit.test.js
 * @description Unit tests for Phase 6D-1 guarded index migration script.
 */

const mongoose = require('mongoose');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const Product = require('../../models/Product');
const MigrationState = require('../../models/MigrationState');
const {
  MIGRATION_ID,
  TARGET_INDEXES,
  findIndexMatch,
  inspectPreflightAnomalies,
  runInventory,
  runApply,
  runRollback,
  runVerify
} = require('../../scripts/migrations/phase6d1-create-indexes');

describe('Phase 6D-1 Guarded Index Migration Safety Suite', () => {
  let db;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.AUTH_TEST_DATABASE_URI || 'mongodb://localhost:27017/mevapur-commerce-test';
      await mongoose.connect(mongoUri);
    }
    db = mongoose.connection.db;
  });

  beforeEach(async () => {
    db = mongoose.connection.db;
    await ProductMarketOffering.deleteMany({});
    await MarketPriceBook.deleteMany({});
    await Product.deleteMany({});
    await MigrationState.deleteMany({ migrationId: MIGRATION_ID });

    try {
      await db.collection('productmarketofferings').dropIndexes();
    } catch {
      // Ignore
    }
    try {
      await db.collection('marketpricebooks').dropIndexes();
    } catch {
      // Ignore
    }
  });

  describe('1. Index Specification and Ownership', () => {
    it('defines exact target indexes for offerings and price books', () => {
      expect(TARGET_INDEXES).toBeInstanceOf(Array);
      expect(TARGET_INDEXES.length).toBe(7);

      const names = TARGET_INDEXES.map((t) => t.name);
      expect(names).toContain('merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_version_1');
      expect(names).toContain('merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_status_active_unique');
      expect(names).toContain('merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_version_1');
      expect(names).toContain('merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_status_active_unique');
    });

    it('correctly matches existing index against target spec', () => {
      const target = TARGET_INDEXES[0];
      const existing = [
        {
          name: target.name,
          key: target.key,
          unique: true
        }
      ];

      const match = findIndexMatch(existing, target);
      expect(match.status).toBe('EXACT_MATCH');
    });

    it('detects conflict when index exists with different uniqueness', () => {
      const target = TARGET_INDEXES[0];
      const existing = [
        {
          name: target.name,
          key: target.key,
          unique: false // Conflict: target expects unique: true
        }
      ];

      const match = findIndexMatch(existing, target);
      expect(match.status).toBe('CONFLICT');
    });
  });

  describe('2. Preflight Anomaly Inspection', () => {
    it('passes cleanly when collections are empty', async () => {
      const preflight = await inspectPreflightAnomalies(db);
      expect(preflight.anomalies).toHaveLength(0);
      expect(preflight.unmigratedProductsCount).toBe(0);
    });

    it('detects duplicate offering versions in preflight', async () => {
      try { await db.collection('productmarketofferings').dropIndexes(); } catch {}
      const prodId = new mongoose.Types.ObjectId();
      await db.collection('productmarketofferings').insertMany([
        {
          merchantScopeId: 'default',
          productId: prodId,
          scopeType: 'product',
          scopeKey: 'product',
          marketCountry: 'GB',
          version: 1,
          status: 'superseded'
        },
        {
          merchantScopeId: 'default',
          productId: prodId,
          scopeType: 'product',
          scopeKey: 'product',
          marketCountry: 'GB',
          version: 1, // Duplicate version 1
          status: 'superseded'
        }
      ]);

      const preflight = await inspectPreflightAnomalies(db);
      expect(preflight.anomalies.some((a) => a.type === 'DUPLICATE_OFFERING_VERSION')).toBe(true);
    });

    it('detects multiple active authorities in preflight', async () => {
      try { await db.collection('productmarketofferings').dropIndexes(); } catch {}
      const prodId = new mongoose.Types.ObjectId();
      await db.collection('productmarketofferings').insertMany([
        {
          merchantScopeId: 'default',
          productId: prodId,
          scopeType: 'product',
          scopeKey: 'product',
          marketCountry: 'GB',
          version: 1,
          status: 'active'
        },
        {
          merchantScopeId: 'default',
          productId: prodId,
          scopeType: 'product',
          scopeKey: 'product',
          marketCountry: 'GB',
          version: 2,
          status: 'active' // Duplicate active authority
        }
      ]);

      const preflight = await inspectPreflightAnomalies(db);
      expect(preflight.anomalies.some((a) => a.type === 'MULTIPLE_ACTIVE_OFFERING_AUTHORITIES')).toBe(true);
    });

    it('detects currency exponent mismatches in preflight', async () => {
      const prodId = new mongoose.Types.ObjectId();
      await db.collection('marketpricebooks').insertOne({
        merchantScopeId: 'default',
        productId: prodId,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'GB',
        currency: 'GBP',
        currencyExponent: 3, // GBP is exponent 2 in registry
        amountMinor: '1500',
        version: 1,
        status: 'active'
      });

      const preflight = await inspectPreflightAnomalies(db);
      expect(preflight.anomalies.some((a) => a.type === 'CURRENCY_EXPONENT_MISMATCH')).toBe(true);
    });
  });

  describe('3. Apply, Verify and Rollback Lifecycle', () => {
    it('applies indexes successfully and verifies all exact matches', async () => {
      const applyResult = await runApply(db);
      expect(applyResult.results).toHaveLength(7);
      expect(applyResult.results.every((r) => r.action === 'CREATED')).toBe(true);

      const verifyResult = await runVerify(db);
      expect(verifyResult.allVerified).toBe(true);

      // Idempotent re-apply skips existing
      const reapplyResult = await runApply(db);
      expect(reapplyResult.results.every((r) => r.action === 'SKIPPED_ALREADY_EXISTS')).toBe(true);
    });

    it('rolls back only migration-owned indexes and leaves data intact', async () => {
      await runApply(db);

      const prodId = new mongoose.Types.ObjectId();
      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: prodId,
        marketCountry: 'GB',
        status: 'draft',
        version: 1
      });

      const rollbackResult = await runRollback(db);
      expect(rollbackResult.results.every((r) => r.action === 'DROPPED')).toBe(true);

      // Data preserved
      const remainingOffering = await ProductMarketOffering.findOne({ productId: prodId });
      expect(remainingOffering).not.toBeNull();
      expect(remainingOffering.marketCountry).toBe('GB');
    });
  });
});
