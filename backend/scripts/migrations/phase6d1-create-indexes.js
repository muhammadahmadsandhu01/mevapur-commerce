#!/usr/bin/env node
'use strict';

/**
 * @file phase6d1-create-indexes.js
 * @description Guarded, idempotent index and invariant migration for Phase 6D-1 Product Offerings & Price Books.
 *
 * Supported modes:
 *   --inventory : Read-only evaluation and status breakdown.
 *   --dry-run   : Read-only simulation of index creations (default).
 *   --apply     : Bounded creation of scoped unique and query indexes.
 *   --verify    : Read-only verification scan.
 *   --finalize  : Separately authorized write of MigrationState completion evidence.
 *   --rollback  : Idempotent rollback of migration-owned indexes only (no data deleted).
 */

const mongoose = require('mongoose');
const MigrationState = require('../../models/MigrationState');
const { CurrencyRegistry } = require('../../modules/commerce');
const {
  MigrationGuardError,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../lib/migrationRuntimeGuard');

const MIGRATION_ID = 'phase6d1-create-indexes';

const ALLOWED_MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--finalize', '--rollback'];
const ALLOWED_FLAGS = [
  '--confirm-phase6d1-apply',
  '--confirm-phase6d1-finalize',
  '--confirm-phase6d1-rollback',
  '--confirm-production',
  '--allow-local'
];

const REQUIRED_CONFIRMATION_MAP = {
  apply: {
    staging: ['--confirm-phase6d1-apply'],
    production: ['--confirm-phase6d1-apply', '--confirm-production'],
    local: ['--confirm-phase6d1-apply']
  },
  finalize: {
    staging: ['--confirm-phase6d1-finalize'],
    production: ['--confirm-phase6d1-finalize', '--confirm-production'],
    local: ['--confirm-phase6d1-finalize']
  },
  rollback: {
    staging: ['--confirm-phase6d1-rollback'],
    production: ['--confirm-phase6d1-rollback', '--confirm-production'],
    local: ['--confirm-phase6d1-rollback']
  }
};

const TARGET_INDEXES = [
  // ProductMarketOffering indexes
  {
    modelName: 'ProductMarketOffering',
    collectionName: 'productmarketofferings',
    key: {
      merchantScopeId: 1,
      productId: 1,
      scopeType: 1,
      scopeKey: 1,
      marketCountry: 1,
      version: 1
    },
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_version_1',
    options: {
      unique: true,
      name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_version_1'
    }
  },
  {
    modelName: 'ProductMarketOffering',
    collectionName: 'productmarketofferings',
    key: {
      merchantScopeId: 1,
      productId: 1,
      scopeType: 1,
      scopeKey: 1,
      marketCountry: 1
    },
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_status_active_unique',
    options: {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_status_active_unique'
    }
  },
  {
    modelName: 'ProductMarketOffering',
    collectionName: 'productmarketofferings',
    key: {
      merchantScopeId: 1,
      marketCountry: 1,
      status: 1,
      visibility: 1,
      effectiveFrom: 1,
      effectiveTo: 1
    },
    name: 'merchantScopeId_1_marketCountry_1_status_1_visibility_1_effectiveFrom_1_effectiveTo_1',
    options: {
      name: 'merchantScopeId_1_marketCountry_1_status_1_visibility_1_effectiveFrom_1_effectiveTo_1'
    }
  },
  {
    modelName: 'ProductMarketOffering',
    collectionName: 'productmarketofferings',
    key: {
      merchantScopeId: 1,
      productId: 1,
      marketCountry: 1,
      status: 1
    },
    name: 'merchantScopeId_1_productId_1_marketCountry_1_status_1',
    options: {
      name: 'merchantScopeId_1_productId_1_marketCountry_1_status_1'
    }
  },

  // MarketPriceBook indexes
  {
    modelName: 'MarketPriceBook',
    collectionName: 'marketpricebooks',
    key: {
      merchantScopeId: 1,
      productId: 1,
      scopeType: 1,
      scopeKey: 1,
      marketCountry: 1,
      currency: 1,
      version: 1
    },
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_version_1',
    options: {
      unique: true,
      name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_version_1'
    }
  },
  {
    modelName: 'MarketPriceBook',
    collectionName: 'marketpricebooks',
    key: {
      merchantScopeId: 1,
      productId: 1,
      scopeType: 1,
      scopeKey: 1,
      marketCountry: 1,
      currency: 1
    },
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_status_active_unique',
    options: {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_status_active_unique'
    }
  },
  {
    modelName: 'MarketPriceBook',
    collectionName: 'marketpricebooks',
    key: {
      merchantScopeId: 1,
      marketCountry: 1,
      currency: 1,
      status: 1,
      effectiveFrom: 1,
      effectiveTo: 1
    },
    name: 'merchantScopeId_1_marketCountry_1_currency_1_status_1_effectiveFrom_1_effectiveTo_1',
    options: {
      name: 'merchantScopeId_1_marketCountry_1_currency_1_status_1_effectiveFrom_1_effectiveTo_1'
    }
  }
];

function findIndexMatch(existingIndexes, target) {
  const targetKeyStr = JSON.stringify(target.key);
  const targetUnique = Boolean(target.options.unique);
  const targetPartial = JSON.stringify(target.options.partialFilterExpression || null);

  for (const idx of existingIndexes) {
    const idxKeyStr = JSON.stringify(idx.key);
    const idxUnique = Boolean(idx.unique);
    const idxPartial = JSON.stringify(idx.partialFilterExpression || null);

    if (idxKeyStr === targetKeyStr) {
      if (idxUnique === targetUnique && idxPartial === targetPartial) {
        return {
          status: idx.name === target.name ? 'EXACT_MATCH' : 'EQUIVALENT_DIFFERENT_NAME',
          existingIndex: idx
        };
      }
      if (idx.name === target.name) {
        return {
          status: 'CONFLICT',
          existingIndex: idx,
          reason: `Key matches but options differ (Unique: ${idxUnique} vs ${targetUnique}, Partial: ${idxPartial} vs ${targetPartial})`
        };
      }
    }
    if (idx.name === target.name) {
      return {
        status: 'CONFLICT',
        existingIndex: idx,
        reason: `Index name '${target.name}' exists with different key: ${idxKeyStr}`
      };
    }
  }

  return { status: 'MISSING', existingIndex: null };
}

async function inspectPreflightAnomalies(db) {
  const anomalies = [];

  // 1. Check duplicate immutable version keys for Offerings
  const offeringColl = db.collection('productmarketofferings');
  const offeringDups = await offeringColl.aggregate([
    {
      $group: {
        _id: {
          merchantScopeId: '$merchantScopeId',
          productId: '$productId',
          scopeType: '$scopeType',
          scopeKey: '$scopeKey',
          marketCountry: '$marketCountry',
          version: '$version'
        },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (offeringDups.length > 0) {
    anomalies.push({
      type: 'DUPLICATE_OFFERING_VERSION',
      count: offeringDups.length,
      samples: offeringDups.slice(0, 5)
    });
  }

  // 2. Check multiple active authorities for Offerings
  const activeOfferingDups = await offeringColl.aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: {
          merchantScopeId: '$merchantScopeId',
          productId: '$productId',
          scopeType: '$scopeType',
          scopeKey: '$scopeKey',
          marketCountry: '$marketCountry'
        },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (activeOfferingDups.length > 0) {
    anomalies.push({
      type: 'MULTIPLE_ACTIVE_OFFERING_AUTHORITIES',
      count: activeOfferingDups.length,
      samples: activeOfferingDups.slice(0, 5)
    });
  }

  // 3. Check duplicate immutable version keys for Prices
  const priceColl = db.collection('marketpricebooks');
  const priceDups = await priceColl.aggregate([
    {
      $group: {
        _id: {
          merchantScopeId: '$merchantScopeId',
          productId: '$productId',
          scopeType: '$scopeType',
          scopeKey: '$scopeKey',
          marketCountry: '$marketCountry',
          currency: '$currency',
          version: '$version'
        },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (priceDups.length > 0) {
    anomalies.push({
      type: 'DUPLICATE_PRICE_VERSION',
      count: priceDups.length,
      samples: priceDups.slice(0, 5)
    });
  }

  // 4. Check multiple active authorities for Prices
  const activePriceDups = await priceColl.aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: {
          merchantScopeId: '$merchantScopeId',
          productId: '$productId',
          scopeType: '$scopeType',
          scopeKey: '$scopeKey',
          marketCountry: '$marketCountry',
          currency: '$currency'
        },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (activePriceDups.length > 0) {
    anomalies.push({
      type: 'MULTIPLE_ACTIVE_PRICE_AUTHORITIES',
      count: activePriceDups.length,
      samples: activePriceDups.slice(0, 5)
    });
  }

  // 5. Inspect invalid currency / exponent pairs
  const prices = await priceColl.find({}, { projection: { currency: 1, currencyExponent: 1 } }).limit(500).toArray();
  for (const p of prices) {
    if (p.currency) {
      if (!CurrencyRegistry.has(p.currency)) {
        anomalies.push({ type: 'UNKNOWN_CURRENCY', id: p._id, currency: p.currency });
      } else {
        const meta = CurrencyRegistry.get(p.currency, { allowNonCommercial: true });
        if (p.currencyExponent !== undefined && p.currencyExponent !== meta.exponent) {
          anomalies.push({
            type: 'CURRENCY_EXPONENT_MISMATCH',
            id: p._id,
            currency: p.currency,
            found: p.currencyExponent,
            expected: meta.exponent
          });
        }
      }
    }
  }

  // 6. Check unmigrated products lacking offerings
  const productColl = db.collection('products');
  const publishedProductsCount = await productColl.countDocuments({ status: 'published', isActive: true });
  const distinctProductOfferings = await offeringColl.distinct('productId', { status: 'active' });
  const unmigratedCount = Math.max(0, publishedProductsCount - distinctProductOfferings.length);

  return {
    anomalies,
    publishedProductsCount,
    activeOfferingProductsCount: distinctProductOfferings.length,
    unmigratedProductsCount: unmigratedCount
  };
}

async function runInventory(db) {
  const inventory = [];
  for (const target of TARGET_INDEXES) {
    const coll = db.collection(target.collectionName);
    let existingIndexes = [];
    try {
      existingIndexes = await coll.indexes();
    } catch {
      // Collection may not exist yet
    }
    const match = findIndexMatch(existingIndexes, target);
    inventory.push({ target: target.name, collection: target.collectionName, status: match.status });
  }

  const preflight = await inspectPreflightAnomalies(db);
  return { inventory, preflight };
}

async function runApply(db) {
  const results = [];
  const preflight = await inspectPreflightAnomalies(db);
  if (preflight.anomalies.length > 0) {
    throw new Error(
      `Cannot apply indexes: Preflight anomalies detected (${preflight.anomalies.length}): ${JSON.stringify(preflight.anomalies.slice(0, 3))}`
    );
  }

  for (const target of TARGET_INDEXES) {
    const coll = db.collection(target.collectionName);
    let existingIndexes = [];
    try {
      existingIndexes = await coll.indexes();
    } catch {
      // Collection will be created on index creation
    }

    const match = findIndexMatch(existingIndexes, target);
    if (match.status === 'EXACT_MATCH') {
      results.push({ name: target.name, collection: target.collectionName, action: 'SKIPPED_ALREADY_EXISTS' });
    } else if (match.status === 'CONFLICT') {
      throw new Error(`Index conflict on ${target.collectionName}: ${match.reason}`);
    } else {
      await coll.createIndex(target.key, target.options);
      results.push({ name: target.name, collection: target.collectionName, action: 'CREATED' });
    }
  }

  return { results, preflight };
}

async function runRollback(db) {
  const results = [];
  for (const target of TARGET_INDEXES) {
    const coll = db.collection(target.collectionName);
    let existingIndexes = [];
    try {
      existingIndexes = await coll.indexes();
    } catch {
      continue;
    }

    const match = findIndexMatch(existingIndexes, target);
    if (match.status === 'EXACT_MATCH') {
      await coll.dropIndex(target.name);
      results.push({ name: target.name, collection: target.collectionName, action: 'DROPPED' });
    } else {
      results.push({ name: target.name, collection: target.collectionName, action: 'SKIPPED_NOT_OWNED' });
    }
  }
  return { results };
}

async function runVerify(db) {
  const verification = [];
  for (const target of TARGET_INDEXES) {
    const coll = db.collection(target.collectionName);
    let existingIndexes = [];
    try {
      existingIndexes = await coll.indexes();
    } catch {
      // Missing
    }
    const match = findIndexMatch(existingIndexes, target);
    verification.push({
      name: target.name,
      collection: target.collectionName,
      status: match.status,
      verified: match.status === 'EXACT_MATCH'
    });
  }

  const allVerified = verification.every((v) => v.verified);
  return { verification, allVerified };
}

async function runMigration(cliArgs = process.argv.slice(2)) {
  const parsed = parseMigrationCli(cliArgs, {
    allowedModes: ALLOWED_MODES,
    allowedFlags: ALLOWED_FLAGS,
    defaultMode: '--dry-run'
  });

  const { target, mode, flags } = parsed;

  const requiredConfirmations = (REQUIRED_CONFIRMATION_MAP[mode] && REQUIRED_CONFIRMATION_MAP[mode][target]) || [];
  for (const req of requiredConfirmations) {
    if (!flags.includes(req)) {
      throw new MigrationGuardError(
        `Missing required confirmation flag '${req}' for mode '${mode}' on target '${target}'`
      );
    }
  }

  const dbConfig = validateTargetAndDbConfig(target, flags);
  await mongoose.connect(dbConfig.mongoUri, dbConfig.mongooseOptions);
  const db = mongoose.connection.db;

  try {
    if (mode === 'inventory' || mode === 'dry-run') {
      const report = await runInventory(db);
      return { mode, target, success: true, report };
    }

    if (mode === 'apply') {
      const applyResult = await runApply(db);
      return { mode, target, success: true, applyResult };
    }

    if (mode === 'verify') {
      const verifyResult = await runVerify(db);
      return { mode, target, success: verifyResult.allVerified, verifyResult };
    }

    if (mode === 'finalize') {
      const verifyResult = await runVerify(db);
      if (!verifyResult.allVerified) {
        throw new Error('Cannot finalize migration: Indexes are not fully verified');
      }

      await MigrationState.findOneAndUpdate(
        { migrationId: MIGRATION_ID, target },
        {
          migrationId: MIGRATION_ID,
          target,
          status: 'COMPLETED',
          appliedAt: new Date(),
          verifiedAt: new Date(),
          metadata: { targetIndexes: TARGET_INDEXES.map((t) => t.name) }
        },
        { upsert: true, new: true }
      );

      return { mode, target, success: true, finalized: true };
    }

    if (mode === 'rollback') {
      const rollbackResult = await runRollback(db);
      await MigrationState.findOneAndUpdate(
        { migrationId: MIGRATION_ID, target },
        {
          migrationId: MIGRATION_ID,
          target,
          status: 'ROLLED_BACK',
          rolledBackAt: new Date()
        },
        { upsert: true, new: true }
      );
      return { mode, target, success: true, rollbackResult };
    }

    throw new Error(`Unsupported mode: ${mode}`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = {
  MIGRATION_ID,
  TARGET_INDEXES,
  findIndexMatch,
  inspectPreflightAnomalies,
  runInventory,
  runApply,
  runRollback,
  runVerify,
  runMigration
};

if (require.main === module) {
  runMigration()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
