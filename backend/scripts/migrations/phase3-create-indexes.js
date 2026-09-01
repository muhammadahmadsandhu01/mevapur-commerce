'use strict';

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const InventoryTransaction = require('../../models/InventoryTransaction');

const INDEX_SPEC = {
  name: 'operationKey_1',
  keys: { operationKey: 1 },
  options: { unique: true, sparse: true }
};

/**
 * Audit and manage Phase 3 indexes with deterministic safety checks.
 */
async function managePhase3Indexes(options = {}) {
  const isApply = options.apply || process.argv.includes('--apply');
  const isRollback = options.rollback || process.argv.includes('--rollback');
  const isVerify = options.verify || process.argv.includes('--verify');
  const isDryRun = !isApply && !isRollback;

  const mode = isRollback ? 'ROLLBACK' : isApply ? 'APPLY' : isVerify ? 'VERIFY' : 'DRY-RUN';
  console.log(`=== Phase 3 Inventory Index Management [${mode}] ===`);

  const mongoUri = options.mongoUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
  const shouldDisconnect = !options.skipDisconnect;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');
  }

  try {
    const collection = InventoryTransaction.collection;
    const existingIndexes = await collection.indexes();
    const existingIndexNames = existingIndexes.map((idx) => idx.name);

    console.log('Existing InventoryTransaction indexes:', existingIndexNames);

    // 1. Check for duplicates on operationKey (excluding null/undefined)
    const duplicates = await collection.aggregate([
      {
        $match: {
          operationKey: { $exists: true, $ne: null, $nin: ['', null] }
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

    if (duplicates.length > 0) {
      console.error(`❌ Duplicate operationKey values detected (${duplicates.length} keys with duplicates):`);
      duplicates.forEach((d) => console.error(`  - Key: ${d._id}, Count: ${d.count}, DocIDs: ${d.docs.join(', ')}`));
      throw new Error(`Cannot create unique index: ${duplicates.length} duplicate operationKey entries found.`);
    }

    console.log('✅ Duplicate check passed: 0 duplicate operationKey entries found.');

    if (isRollback) {
      console.log('Rolling back Phase 3 operationKey index...');
      const targetIndexes = ['operationKey_1', 'unique_inventory_operation_key'];
      for (const target of targetIndexes) {
        if (existingIndexNames.includes(target)) {
          await collection.dropIndex(target);
          console.log(`Dropped index: ${target}`);
        }
      }
      console.log('✅ Phase 3 Index rollback completed.');
      return { success: true, mode: 'ROLLBACK' };
    }

    if (isApply) {
      console.log('Applying Phase 3 indexes...');
      // If a conflicting legacy index exists with a different name on operationKey, drop only that specific index
      if (existingIndexNames.includes('unique_inventory_operation_key')) {
        await collection.dropIndex('unique_inventory_operation_key');
        console.log('Cleaned up legacy named index: unique_inventory_operation_key');
      }

      await InventoryTransaction.createIndexes();
      console.log('✅ Phase 3 InventoryTransaction indexes successfully built and verified.');
      return { success: true, mode: 'APPLY' };
    }

    // Dry-run / Verify mode
    const hasTargetIndex = existingIndexes.some(
      (idx) => (idx.name === INDEX_SPEC.name || idx.name === 'unique_inventory_operation_key') && idx.unique && idx.sparse
    );

    console.log(`Phase 3 Index Status: ${hasTargetIndex ? 'PRESENT & COMPLIANT' : 'PENDING APPLICATION'}`);
    console.log('✅ Dry-run/verify completed with 0 writes performed.');

    return {
      success: true,
      mode: isVerify ? 'VERIFY' : 'DRY-RUN',
      hasTargetIndex,
      duplicateCount: duplicates.length
    };
  } finally {
    if (shouldDisconnect && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }
}

if (require.main === module) {
  managePhase3Indexes().catch((err) => {
    console.error('Phase 3 index management failed:', err.message);
    process.exit(1);
  });
}

module.exports = { managePhase3Indexes, INDEX_SPEC };
