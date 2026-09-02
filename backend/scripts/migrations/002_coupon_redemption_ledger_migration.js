/**
 * Phase 4 Migration: Migrate legacy embedded Coupon.redemptions to CouponRedemption collection
 * Usage: node 002_coupon_redemption_ledger_migration.js [--dry-run|--verify|--apply]
 */
const mongoose = require('mongoose');
const Coupon = require('../../models/Coupon');
const CouponRedemption = require('../../models/CouponRedemption');

async function run() {
  const mode = process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--verify')
      ? 'verify'
      : 'dry-run';

  console.log(`[Coupon Ledger Migration] Running in mode: ${mode.toUpperCase()}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const couponsWithRedemptions = await Coupon.find({
    'redemptions.0': { $exists: true }
  });

  let totalEmbedded = 0;
  let newEntriesToCreate = 0;
  const entriesToInsert = [];

  for (const coupon of couponsWithRedemptions) {
    for (const r of coupon.redemptions) {
      const count = r.count || 1;
      totalEmbedded += count;

      // Check existing committed redemptions for this user/coupon
      const existingCount = await CouponRedemption.countDocuments({
        coupon: coupon._id,
        user: r.user,
        status: 'committed'
      });

      const needed = Math.max(0, count - existingCount);
      for (let i = 0; i < needed; i++) {
        newEntriesToCreate++;
        entriesToInsert.push({
          coupon: coupon._id,
          user: r.user,
          checkoutKey: `MIGRATED-${coupon._id}-${r.user}-${Date.now()}-${i}`,
          status: 'committed',
          discountSnapshot: {
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            discountAmount: coupon.value
          },
          expiresAt: coupon.endDate,
          committedAt: r.lastUsedAt || coupon.updatedAt || new Date()
        });
      }
    }
  }

  console.log(`[Coupon Ledger Migration] Coupons inspected: ${couponsWithRedemptions.length}, Total embedded count: ${totalEmbedded}, Redemptions to create: ${newEntriesToCreate}`);

  if (mode === 'dry-run') {
    console.log('[Coupon Ledger Migration] Dry-run complete. Sample entries (up to 5):', entriesToInsert.slice(0, 5));
  } else if (mode === 'apply') {
    if (entriesToInsert.length > 0) {
      await CouponRedemption.insertMany(entriesToInsert, { ordered: false });
    }
    console.log(`[Coupon Ledger Migration] Successfully inserted ${entriesToInsert.length} ledger records.`);
  } else if (mode === 'verify') {
    const totalCommitted = await CouponRedemption.countDocuments({ status: 'committed' });
    console.log(`[Coupon Ledger Migration] Verification: Total committed redemptions in ledger is ${totalCommitted}.`);
  }

  if (require.main === module) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[Coupon Ledger Migration] Error:', err);
    process.exit(1);
  });
}

module.exports = { run };
