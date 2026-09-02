/**
 * Script to reconcile and release expired coupon reservations
 * Usage: node reconcileCouponReservations.js [--dry-run|--verify|--apply] [--batch-size=100] [--max-batches=10]
 */
const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const CouponService = require('../services/order/CouponService');

function parsePositiveIntArg(flag, defaultValue, min, max) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!arg) return defaultValue;
  const val = parseInt(arg.split('=')[1], 10);
  if (isNaN(val) || val < min || val > max) return defaultValue;
  return val;
}

async function run({ batchSize = 100, maxBatches = 10, mode: explicitMode = null } = {}) {
  const mode = explicitMode || (
    process.argv.includes('--apply')
      ? 'apply'
      : process.argv.includes('--verify')
        ? 'verify'
        : 'dry-run'
  );

  const effectiveBatchSize = Math.max(1, Math.min(500, parsePositiveIntArg('--batch-size', batchSize, 1, 500)));
  const effectiveMaxBatches = Math.max(1, Math.min(50, parsePositiveIntArg('--max-batches', maxBatches, 1, 50)));

  console.log(`[Coupon Reservation Reconciliation] Mode: ${mode.toUpperCase()} (BatchSize: ${effectiveBatchSize}, MaxBatches: ${effectiveMaxBatches})`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const now = new Date();
  let totalProcessed = 0;
  let totalReleased = 0;
  let batchesRun = 0;

  while (batchesRun < effectiveMaxBatches) {
    batchesRun++;
    // Deterministic FIFO ordering with bounded limit
    // ONLY selects status: 'reserved' with expiresAt <= now
    const expiredReservations = await CouponRedemption.find({
      status: 'reserved',
      expiresAt: { $lte: now }
    })
      .sort({ expiresAt: 1, _id: 1 })
      .limit(effectiveBatchSize);

    if (expiredReservations.length === 0) {
      break;
    }

    totalProcessed += expiredReservations.length;

    if (mode === 'dry-run') {
      console.log(`[Coupon Reservation Reconciliation] Batch ${batchesRun}: Found ${expiredReservations.length} expired reservations awaiting release.`);
      // In dry run, stop after reporting the first batch
      break;
    } else if (mode === 'verify') {
      console.warn(`[Coupon Reservation Reconciliation] Verification found ${expiredReservations.length} expired reservations in batch ${batchesRun}.`);
      break;
    } else if (mode === 'apply') {
      for (const reservation of expiredReservations) {
        // Atomic conditional release requiring exact _id, status === 'reserved', and expiresAt <= now
        const res = await CouponService.releaseExpiredReservation({
          reservationId: reservation._id,
          asOfDate: now
        });
        if (res?.released) {
          totalReleased++;
        }
      }
    }
  }

  const remainingCount = await CouponRedemption.countDocuments({
    status: 'reserved',
    expiresAt: { $lte: now }
  });

  const summary = {
    mode,
    batchesRun,
    totalProcessed,
    totalReleased,
    remainingCount
  };

  console.log('[Coupon Reservation Reconciliation] Summary:', summary);
  return summary;
}

if (require.main === module) {
  run().then(async () => {
    await mongoose.disconnect();
  }).catch((err) => {
    console.error('[Coupon Reservation Reconciliation] Error:', err);
    process.exit(1);
  });
}

module.exports = { run };
