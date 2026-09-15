#!/usr/bin/env node
'use strict';

/**
 * @file phase6d2-multi-origin-inventory.js
 * @description Guarded, idempotent index and invariant migration for Phase 6D-2 Multi-Origin Inventory,
 * ATP, Deterministic Allocation, and Durable Payment-Safe Reservations.
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

const MIGRATION_ID = 'phase6d2-multi-origin-inventory';

const ALLOWED_MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--finalize', '--rollback'];
const ALLOWED_FLAGS = [
  '--confirm-phase6d2-apply',
  '--confirm-phase6d2-finalize',
  '--confirm-phase6d2-rollback',
  '--confirm-production',
  '--allow-local'
];

const REQUIRED_CONFIRMATION_MAP = {
  apply: {
    staging: ['--confirm-phase6d2-apply'],
    production: ['--confirm-phase6d2-apply', '--confirm-production'],
    local: ['--confirm-phase6d2-apply']
  },
  finalize: {
    staging: ['--confirm-phase6d2-finalize'],
    production: ['--confirm-phase6d2-finalize', '--confirm-production'],
    local: ['--confirm-phase6d2-finalize']
  },
  rollback: {
    staging: ['--confirm-phase6d2-rollback'],
    production: ['--confirm-phase6d2-rollback', '--confirm-production'],
    local: ['--confirm-phase6d2-rollback']
  }
};

const TARGET_INDEXES = [
  // FulfillmentLocation indexes
  {
    modelName: 'FulfillmentLocation',
    collectionName: 'fulfillmentlocations',
    key: { merchantScopeId: 1, locationCode: 1 },
    name: 'unique_tenant_location_code',
    options: { unique: true, name: 'unique_tenant_location_code' }
  },
  {
    modelName: 'FulfillmentLocation',
    collectionName: 'fulfillmentlocations',
    key: { merchantScopeId: 1, status: 1, priority: 1 },
    name: 'tenant_status_priority_idx',
    options: { name: 'tenant_status_priority_idx' }
  },
  {
    modelName: 'FulfillmentLocation',
    collectionName: 'fulfillmentlocations',
    key: { merchantScopeId: 1, supportedMarketCountries: 1, status: 1 },
    name: 'tenant_market_support_idx',
    options: { name: 'tenant_market_support_idx' }
  },
  {
    modelName: 'FulfillmentLocation',
    collectionName: 'fulfillmentlocations',
    key: { merchantScopeId: 1, isDefault: 1 },
    name: 'unique_active_default_location',
    options: {
      unique: true,
      partialFilterExpression: { isDefault: true, status: 'active' },
      name: 'unique_active_default_location'
    }
  },

  // InventoryPosition indexes
  {
    modelName: 'InventoryPosition',
    collectionName: 'inventorypositions',
    key: { merchantScopeId: 1, locationId: 1, productId: 1, scopeType: 1, scopeKey: 1 },
    name: 'unique_tenant_location_product_scope',
    options: { unique: true, name: 'unique_tenant_location_product_scope' }
  },
  {
    modelName: 'InventoryPosition',
    collectionName: 'inventorypositions',
    key: { merchantScopeId: 1, productId: 1, scopeKey: 1, locationId: 1 },
    name: 'tenant_product_scope_location_idx',
    options: { name: 'tenant_product_scope_location_idx' }
  },
  {
    modelName: 'InventoryPosition',
    collectionName: 'inventorypositions',
    key: { merchantScopeId: 1, canonicalSku: 1 },
    name: 'tenant_sku_lookup_idx',
    options: { name: 'tenant_sku_lookup_idx' }
  },
  {
    modelName: 'InventoryPosition',
    collectionName: 'inventorypositions',
    key: { merchantScopeId: 1, locationId: 1, onHand: 1 },
    name: 'tenant_location_stock_idx',
    options: { name: 'tenant_location_stock_idx' }
  },

  // InventoryLedger indexes
  {
    modelName: 'InventoryLedger',
    collectionName: 'inventoryledgers',
    key: { idempotencyKey: 1 },
    name: 'unique_inventory_ledger_idempotency',
    options: {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } },
      name: 'unique_inventory_ledger_idempotency'
    }
  },
  {
    modelName: 'InventoryLedger',
    collectionName: 'inventoryledgers',
    key: { merchantScopeId: 1, productId: 1, createdAt: -1 },
    name: 'tenant_product_ledger_idx',
    options: { name: 'tenant_product_ledger_idx' }
  },
  {
    modelName: 'InventoryLedger',
    collectionName: 'inventoryledgers',
    key: { merchantScopeId: 1, locationId: 1, createdAt: -1 },
    name: 'tenant_location_ledger_idx',
    options: { name: 'tenant_location_ledger_idx' }
  },
  {
    modelName: 'InventoryLedger',
    collectionName: 'inventoryledgers',
    key: { merchantScopeId: 1, orderId: 1 },
    name: 'tenant_order_ledger_idx',
    options: { name: 'tenant_order_ledger_idx' }
  },
  {
    modelName: 'InventoryLedger',
    collectionName: 'inventoryledgers',
    key: { merchantScopeId: 1, movementType: 1, createdAt: -1 },
    name: 'tenant_movement_type_idx',
    options: { name: 'tenant_movement_type_idx' }
  },

  // InventoryReservation indexes
  {
    modelName: 'InventoryReservation',
    collectionName: 'inventoryreservations',
    key: { reservationKey: 1 },
    name: 'unique_reservation_key',
    options: { unique: true, name: 'unique_reservation_key' }
  },
  {
    modelName: 'InventoryReservation',
    collectionName: 'inventoryreservations',
    key: { merchantScopeId: 1, orderId: 1 },
    name: 'unique_tenant_order_reservation',
    options: { unique: true, name: 'unique_tenant_order_reservation' }
  },
  {
    modelName: 'InventoryReservation',
    collectionName: 'inventoryreservations',
    key: { status: 1, expiresAt: 1 },
    name: 'reservation_expiry_reconciliation_idx',
    options: { name: 'reservation_expiry_reconciliation_idx' }
  },
  {
    modelName: 'InventoryReservation',
    collectionName: 'inventoryreservations',
    key: { merchantScopeId: 1, createdAt: -1 },
    name: 'tenant_reservation_history_idx',
    options: { name: 'tenant_reservation_history_idx' }
  }
];

function findIndexMatch(existingIndexes, targetIndex) {
  const targetKeyEntries = Object.entries(targetIndex.key);
  return existingIndexes.find((existing) => {
    if (existing.name === targetIndex.name) return true;
    const existingKeyEntries = Object.entries(existing.key);
    if (existingKeyEntries.length !== targetKeyEntries.length) return false;
    return targetKeyEntries.every(([k, v], idx) => {
      const [exK, exV] = existingKeyEntries[idx];
      return k === exK && v === exV;
    });
  });
}

async function inspectPreflightAnomalies(db) {
  const anomalies = [];

  // Check negative onHand, reserved or safetyStock in inventorypositions
  const posCol = db.collection('inventorypositions');
  const negativePositions = await posCol.find({
    $or: [
      { onHand: { $lt: 0 } },
      { reserved: { $lt: 0 } },
      { unavailable: { $lt: 0 } },
      { safetyStock: { $lt: 0 } }
    ]
  }).toArray();

  if (negativePositions.length > 0) {
    anomalies.push({
      type: 'NEGATIVE_INVENTORY_QUANTITY',
      count: negativePositions.length,
      sampleIds: negativePositions.slice(0, 5).map((p) => String(p._id))
    });
  }

  // Check invalid country codes in fulfillment locations
  const locCol = db.collection('fulfillmentlocations');
  const locations = await locCol.find({}).toArray();
  const invalidLocCountries = locations.filter((loc) => !CountryRegistry.hasCountry(loc.countryCode));
  if (invalidLocCountries.length > 0) {
    anomalies.push({
      type: 'INVALID_LOCATION_COUNTRY',
      count: invalidLocCountries.length,
      sampleCodes: invalidLocCountries.slice(0, 5).map((l) => l.locationCode)
    });
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
