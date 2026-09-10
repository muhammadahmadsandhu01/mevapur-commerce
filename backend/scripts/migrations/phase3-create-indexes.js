'use strict';

const mongoose = require('mongoose');
const MigrationState = require('../../models/MigrationState');
const InventoryTransaction = require('../../models/InventoryTransaction');
const { parseMigrationCli, validateTargetAndDbConfig } = require('../lib/migrationRuntimeGuard');

const MIGRATION_ID = 'phase3-create-indexes';

const INDEX_SPEC = {
  name: 'operationKey_1',
  keys: { operationKey: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      operationKey: { $type: 'string', $gt: '' }
    }
  }
};

const TARGET_INDEXES = [
  {
    modelName: 'InventoryTransaction',
    collectionName: 'inventorytransactions',
    key: { operationKey: 1 },
    name: 'operationKey_1',
    options: {
      unique: true,
      partialFilterExpression: {
        operationKey: { $type: 'string', $gt: '' }
      },
      name: 'operationKey_1'
    }
  }
];

const INDEX_OPTION_FIELDS = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation'
];

/**
 * Compare an existing MongoDB index against the target specification.
 */
function findIndexMatch(existingIndexes, target) {
  const targetKeyStr = JSON.stringify(target.key);
  const targetUnique = Boolean(target.options.unique);
  const targetSparse = Boolean(target.options.sparse);
  const targetFilterStr = JSON.stringify(target.options.partialFilterExpression || null);

  for (const idx of existingIndexes) {
    const idxKeyStr = JSON.stringify(idx.key);
    const idxUnique = Boolean(idx.unique);
    const idxSparse = Boolean(idx.sparse);
    const idxFilterStr = JSON.stringify(idx.partialFilterExpression || null);

    // Check key pattern match
    if (idxKeyStr === targetKeyStr) {
      if (idxUnique === targetUnique && idxSparse === targetSparse && idxFilterStr === targetFilterStr) {
        return {
          status: idx.name === target.name ? 'EXACT_MATCH' : 'EQUIVALENT_DIFFERENT_NAME',
          existingIndex: idx
        };
      } else {
        return {
          status: 'CONFLICT',
          existingIndex: idx,
          reason: `Key matches but options differ (Existing unique: ${idxUnique}, sparse: ${idxSparse}, filter: ${idxFilterStr}; Target unique: ${targetUnique}, sparse: ${targetSparse}, filter: ${targetFilterStr})`
        };
      }
    }

    // Check same name but different key conflict
    if (idx.name === target.name && idxKeyStr !== targetKeyStr) {
      return {
        status: 'CONFLICT',
        existingIndex: idx,
        reason: `Index name '${target.name}' already exists with a different key pattern (Existing: ${idxKeyStr}, Target: ${targetKeyStr})`
      };
    }
  }

  return { status: 'NOT_FOUND' };
}

/**
 * Inspect duplicate operationKey entries that would violate the unique index.
 */
