/**
 * Script to reconcile and release expired coupon reservations
 * Usage: node reconcileCouponReservations.js [--dry-run|--verify|--apply]
 */
const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const CouponService = require('../services/order/CouponService');

async function run() {
  const mode = process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--verify')
      ? 'verify'
      : 'dry-run';

  console.log(`[Coupon Reservation Reconciliation] Running in mode: ${mode.toUpperCase()}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const now = new Date();
  const expiredReservations = await CouponRedemption.find({
    status: 'reserved',
    expiresAt: { $lt: now }
  });

  console.log(`[Coupon Reservation Reconciliation] Found ${expiredReservations.length} expired reservations.`);

  if (mode === 'dry-run') {
    console.log('[Coupon Reservation Reconciliation] Dry run complete. Sample expired:', expiredReservations.slice(0, 5).map((r) => ({
      id: r._id,
      checkoutKey: r.checkoutKey,
      coupon: r.coupon,
      expiresAt: r.expiresAt
    })));
  } else if (mode === 'apply') {
    let releasedCount = 0;
    for (const reservation of expiredReservations) {
      await CouponService.restoreUsage({
        checkoutKey: reservation.checkoutKey,
        couponSnapshot: { couponId: reservation.coupon },
        releaseReason: 'reservation_expired'
      });
      releasedCount++;
    }
    console.log(`[Coupon Reservation Reconciliation] Successfully reconciled and released ${releasedCount} expired reservations.`);
  } else if (mode === 'verify') {
    if (expiredReservations.length > 0) {
      console.warn(`[Coupon Reservation Reconciliation] Warning: ${expiredReservations.length} expired reservations awaiting release.`);
    } else {
      console.log('[Coupon Reservation Reconciliation] Verification passed: 0 orphaned expired reservations.');
    }
  }

  if (require.main === module) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[Coupon Reservation Reconciliation] Error:', err);
    process.exit(1);
  });
}

module.exports = { run };
