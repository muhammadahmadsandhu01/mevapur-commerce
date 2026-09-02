/**
 * Phase 4 Migration: Backfill canonical Review.status from legacy boolean fields
 * Usage: node 001_review_moderation_state_backfill.js [--dry-run|--verify|--apply]
 */
const mongoose = require('mongoose');
const path = require('path');
const Review = require('../../models/Review');

async function run() {
  const mode = process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--verify')
      ? 'verify'
      : 'dry-run';

  console.log(`[Review Status Backfill] Running in mode: ${mode.toUpperCase()}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
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
  } else if (mode === 'apply') {
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
    console.log(`[Review Status Backfill] Successfully updated ${toUpdate} reviews.`);
  } else if (mode === 'verify') {
    const unaligned = await Review.countDocuments({
      $or: [
        { status: 'approved', isApproved: false },
        { status: 'flagged', isFlagged: false },
        { status: 'pending', $or: [{ isApproved: true }, { isFlagged: true }] }
      ]
    });
    if (unaligned > 0) {
      console.error(`[Review Status Backfill] Verification failed: ${unaligned} reviews are unaligned.`);
      process.exitCode = 1;
    } else {
      console.log('[Review Status Backfill] Verification passed: 100% canonical alignment.');
    }
  }

  if (require.main === module) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[Review Status Backfill] Error:', err);
    process.exit(1);
  });
}

module.exports = { run };
