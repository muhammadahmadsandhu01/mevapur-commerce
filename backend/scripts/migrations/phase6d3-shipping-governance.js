#!/usr/bin/env node
'use strict';

/**
 * @file phase6d3-shipping-governance.js
 * @description Guarded, idempotent index and invariant migration for Phase 6D-3 Shipping Governance,
 * Multi-Service Rate Calculation, Fulfillment Routing, and Quote Authority.
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
const { CountryRegistry } = require('../../modules/commerce');
const {
  MigrationGuardError,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../lib/migrationRuntimeGuard');

const MIGRATION_ID = 'phase6d3-shipping-governance';

const ALLOWED_MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--finalize', '--rollback'];
const ALLOWED_FLAGS = [
  '--confirm-phase6d3-apply',
  '--confirm-phase6d3-finalize',
  '--confirm-phase6d3-rollback',
  '--confirm-production',
  '--allow-local'
];

const REQUIRED_CONFIRMATION_MAP = {
  apply: {
    staging: ['--confirm-phase6d3-apply'],
    production: ['--confirm-phase6d3-apply', '--confirm-production'],
    local: ['--confirm-phase6d3-apply']
  },
  finalize: {
    staging: ['--confirm-phase6d3-finalize'],
    production: ['--confirm-phase6d3-finalize', '--confirm-production'],
    local: ['--confirm-phase6d3-finalize']
  },
  rollback: {
    staging: ['--confirm-phase6d3-rollback'],
    production: ['--confirm-phase6d3-rollback', '--confirm-production'],
    local: ['--confirm-phase6d3-rollback']
  }
};

const TARGET_INDEXES = [
  // CommerceConfigurationVersion indexes
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1, version: 1 },
    name: 'unique_tenant_config_version',
    options: { unique: true, name: 'unique_tenant_config_version' }
  },
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 },
    name: 'tenant_config_lifecycle_idx',
    options: { name: 'tenant_config_lifecycle_idx' }
  },
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1 },
    name: 'unique_active_tenant_config',
    options: {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'unique_active_tenant_config'
    }
  },

  // ShippingZone query index
  {
    modelName: 'ShippingZone',
    collectionName: 'shippingzones',
    key: { countries: 1, enabled: 1, priority: 1 },
    name: 'shipping_zone_lookup_idx',
    options: { name: 'shipping_zone_lookup_idx' }
  },

  // Order shipping & quote lookup indexes
  {
    modelName: 'Order',
    collectionName: 'orders',
    key: { 'shippingQuote.ruleId': 1 },
    name: 'order_shipping_rule_lookup_idx',
    options: {
      name: 'order_shipping_rule_lookup_idx',
      partialFilterExpression: { 'shippingQuote.ruleId': { $type: 'string', $gt: '' } }
    }
  },
  {
    modelName: 'Order',
    collectionName: 'orders',
    key: { 'quote.quoteId': 1 },
    name: 'order_quote_id_lookup_idx',
    options: {
      name: 'order_quote_id_lookup_idx',
      partialFilterExpression: { 'quote.quoteId': { $type: 'string', $gt: '' } }
    }
  }
];

function findIndexMatch(existingIndexes, targetIndex, targetName = null) {
  if (!Array.isArray(existingIndexes)) return null;
  const targetKey = targetIndex && targetIndex.key ? targetIndex.key : targetIndex;
  const targetKeyEntries = targetKey && typeof targetKey === 'object' ? Object.entries(targetKey) : [];

  return existingIndexes.find((existing) => {
    if (targetName && existing.name === targetName) return true;
    if (targetIndex && targetIndex.name && existing.name === targetIndex.name) return true;
    if (targetKeyEntries.length === 0) return false;

    const existingKey = existing.key || existing;
    const existingKeyEntries = Object.entries(existingKey);
    if (existingKeyEntries.length !== targetKeyEntries.length) return false;
    return targetKeyEntries.every(([k, v]) => existingKey[k] === v);
  }) || null;
}

async function inspectPreflightAnomalies(dbOrRules) {
  const anomalies = [];
  let configs = [];

  if (Array.isArray(dbOrRules)) {
    configs = [{ version: 1, shippingRules: dbOrRules }];
  } else if (dbOrRules && typeof dbOrRules.collection === 'function') {
    const configCol = dbOrRules.collection('commerceconfigurationversions');
    configs = await configCol.find({ status: 'active' }).toArray();
  } else if (dbOrRules && Array.isArray(dbOrRules.shippingRules)) {
    configs = [dbOrRules];
  }

  for (const cfg of configs) {
    const seenRuleIds = new Set();
    for (const rule of (cfg.shippingRules || [])) {
      if (seenRuleIds.has(rule.ruleId)) {
        anomalies.push({
          type: 'DUPLICATE_RULE_ID',
          configVersion: cfg.version,
          ruleId: rule.ruleId
        });
      }
      seenRuleIds.add(rule.ruleId);

      if (!CountryRegistry.hasCountry(rule.destinationCountry)) {
        anomalies.push({
          type: 'INVALID_DESTINATION_COUNTRY',
          configVersion: cfg.version,
          ruleId: rule.ruleId,
          country: rule.destinationCountry
        });
      }
      if (rule.originCountry && !CountryRegistry.hasCountry(rule.originCountry)) {
        anomalies.push({
          type: 'INVALID_ORIGIN_COUNTRY',
          configVersion: cfg.version,
          ruleId: rule.ruleId,
          country: rule.originCountry
        });
      }
      if (rule.deliveryMaxDays != null && rule.deliveryMinDays != null && rule.deliveryMaxDays < rule.deliveryMinDays) {
        anomalies.push({
          type: 'INVERTED_DELIVERY_DAYS',
          configVersion: cfg.version,
          ruleId: rule.ruleId
        });
      }
      for (const band of (rule.weightBands || [])) {
        if (band.maxWeightGrams <= band.minWeightGrams) {
          anomalies.push({
            type: 'INVALID_WEIGHT_BAND_BOUNDS',
            configVersion: cfg.version,
            ruleId: rule.ruleId,
            min: band.minWeightGrams,
            max: band.maxWeightGrams
          });
        }
      }
    }
  }

  return anomalies;
}

async function runInventory(db) {
  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map((c) => c.name));

  const indexStatus = [];

  for (const targetIndex of TARGET_INDEXES) {
    const colExists = collectionNames.has(targetIndex.collectionName);
    let isPresent = false;
    let indexDetails = null;

    if (colExists) {
      const indexes = await db.collection(targetIndex.collectionName).indexes();
      const match = findIndexMatch(indexes, targetIndex);
      if (match) {
        isPresent = true;
        indexDetails = match;
      }
    }

    indexStatus.push({
      modelName: targetIndex.modelName,
      collectionName: targetIndex.collectionName,
      indexName: targetIndex.name,
      collectionExists: colExists,
      isPresent,
      indexDetails
    });
  }

  const anomalies = await inspectPreflightAnomalies(db);

  return {
    migrationId: MIGRATION_ID,
    totalTargetIndexes: TARGET_INDEXES.length,
    presentIndexes: indexStatus.filter((s) => s.isPresent).length,
    missingIndexes: indexStatus.filter((s) => !s.isPresent).length,
    indexStatus,
    anomalies
  };
}

async function runApply(db) {
  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map((c) => c.name));

  const applied = [];
  const skipped = [];

  for (const targetIndex of TARGET_INDEXES) {
    if (!collectionNames.has(targetIndex.collectionName)) {
      await db.createCollection(targetIndex.collectionName);
      collectionNames.add(targetIndex.collectionName);
    }

    const col = db.collection(targetIndex.collectionName);
    const existingIndexes = await col.indexes();
    const match = findIndexMatch(existingIndexes, targetIndex);

    if (match) {
      skipped.push({ name: targetIndex.name, reason: 'ALREADY_EXISTS' });
    } else {
      await col.createIndex(targetIndex.key, targetIndex.options);
      applied.push({ name: targetIndex.name, collection: targetIndex.collectionName });
    }
  }

  return { applied, skipped };
}

async function runRollback(db) {
  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map((c) => c.name));

  const dropped = [];
  const skipped = [];

  for (const targetIndex of TARGET_INDEXES) {
    if (!collectionNames.has(targetIndex.collectionName)) {
      skipped.push({ name: targetIndex.name, reason: 'COLLECTION_NOT_FOUND' });
      continue;
    }

    const col = db.collection(targetIndex.collectionName);
    const existingIndexes = await col.indexes();
    const match = findIndexMatch(existingIndexes, targetIndex);

    if (match && match.name !== '_id_') {
      await col.dropIndex(match.name);
      dropped.push({ name: match.name, collection: targetIndex.collectionName });
    } else {
      skipped.push({ name: targetIndex.name, reason: 'NOT_FOUND_OR_PRIMARY' });
    }
  }

  return { dropped, skipped };
}

async function runVerify(db) {
  const inventory = await runInventory(db);
  const verification = inventory.indexStatus.map((idx) => ({
    name: idx.indexName,
    collection: idx.collectionName,
    verified: idx.isPresent
  }));

  const allVerified = verification.every((v) => v.verified);
  return { verification, allVerified, anomalies: inventory.anomalies };
}

async function runMigration(cliArgs = process.argv.slice(2)) {
  const parsed = parseMigrationCli(cliArgs, {
    allowedModes: ALLOWED_MODES,
    allowedFlags: ALLOWED_FLAGS,
    defaultMode: '--dry-run'
  });

  const { target, mode, flags, modeKey, hasAllowLocal } = parsed;

  const key = modeKey || mode.replace(/^--/, '');
  const requiredConfirmations = (REQUIRED_CONFIRMATION_MAP[key] && REQUIRED_CONFIRMATION_MAP[key][target]) || [];
  for (const req of requiredConfirmations) {
    if (!flags.includes(req)) {
      throw new MigrationGuardError(
        'CONFIRMATION_REQUIRED',
        `Missing required confirmation flag '${req}' for mode '${mode}' on target '${target}'`
      );
    }
  }

  const dbConfig = validateTargetAndDbConfig({ target, hasAllowLocal });
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
