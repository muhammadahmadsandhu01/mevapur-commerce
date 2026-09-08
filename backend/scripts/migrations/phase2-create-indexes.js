const mongoose = require('mongoose');

const MigrationState = require('../../models/MigrationState');
const { parseMigrationCli, validateTargetAndDbConfig } = require('../lib/migrationRuntimeGuard');

const MIGRATION_ID = 'phase2-create-indexes';

const TARGET_INDEXES = [
  {
    modelName: 'SkuRegistry',
    collectionName: 'skuregistries',
    key: { sku: 1 },
    name: 'unique_global_sku',
    options: { unique: true, name: 'unique_global_sku' }
  },
  {
    modelName: 'Product',
    collectionName: 'products',
    key: { slug: 1 },
    name: 'unique_product_slug',
    options: { unique: true, name: 'unique_product_slug' }
  },
  {
    modelName: 'Product',
    collectionName: 'products',
    key: { sku: 1 },
    name: 'unique_product_root_sku',
    options: {
      unique: true,
      partialFilterExpression: { sku: { $type: 'string' } },
      name: 'unique_product_root_sku'
    }
  },
  {
    modelName: 'MediaAsset',
    collectionName: 'mediaassets',
    key: { status: 1, nextRetryAt: 1 },
    name: 'status_1_nextRetryAt_1',
    options: { name: 'status_1_nextRetryAt_1' }
  },
  {
    modelName: 'MediaAsset',
    collectionName: 'mediaassets',
    key: { 'attachedTo.id': 1 },
    name: 'attachedTo.id_1',
    options: { name: 'attachedTo.id_1' }
  }
];

function findIndexMatch(existingIndexes, target) {
  const targetKeyStr = JSON.stringify(target.key);
  const targetUnique = Boolean(target.options.unique);
  const targetFilterStr = JSON.stringify(target.options.partialFilterExpression || null);

  for (const idx of existingIndexes) {
    const idxKeyStr = JSON.stringify(idx.key);
    const idxUnique = Boolean(idx.unique);
    const idxFilterStr = JSON.stringify(idx.partialFilterExpression || null);

    if (idxKeyStr === targetKeyStr) {
      if (idxUnique === targetUnique && idxFilterStr === targetFilterStr) {
        return {
          status: idx.name === target.name ? 'EXACT_MATCH' : 'EQUIVALENT_DIFFERENT_NAME',
          existingIndex: idx
        };
      } else {
        return {
          status: 'CONFLICT',
          existingIndex: idx,
          reason: `Key matches but options differ (Existing unique: ${idxUnique}, filter: ${idxFilterStr}; Target unique: ${targetUnique}, filter: ${targetFilterStr})`
        };
      }
    }
  }
  return { status: 'NOT_FOUND' };
}

