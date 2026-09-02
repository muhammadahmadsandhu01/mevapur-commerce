/**
 * Phase 4 Migration: Migrate legacy embedded Coupon.redemptions to CouponRedemption collection
 * Usage: node 002_coupon_redemption_ledger_migration.js [--dry-run|--verify|--apply]
 */
const mongoose = require('mongoose');
const Coupon = require('../../models/Coupon');
const CouponRedemption = require('../../models/CouponRedemption');
const { ensureIndexSafe } = require('./001_review_moderation_state_backfill');

async function run({ mode: explicitMode = null } = {}) {
  const mode = explicitMode || (
    process.argv.includes('--apply')
      ? 'apply'
      : process.argv.includes('--verify')
        ? 'verify'
        : 'dry-run'
  );

  console.log(`[Coupon Ledger Migration] Running in mode: ${mode.toUpperCase()}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const couponCollection = mongoose.connection.collection('coupons');
  const redemptionCollection = mongoose.connection.collection('couponredemptions');
  const checkpointCollection = mongoose.connection.collection('_migration_checkpoints');

  // Controlled index provisioning definitions
  const indexSpecs = [
    {
      collection: couponCollection,
      spec: { code: 1 },
      options: { name: 'code_1', unique: true }
    },
    {
      collection: couponCollection,
      spec: { status: 1, startDate: 1, endDate: 1 },
      options: { name: 'status_1_startDate_1_endDate_1' }
    },
    {
      collection: redemptionCollection,
      spec: { coupon: 1, checkoutKey: 1 },
      options: { name: 'unique_coupon_checkout_key', unique: true }
    },
    {
      collection: redemptionCollection,
      spec: { coupon: 1, user: 1, status: 1 },
      options: { name: 'coupon_1_user_1_status_1' }
    },
    {
      collection: redemptionCollection,
      spec: { coupon: 1, orderId: 1 },
      options: {
        name: 'unique_coupon_order_commit',
        unique: true,
        partialFilterExpression: { orderId: { $type: 'objectId' } }
      }
    },
    {
      collection: redemptionCollection,
      spec: { status: 1, expiresAt: 1 },
      options: { name: 'status_1_expiresAt_1' }
    }
  ];

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
          checkoutKey: `MIGRATED-${coupon._id}-${r.user}-${i}`,
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
    return { mode, totalEmbedded, newEntriesToCreate, plannedWrites: entriesToInsert.length };
  }

  if (mode === 'apply') {
    // 1. Provision controlled indexes
    for (const idx of indexSpecs) {
      await ensureIndexSafe(idx.collection, idx.spec, idx.options);
    }

    // 2. Insert ledger entries
    if (entriesToInsert.length > 0) {
      await CouponRedemption.insertMany(entriesToInsert, { ordered: false });
    }

    // 3. Save DB-backed checkpoint
    await checkpointCollection.updateOne(
      { migrationId: '002_coupon_redemption_ledger_migration' },
      {
        $set: {
          migrationId: '002_coupon_redemption_ledger_migration',
          appliedAt: new Date(),
          insertedCount: entriesToInsert.length,
          status: 'completed'
        }
      },
      { upsert: true }
    );

    console.log(`[Coupon Ledger Migration] Successfully inserted ${entriesToInsert.length} ledger records and provisioned indexes.`);
    return { mode, inserted: entriesToInsert.length };
  }

  if (mode === 'verify') {
    const totalCommitted = await CouponRedemption.countDocuments({ status: 'committed' });
    console.log(`[Coupon Ledger Migration] Verification: Total committed redemptions in ledger is ${totalCommitted}.`);
    return { mode, totalCommitted };
  }
}

if (require.main === module) {
  run().then(async () => {
    await mongoose.disconnect();
  }).catch((err) => {
    console.error('[Coupon Ledger Migration] Error:', err);
    process.exit(1);
  });
}

module.exports = { run };
