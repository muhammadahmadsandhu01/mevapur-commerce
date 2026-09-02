/**
 * Phase 4 Migration: Backfill canonical Review.status from legacy boolean fields
 * Usage: node 001_review_moderation_state_backfill.js [--dry-run|--verify|--apply]
 */
const mongoose = require('mongoose');
const Review = require('../../models/Review');
const ReviewReport = require('../../models/ReviewReport');

async function ensureIndexSafe(collection, keySpec, options = {}) {
  const existingIndexes = await collection.indexes().catch(() => []);
  const indexName = options.name || Object.entries(keySpec).map(([k, v]) => `${k}_${v}`).join('_');

  const matching = existingIndexes.find((idx) => {
    if (idx.name === indexName) return true;
    const idxKeyKeys = Object.keys(idx.key || {});
    const targetKeyKeys = Object.keys(keySpec);
    if (idxKeyKeys.length === targetKeyKeys.length && idxKeyKeys.every((k) => keySpec[k] === idx.key[k])) {
      return true;
    }
    return false;
  });

  if (matching) {
    const uniqueMismatch = Boolean(options.unique) !== Boolean(matching.unique);
    if (uniqueMismatch) {
      throw new Error(`Conflicting index exists on collection '${collection.collectionName}' for '${indexName}'`);
    }
    return { created: false, name: matching.name, alreadyExists: true };
  }
  await collection.createIndex(keySpec, { ...options, name: indexName });
  return { created: true, name: indexName };
}

async function run({ mode: explicitMode = null } = {}) {
  const mode = explicitMode || (
    process.argv.includes('--apply')
      ? 'apply'
      : process.argv.includes('--verify')
        ? 'verify'
        : 'dry-run'
  );

  console.log(`[Review Status Backfill] Running in mode: ${mode.toUpperCase()}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const reviewCollection = mongoose.connection.collection('reviews');
  const reportCollection = mongoose.connection.collection('reviewreports');
  const checkpointCollection = mongoose.connection.collection('_migration_checkpoints');

  // Controlled index provisioning definitions
  const indexSpecs = [
    {
      collection: reviewCollection,
      spec: { product: 1, status: 1, createdAt: -1 },
      options: { name: 'product_1_status_1_createdAt_-1' }
    },
    {
      collection: reviewCollection,
      spec: { status: 1, createdAt: -1 },
      options: { name: 'status_1_createdAt_-1' }
    },
    {
      collection: reportCollection,
      spec: { review: 1, reporter: 1 },
      options: {
        name: 'unique_active_review_report',
        unique: true,
        partialFilterExpression: { status: 'pending' }
      }
    },
    {
      collection: reportCollection,
      spec: { review: 1, status: 1 },
      options: { name: 'review_1_status_1' }
    }
  ];

  // Preflight duplicate check for ReviewReport unique partial index
  const duplicatePendingReports = await reportCollection.aggregate([
    { $match: { status: 'pending' } },
    { $group: { _id: { review: '$review', reporter: '$reporter' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (duplicatePendingReports.length > 0) {
    throw new Error(`Preflight failure: ${duplicatePendingReports.length} duplicate pending reports exist on reviewreports`);
  }

  const allReviews = await Review.find({});
  let toUpdate = 0;
  let alreadyCanonical = 0;
  const plan = [];

  for (const review of allReviews) {
    let targetStatus;
    if (review.isFlagged) {
      targetStatus = 'flagged';
    } else if (review.isApproved) {
      targetStatus = 'approved';
    } else {
      targetStatus = 'pending';
    }

    if (review.status !== targetStatus) {
      toUpdate++;
      plan.push({
        id: review._id,
        currentStatus: review.status,
        targetStatus,
        isApproved: review.isApproved,
        isFlagged: review.isFlagged
      });
    } else {
      alreadyCanonical++;
    }
  }

  console.log(`[Review Status Backfill] Total: ${allReviews.length}, Already canonical: ${alreadyCanonical}, Needing update: ${toUpdate}`);

  if (mode === 'dry-run') {
    console.log('[Review Status Backfill] Dry-run complete. Sample changes (up to 5):', plan.slice(0, 5));
    return { mode, total: allReviews.length, toUpdate, plannedWrites: plan.length };
  }

  if (mode === 'apply') {
    // 1. Provision controlled indexes
    for (const idx of indexSpecs) {
      await ensureIndexSafe(idx.collection, idx.spec, idx.options);
    }

    // 2. Perform backfill writes
    for (const item of plan) {
      await Review.updateOne(
        { _id: item.id },
        {
          $set: {
            status: item.targetStatus,
            isApproved: item.targetStatus === 'approved',
            isFlagged: item.targetStatus === 'flagged'
          }
        }
      );
    }

    // 3. Save DB-backed checkpoint
    await checkpointCollection.updateOne(
      { migrationId: '001_review_moderation_state_backfill' },
      {
        $set: {
          migrationId: '001_review_moderation_state_backfill',
          appliedAt: new Date(),
          updatedCount: toUpdate,
          status: 'completed'
        }
      },
      { upsert: true }
    );

    console.log(`[Review Status Backfill] Successfully updated ${toUpdate} reviews and provisioned indexes.`);
    return { mode, updated: toUpdate };
  }

  if (mode === 'verify') {
    const unaligned = await Review.countDocuments({
      $or: [
        { status: 'approved', isApproved: false },
        { status: 'flagged', isFlagged: false },
        { status: 'pending', $or: [{ isApproved: true }, { isFlagged: true }] }
      ]
    });

    if (unaligned > 0) {
      console.error(`[Review Status Backfill] Verification failed: ${unaligned} reviews are unaligned.`);
      throw new Error(`Verification failed: ${unaligned} reviews are unaligned.`);
    }

    console.log('[Review Status Backfill] Verification passed: 100% canonical alignment.');
    return { mode, unaligned: 0 };
  }
}

if (require.main === module) {
  run().then(async () => {
    await mongoose.disconnect();
  }).catch((err) => {
    console.error('[Review Status Backfill] Error:', err);
    process.exit(1);
  });
}

module.exports = { run, ensureIndexSafe };