async function inspectDuplicateData(db) {
  const duplicates = [];

  try {
    const productColl = db.collection('products');
    const slugDups = await productColl.aggregate([
      { $match: { slug: { $exists: true, $ne: null } } },
      { $group: { _id: '$slug', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (slugDups.length > 0) {
      duplicates.push({ field: 'slug', count: slugDups.length, items: slugDups.map(d => d._id) });
    }

    const rootSkuDups = await productColl.aggregate([
      { $match: { sku: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$sku', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (rootSkuDups.length > 0) {
      duplicates.push({ field: 'product.sku', count: rootSkuDups.length, items: rootSkuDups.map(d => d._id) });
    }
  } catch (err) {
    // If collection doesn't exist yet, no duplicates
  }

  try {
    const skuRegistryColl = db.collection('skuregistries');
    const globalSkuDups = await skuRegistryColl.aggregate([
      { $match: { sku: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$sku', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (globalSkuDups.length > 0) {
      duplicates.push({ field: 'skuRegistry.sku', count: globalSkuDups.length, items: globalSkuDups.map(d => d._id) });
    }
  } catch (err) {
    // If collection doesn't exist yet, no duplicates
  }

  return duplicates;
}

async function manageIndexes({
  argv = process.argv.slice(2),
  customDbConnected = false,
  env = process.env
} = {}) {
  // 1. Strict CLI Argument Parsing
  const cli = parseMigrationCli(argv, {
    allowedModes: ['--dry-run', '--apply', '--rollback'],
    allowedFlags: [
      '--confirm-phase2-indexes',
      '--confirm-production-indexes',
      '--confirm-phase2-index-rollback',
      '--confirm-production-index-rollback'
    ],
    requiredConfirmationMap: {
      apply: {
        staging: ['--confirm-phase2-indexes'],
        production: ['--confirm-phase2-indexes', '--confirm-production-indexes'],
        local: ['--confirm-phase2-indexes']
      },
      rollback: {
        staging: ['--confirm-phase2-index-rollback'],
        production: ['--confirm-phase2-index-rollback', '--confirm-production-index-rollback'],
        local: ['--confirm-phase2-index-rollback']
      }
    }
  });

  console.log(`--- Phase 2 Index Management (${cli.modeKey.toUpperCase()}) ---`);
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
    shouldDisconnect = true;
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

    if (duplicateData.length > 0) {
      console.warn(`⚠️ Duplicate data detected:`, JSON.stringify(duplicateData, null, 2));
    }

    // 4. Handle DRY-RUN Mode
    if (cli.isDryRun) {
      console.log('\n[DRY-RUN] Index inspection complete. Zero indexes or database states were modified.');
      return {
        status: 'dry_run_complete',
        indexInspectionResults,
        duplicateData,
        hasConflicts: indexInspectionResults.some(r => r.match.status === 'CONFLICT'),
        hasDuplicates: duplicateData.length > 0
      };
    }

    // 5. Handle APPLY Mode
    if (cli.isApply) {
      if (duplicateData.length > 0) {
        throw new Error(`Index creation aborted: ${duplicateData.length} duplicate data conflicts detected.`);
      }

      const conflicts = indexInspectionResults.filter(r => r.match.status === 'CONFLICT');
      if (conflicts.length > 0) {
        throw new Error(`Index creation aborted: ${conflicts.length} conflicting index specifications detected.`);
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

      migrationState.status = 'completed';
      migrationState.completedAt = new Date();
      migrationState.createdIndexes = createdThisRun;
      migrationState.metadata = {
        appliedTarget: cli.target,
        totalTargetIndexes: TARGET_INDEXES.length,
        createdCount: createdThisRun.length,
        preservedCount: TARGET_INDEXES.length - createdThisRun.length
      };
      await migrationState.save();

      console.log(`\n✅ Phase 2 indexes applied successfully. Newly created: ${createdThisRun.length}, Preserved existing: ${TARGET_INDEXES.length - createdThisRun.length}`);
      return { status: 'completed', createdIndexes: createdThisRun, state: migrationState };
    }

    // 6. Handle ROLLBACK Mode
    if (cli.isRollback) {
      console.log('\n--- Executing Phase 2 Index Rollback ---');
      const migrationState = await MigrationState.findOne({ migrationId: MIGRATION_ID });

      if (!migrationState || !Array.isArray(migrationState.createdIndexes) || migrationState.createdIndexes.length === 0) {
        throw new Error('Rollback refused: Rollout ownership cannot be proven (no record in MigrationState of indexes created by this rollout). Manual operator review required.');
      }

      const droppedIndexes = [];

      for (const entry of migrationState.createdIndexes) {
        const [collName, indexName] = entry.split('.');
        try {
          const coll = db.collection(collName);
          const existing = await coll.indexes();
          if (existing.some(idx => idx.name === indexName)) {
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

      console.log(`\n✅ Index rollback complete. Dropped ${droppedIndexes.length} rollout-created indexes.`);
      return { status: 'rolled_back', droppedIndexes, state: migrationState };
    }
  } finally {
    if (shouldDisconnect && mongoose.connection.readyState !== 0 && require.main === module) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }
}

if (require.main === module) {
  manageIndexes().catch(err => {
    console.error('Index management failed:', err.message);
    process.exit(1);
  });
}

module.exports = { manageIndexes, TARGET_INDEXES, MIGRATION_ID };
