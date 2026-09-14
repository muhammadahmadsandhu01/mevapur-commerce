#!/usr/bin/env node
'use strict';

/**
 * @file phase6b-commerce-configuration-governance.js
 * @description Guarded, idempotent index and governance migration for Phase 6B Global Commerce Configuration.
 *
 * Supported modes:
 *   --inventory : Read-only evaluation and status breakdown.
 *   --dry-run   : Read-only simulation of index creations (default).
 *   --apply     : Bounded creation of scoped unique and query indexes.
 *   --verify    : Read-only verification scan.
 *   --finalize  : Separately authorized write of MigrationState completion evidence.
 *   --rollback  : Idempotent transactional rollback of migration-owned indexes.
 */

const mongoose = require('mongoose');
const MigrationState = require('../../models/MigrationState');
const {
  MigrationGuardError,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../lib/migrationRuntimeGuard');

const MIGRATION_ID = 'phase6b-commerce-configuration-governance';

const ALLOWED_MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--finalize', '--rollback'];
const ALLOWED_FLAGS = [
  '--confirm-phase6b-apply',
  '--confirm-phase6b-finalize',
  '--confirm-phase6b-rollback',
  '--confirm-production',
  '--allow-local'
];

const REQUIRED_CONFIRMATION_MAP = {
  apply: {
    staging: ['--confirm-phase6b-apply'],
    production: ['--confirm-phase6b-apply', '--confirm-production'],
    local: ['--confirm-phase6b-apply']
  },
  finalize: {
    staging: ['--confirm-phase6b-finalize'],
    production: ['--confirm-phase6b-finalize', '--confirm-production'],
    local: ['--confirm-phase6b-finalize']
  },
  rollback: {
    staging: ['--confirm-phase6b-rollback'],
    production: ['--confirm-phase6b-rollback', '--confirm-production'],
    local: ['--confirm-phase6b-rollback']
  }
};

const TARGET_INDEXES = [
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1, version: 1 },
    name: 'merchantScopeId_1_version_1',
    options: {
      unique: true,
      name: 'merchantScopeId_1_version_1'
    }
  },
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 },
    name: 'merchantScopeId_1_status_1_effectiveFrom_1_effectiveTo_1',
    options: {
      name: 'merchantScopeId_1_status_1_effectiveFrom_1_effectiveTo_1'
    }
  },
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1 },
    name: 'merchantScopeId_1_status_active_unique',
    options: {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'merchantScopeId_1_status_active_unique'
    }
  },
  {
    modelName: 'CommerceConfigurationSequence',
    collectionName: 'commerceconfigurationsequences',
    key: { merchantScopeId: 1 },
    name: 'merchantScopeId_1',
    options: {
      unique: true,
      name: 'merchantScopeId_1'
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

    if (idx.name === target.name && idxKeyStr !== targetKeyStr) {
      return {
        status: 'CONFLICT',
        existingIndex: idx,
        reason: `Index name '${target.name}' already exists with different key pattern`
      };
    }
  }

  return { status: 'NOT_FOUND' };
}

async function inspectIndexes(db) {
  const results = [];

  for (const target of TARGET_INDEXES) {
    let existingIndexes = [];
    try {
      const collection = db.collection(target.collectionName);
      existingIndexes = await collection.indexes();
    } catch {
      // Collection may not exist yet
      existingIndexes = [];
    }

    const match = findIndexMatch(existingIndexes, target);
    results.push({
      target,
      matchStatus: match.status,
      existingIndex: match.existingIndex || null,
      reason: match.reason || null
    });
  }

  return results;
}

async function runCli(argv = process.argv.slice(2)) {
  const cli = parseMigrationCli(argv, {
    allowedModes: ALLOWED_MODES,
    allowedFlags: ALLOWED_FLAGS,
    requiredConfirmationMap: REQUIRED_CONFIRMATION_MAP
  });

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur-dev';
  const targetEnv = cli.target || 'local';

  await validateTargetAndDbConfig({
    target: targetEnv,
    uri,
    flags: cli.flags
  });

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  try {
    const indexInspection = await inspectIndexes(db);
    const migrationDoc = await MigrationState.findOne({ migrationId: MIGRATION_ID });

    if (cli.mode === '--inventory') {
      console.log(JSON.stringify({
        migrationId: MIGRATION_ID,
        mode: 'inventory',
        migrationState: migrationDoc ? migrationDoc.status : 'NOT_STARTED',
        indexes: indexInspection
      }, null, 2));
      return;
    }

    if (cli.mode === '--dry-run' || !cli.mode) {
      console.log(JSON.stringify({
        migrationId: MIGRATION_ID,
        mode: 'dry-run',
        action: 'Would create missing scoped indexes for CommerceConfigurationVersion and CommerceConfigurationSequence',
        indexes: indexInspection
      }, null, 2));
      return;
    }

    if (cli.mode === '--verify') {
      const allPresent = indexInspection.every((i) => i.matchStatus === 'EXACT_MATCH' || i.matchStatus === 'EQUIVALENT_DIFFERENT_NAME');
      console.log(JSON.stringify({
        migrationId: MIGRATION_ID,
        mode: 'verify',
        verified: allPresent,
        indexes: indexInspection
      }, null, 2));
      return;
    }

    if (cli.mode === '--apply') {
      const created = [];
      for (const item of indexInspection) {
        if (item.matchStatus === 'NOT_FOUND') {
          const collection = db.collection(item.target.collectionName);
          await collection.createIndex(item.target.key, item.target.options);
          created.push(item.target.name);
        }
      }

      await MigrationState.findOneAndUpdate(
        { migrationId: MIGRATION_ID },
        {
          $set: {
            migrationId: MIGRATION_ID,
            status: 'APPLIED',
            appliedAt: new Date(),
            details: { createdIndexes: created }
          }
        },
        { upsert: true, new: true }
      );

      console.log(JSON.stringify({
        migrationId: MIGRATION_ID,
        mode: 'apply',
        status: 'SUCCESS',
        createdIndexes: created
      }, null, 2));
      return;
    }

    if (cli.mode === '--finalize') {
      await MigrationState.findOneAndUpdate(
        { migrationId: MIGRATION_ID },
        {
          $set: {
            status: 'FINALIZED',
            finalizedAt: new Date()
          }
        },
        { upsert: true }
      );
      console.log(JSON.stringify({ migrationId: MIGRATION_ID, mode: 'finalize', status: 'FINALIZED' }, null, 2));
      return;
    }

    if (cli.mode === '--rollback') {
      const state = await MigrationState.findOne({ migrationId: MIGRATION_ID });
      const createdIndexes = state?.details?.createdIndexes || [];

      for (const target of TARGET_INDEXES) {
        if (createdIndexes.includes(target.name)) {
          try {
            const collection = db.collection(target.collectionName);
            await collection.dropIndex(target.name);
          } catch {
            // Ignore if index already dropped
          }
        }
      }

      await MigrationState.findOneAndUpdate(
        { migrationId: MIGRATION_ID },
        { $set: { status: 'ROLLED_BACK', rolledBackAt: new Date() } }
      );

      console.log(JSON.stringify({ migrationId: MIGRATION_ID, mode: 'rollback', status: 'ROLLED_BACK' }, null, 2));
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(`Migration error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runCli, inspectIndexes, TARGET_INDEXES, MIGRATION_ID };