async function inspectDuplicateData(db) {
  const duplicates = [];
  try {
    const collection = db.collection('inventorytransactions');
    const opKeyDups = await collection.aggregate([
      {
        $match: {
          operationKey: {
            $type: 'string',
            $gt: ''
          }
        }
      },
      {
        $group: {
          _id: '$operationKey',
          count: { $sum: 1 },
          docs: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();

    if (opKeyDups.length > 0) {
      duplicates.push({
        field: 'inventorytransactions.operationKey',
        count: opKeyDups.length,
        items: opKeyDups.map(d => ({ key: d._id, count: d.count, docs: d.docs }))
      });
    }
  } catch (err) {
    // Collection may not exist yet in empty database
  }

  return duplicates;
}

/**
 * Audited, fail-closed Phase 3 index management.
 *
 * @param {object} [options={}]
 * @param {string[]} [options.argv] - CLI arguments
 * @param {boolean} [options.customDbConnected=false] - If true, reuses existing mongoose connection
 * @param {boolean} [options.skipDisconnect=false] - If true, skips disconnecting in finally
 * @param {object} [options.env] - Environment variables override
 */
async function managePhase3Indexes({
  argv = process.argv.slice(2),
  customDbConnected = false,
  skipDisconnect = false,
  env = process.env
} = {}) {
  // 1. Strict CLI Argument Parsing
  const cli = parseMigrationCli(argv, {
    allowedModes: ['--dry-run', '--verify', '--apply', '--rollback'],
    allowedFlags: [
      '--confirm-phase3-indexes',
      '--confirm-production-indexes',
      '--confirm-phase3-index-rollback',
      '--confirm-production-index-rollback'
    ],
    requiredConfirmationMap: {
      apply: {
        staging: ['--confirm-phase3-indexes'],
        production: ['--confirm-phase3-indexes', '--confirm-production-indexes'],
        local: ['--confirm-phase3-indexes']
      },
      rollback: {
        staging: ['--confirm-phase3-index-rollback'],
        production: ['--confirm-phase3-index-rollback', '--confirm-production-index-rollback'],
        local: ['--confirm-phase3-index-rollback']
      }
    }
  });

  const modeUpper = (cli.modeKey || 'dry-run').toUpperCase();
  console.log(`=== Phase 3 Inventory Index Management [${modeUpper}] ===`);
  console.log(`Target: ${cli.target}`);

  // 2. Validate DB Target and Identity Fingerprint
  const dbConfig = validateTargetAndDbConfig({
    target: cli.target,
    hasAllowLocal: cli.hasAllowLocal,
    env
  });

  console.log(`Database Fingerprint: ${dbConfig.sanitizedFingerprint}`);

  let shouldDisconnect = false;
  if (!customDbConnected && mongoose.connection.readyState === 0) {
    await mongoose.connect(dbConfig.mongoUri);
    console.log('Connected to MongoDB.');
    shouldDisconnect = !skipDisconnect;
  }

  const db = mongoose.connection.db;

  try {
    // 3. Inspect Pre-existing / Equivalent / Conflicting Indexes & Duplicate Data
    console.log('\n--- Index & Data Safety Inspection ---');
    const duplicateData = await inspectDuplicateData(db);
    const indexInspectionResults = [];

    for (const target of TARGET_INDEXES) {
      let existingIndexes = [];
      try {
        existingIndexes = await db.collection(target.collectionName).indexes();
      } catch (err) {
        // Collection might not exist yet
      }

      const match = findIndexMatch(existingIndexes, target);
      indexInspectionResults.push({
        target,
        match
      });
    }

    // Log inspection summary
    for (const item of indexInspectionResults) {
      const { target, match } = item;
      console.log(`[INSPECT] ${target.collectionName}.${target.name}: Status = ${match.status}${match.existingIndex ? ` (Found index '${match.existingIndex.name}')` : ''}`);
      if (match.status === 'CONFLICT') {
        console.error(`⚠️ Index conflict detected on ${target.collectionName}: ${match.reason}`);
      }
    }

    const duplicateCount = duplicateData.reduce((acc, d) => acc + d.count, 0);
    if (duplicateCount > 0) {
      console.warn(`⚠️ Duplicate data detected: ${duplicateCount} duplicate groups found.`);
    }

    const hasConflicts = indexInspectionResults.some(r => r.match.status === 'CONFLICT');
    const hasDuplicates = duplicateCount > 0;
    const hasTargetIndex = indexInspectionResults.every(r => r.match.status === 'EXACT_MATCH' || r.match.status === 'EQUIVALENT_DIFFERENT_NAME');

    // 4. Handle DRY-RUN Mode
    if (cli.isDryRun) {
      console.log('\n[DRY-RUN] Index inspection complete. Zero indexes or database states were modified.');
      return {
        success: true,
        mode: 'DRY-RUN',
        status: 'dry_run_complete',
        indexInspectionResults,
        duplicateData,
        duplicateCount,
        hasConflicts,
        hasDuplicates,
        hasTargetIndex
      };
    }

    // 5. Handle VERIFY Mode
    if (cli.modeKey === 'verify') {
      console.log(`\n[VERIFY] Phase 3 Index Status: ${hasTargetIndex ? 'PRESENT & COMPLIANT' : 'PENDING APPLICATION'}`);
      console.log('✅ Verify completed with 0 writes performed.');
      return {
        success: true,
        mode: 'VERIFY',
        status: 'verified',
        hasTargetIndex,
        duplicateCount,
        hasConflicts,
        hasDuplicates,
        indexInspectionResults
      };
    }

    // 6. Handle APPLY Mode
    if (cli.isApply) {
      if (hasDuplicates) {
        throw new Error(`Index creation aborted: ${duplicateCount} duplicate operationKey entries found.`);
      }

      if (hasConflicts) {
        const conflictReasons = indexInspectionResults
          .filter(r => r.match.status === 'CONFLICT')
          .map(r => `${r.target.collectionName}.${r.target.name}: ${r.match.reason}`)
          .join('; ');
        throw new Error(`Index creation aborted due to conflicting index specifications: ${conflictReasons}`);
      }

      const createdThisRun = [];

      for (const item of indexInspectionResults) {
        const { target, match } = item;
        const coll = db.collection(target.collectionName);

        if (match.status === 'EXACT_MATCH' || match.status === 'EQUIVALENT_DIFFERENT_NAME') {
          console.log(`[INDEX-EXISTS] Index equivalent to '${target.name}' already exists on '${target.collectionName}' (Name: '${match.existingIndex.name}'). Preserving without change.`);
        } else if (match.status === 'NOT_FOUND') {
          console.log(`[INDEX-CREATING] Building index '${target.name}' on '${target.collectionName}'...`);
          await coll.createIndex(target.key, target.options);
          createdThisRun.push(`${target.collectionName}.${target.name}`);
          console.log(`✅ [INDEX-CREATED] Created index '${target.name}' on collection '${target.collectionName}'.`);
        }
      }

      // Record created index names in MigrationState for audited ownership
      let migrationState = await MigrationState.findOne({ migrationId: MIGRATION_ID });
      if (!migrationState) {
        migrationState = new MigrationState({ migrationId: MIGRATION_ID });
      }

      const previouslyCreated = Array.isArray(migrationState.createdIndexes) ? migrationState.createdIndexes : [];
      const mergedCreatedIndexes = Array.from(new Set([...previouslyCreated, ...createdThisRun]));

      migrationState.status = 'completed';
      migrationState.completedAt = new Date();
      migrationState.createdIndexes = mergedCreatedIndexes;
      migrationState.metadata = {
        appliedTarget: cli.target,
        totalTargetIndexes: TARGET_INDEXES.length,
        createdCount: createdThisRun.length,
        preservedCount: TARGET_INDEXES.length - createdThisRun.length,
        lastAppliedAt: new Date()
      };
      await migrationState.save();

      console.log(`\n✅ Phase 3 indexes applied successfully. Newly created: ${createdThisRun.length}, Preserved existing: ${TARGET_INDEXES.length - createdThisRun.length}`);
      return {
        success: true,
        mode: 'APPLY',
        status: 'completed',
        createdIndexes: createdThisRun,
        state: migrationState
      };
    }

    // 7. Handle ROLLBACK Mode
    if (cli.isRollback) {
      console.log('\n--- Executing Phase 3 Index Rollback ---');
      const migrationState = await MigrationState.findOne({ migrationId: MIGRATION_ID });

      if (!migrationState || !Array.isArray(migrationState.createdIndexes) || migrationState.createdIndexes.length === 0) {
        throw new Error('Rollback refused: Rollout ownership cannot be proven (no record in MigrationState of indexes created by this rollout). Manual operator review required.');
      }

      const droppedIndexes = [];

      for (const entry of migrationState.createdIndexes) {
        const [collName, indexName] = entry.split('.');
        if (indexName === '_id_') {
          console.warn(`[ROLLBACK-SKIP] Cannot drop primary key index '_id_'.`);
          continue;
        }

        try {
          const coll = db.collection(collName);
          const existing = await coll.indexes();
          const targetIndex = existing.find(idx => idx.name === indexName);

          if (targetIndex) {
            // Check that the index still matches expected target specification before dropping
            const targetSpec = TARGET_INDEXES.find(t => t.collectionName === collName && t.name === indexName);
            if (targetSpec && JSON.stringify(targetIndex.key) !== JSON.stringify(targetSpec.key)) {
              console.warn(`[ROLLBACK-SKIP] Index '${indexName}' on '${collName}' has a modified key structure. Skipping drop to prevent data risk.`);
              continue;
            }

            console.log(`[ROLLBACK-DROPPING] Dropping owned rollout index '${indexName}' from collection '${collName}'...`);
            await coll.dropIndex(indexName);
            droppedIndexes.push(entry);
            console.log(`✅ [ROLLBACK-DROPPED] Dropped index '${indexName}' on '${collName}'.`);
          } else {
            console.log(`[ROLLBACK-NOTICE] Index '${indexName}' on '${collName}' not found or already dropped.`);
          }
        } catch (err) {
          console.warn(`[ROLLBACK-WARN] Could not drop index ${entry}: ${err.message}`);
        }
      }

      migrationState.status = 'rolled_back';
      migrationState.completedAt = new Date();
      migrationState.metadata = {
        ...migrationState.metadata,
        rolledBackAt: new Date(),
        droppedIndexes
      };
      await migrationState.save();

      console.log(`\n✅ Phase 3 Index rollback complete. Dropped ${droppedIndexes.length} rollout-created indexes.`);
      return {
        success: true,
        mode: 'ROLLBACK',
        status: 'rolled_back',
        droppedIndexes,
        state: migrationState
      };
    }
  } finally {
    if (shouldDisconnect && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }
}

if (require.main === module) {
  managePhase3Indexes().catch(err => {
    console.error('Phase 3 index management failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  managePhase3Indexes,
  manageIndexes: managePhase3Indexes,
  TARGET_INDEXES,
  INDEX_SPEC,
  MIGRATION_ID,
  findIndexMatch,
  inspectDuplicateData
};
