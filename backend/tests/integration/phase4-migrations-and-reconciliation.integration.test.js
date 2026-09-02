const mongoose = require('mongoose');
const Review = require('../../models/Review');
const ReviewReport = require('../../models/ReviewReport');
const Coupon = require('../../models/Coupon');
const CouponRedemption = require('../../models/CouponRedemption');
const User = require('../../models/User');
const Product = require('../../models/Product');
const CouponService = require('../../services/order/CouponService');
const reviewMigration = require('../../scripts/migrations/001_review_moderation_state_backfill');
const couponMigration = require('../../scripts/migrations/002_coupon_redemption_ledger_migration');
const reservationReconciliation = require('../../scripts/reconcileCouponReservations');

describe('Phase 4 Migrations, Index Provisioning & Reconciliation Integration Tests', () => {
  let user1;
  let user2;
  let testProduct;

  beforeEach(async () => {
    user1 = await User.create({
      fullName: 'Migration User 1',
      email: 'm1@example.com',
      password: 'Password123!',
      role: 'customer'
    });

    user2 = await User.create({
      fullName: 'Migration User 2',
      email: 'm2@example.com',
      password: 'Password123!',
      role: 'customer'
    });

    testProduct = await Product.create({
      name: 'Migration Product',
      slug: 'migration-product',
      price: 500,
      stock: 100,
      category: new mongoose.Types.ObjectId()
    });
  });

  describe('Review Moderation State Backfill Migration', () => {
    test('dry-run performs zero writes and reports planned writes', async () => {
      // Seed unaligned review directly into collection (bypassing pre-save hooks)
      const r1Id = new mongoose.Types.ObjectId();
      await Review.collection.insertOne({
        _id: r1Id,
        user: user1._id,
        product: testProduct._id,
        rating: 5,
        title: 'Great',
        comment: 'Nice',
        isApproved: true,
        isFlagged: false,
        status: 'pending', // unaligned
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await reviewMigration.run({ mode: 'dry-run' });

      expect(result.mode).toBe('dry-run');
      expect(result.plannedWrites).toBeGreaterThanOrEqual(1);

      // Verify DB remains untouched
      const fetched = await Review.findById(r1Id);
      expect(fetched.status).toBe('pending');
    });

    test('deterministic legacy mapping & apply persists canonical status and creates indexes', async () => {
      const r1Id = new mongoose.Types.ObjectId();
      const r2Id = new mongoose.Types.ObjectId();

      // Review 1: isFlagged=true -> 'flagged'
      await Review.collection.insertOne({
        _id: r1Id,
        user: user1._id,
        product: testProduct._id,
        rating: 1,
        title: 'Spam',
        comment: 'Buy now',
        isApproved: false,
        isFlagged: true,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Review 2: isApproved=true -> 'approved'
      await Review.collection.insertOne({
        _id: r2Id,
        user: user2._id,
        product: testProduct._id,
        rating: 5,
        title: 'Awesome',
        comment: 'Love it',
        isApproved: true,
        isFlagged: false,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const applyRes = await reviewMigration.run({ mode: 'apply' });
      expect(applyRes.updated).toBeGreaterThanOrEqual(2);

      const updated1 = await Review.findById(r1Id);
      const updated2 = await Review.findById(r2Id);

      expect(updated1.status).toBe('flagged');
      expect(updated2.status).toBe('approved');

      // Verify checkpoint written
      const checkpoint = await mongoose.connection.collection('_migration_checkpoints').findOne({
        migrationId: '001_review_moderation_state_backfill'
      });
      expect(checkpoint).toBeTruthy();
      expect(checkpoint.status).toBe('completed');

      // Verify idempotency on rerun
      const rerunRes = await reviewMigration.run({ mode: 'apply' });
      expect(rerunRes.updated).toBe(0);

      // Verify verify mode passes
      const verifyRes = await reviewMigration.run({ mode: 'verify' });
      expect(verifyRes.unaligned).toBe(0);
    });

    test('ensureIndexSafe fails closed when conflicting index exists', async () => {
      const collection = mongoose.connection.collection('test_index_conflict');
      await collection.createIndex({ keyA: 1 }, { name: 'test_conflict_idx', unique: false });

      await expect(
        reviewMigration.ensureIndexSafe(collection, { keyA: 1 }, { name: 'test_conflict_idx', unique: true })
      ).rejects.toThrow(/Conflicting index exists/);
    });
  });

  describe('Coupon Redemption Ledger Migration', () => {
    test('dry-run performs zero writes and reports planned ledger entries', async () => {
      const coupon = await Coupon.create({
        code: 'LEGACY10',
        type: 'percentage',
        value: 10,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        usedCount: 2,
        redemptions: [
          { user: user1._id, count: 1, lastUsedAt: new Date() },
          { user: user2._id, count: 1, lastUsedAt: new Date() }
        ]
      });

      const dryRunRes = await couponMigration.run({ mode: 'dry-run' });
      expect(dryRunRes.mode).toBe('dry-run');
      expect(dryRunRes.plannedWrites).toBe(2);

      const ledgerCount = await CouponRedemption.countDocuments({ coupon: coupon._id });
      expect(ledgerCount).toBe(0);
    });

    test('apply migrates embedded records and rerun creates zero duplicates', async () => {
      const coupon = await Coupon.create({
        code: 'LEGACY20',
        type: 'percentage',
        value: 20,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        usedCount: 2,
        redemptions: [
          { user: user1._id, count: 1, lastUsedAt: new Date() },
          { user: user2._id, count: 1, lastUsedAt: new Date() }
        ]
      });

      const applyRes = await couponMigration.run({ mode: 'apply' });
      expect(applyRes.inserted).toBe(2);

      const ledgerCount = await CouponRedemption.countDocuments({ coupon: coupon._id });
      expect(ledgerCount).toBe(2);

      // Rerun apply
      const rerunRes = await couponMigration.run({ mode: 'apply' });
      expect(rerunRes.inserted).toBe(0);

      const ledgerCountAfterRerun = await CouponRedemption.countDocuments({ coupon: coupon._id });
      expect(ledgerCountAfterRerun).toBe(2);

      // Verify mode passes
      const verifyRes = await couponMigration.run({ mode: 'verify' });
      expect(verifyRes.totalCommitted).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Coupon Reservation Bounded Reconciliation Worker', () => {
    test('releases only expired reserved records and leaves non-expired/committed records untouched', async () => {
      const coupon = await Coupon.create({
        code: 'RECON1',
        type: 'fixed',
        value: 50,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        usedCount: 3
      });

      // Expired reservation
      const expiredRes = await CouponRedemption.create({
        coupon: coupon._id,
        user: user1._id,
        checkoutKey: 'EXP-1',
        status: 'reserved',
        discountSnapshot: { code: 'RECON1', type: 'fixed', value: 50, discountAmount: 50 },
        expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
      });

      // Non-expired reservation
      const activeRes = await CouponRedemption.create({
        coupon: coupon._id,
        user: user2._id,
        checkoutKey: 'ACTIVE-1',
        status: 'reserved',
        discountSnapshot: { code: 'RECON1', type: 'fixed', value: 50, discountAmount: 50 },
        expiresAt: new Date(Date.now() + 1800000) // 30 min in future
      });

      // Committed redemption
      const committedRes = await CouponRedemption.create({
        coupon: coupon._id,
        user: user1._id,
        checkoutKey: 'COMMITTED-1',
        status: 'committed',
        discountSnapshot: { code: 'RECON1', type: 'fixed', value: 50, discountAmount: 50 },
        expiresAt: new Date(Date.now() - 3600000)
      });

      const reconSummary = await reservationReconciliation.run({
        mode: 'apply',
        batchSize: 10,
        maxBatches: 2
      });

      expect(reconSummary.totalReleased).toBe(1);

      // Check statuses
      const updatedExpired = await CouponRedemption.findById(expiredRes._id);
      const updatedActive = await CouponRedemption.findById(activeRes._id);
      const updatedCommitted = await CouponRedemption.findById(committedRes._id);

      expect(updatedExpired.status).toBe('released');
      expect(updatedActive.status).toBe('reserved');
      expect(updatedCommitted.status).toBe('committed');

      // Coupon usedCount decremented by 1
      const updatedCoupon = await Coupon.findById(coupon._id);
      expect(updatedCoupon.usedCount).toBe(2);

      // Second run is completely idempotent
      const secondRun = await reservationReconciliation.run({
        mode: 'apply',
        batchSize: 10,
        maxBatches: 2
      });
      expect(secondRun.totalReleased).toBe(0);

      const couponAfterSecondRun = await Coupon.findById(coupon._id);
      expect(couponAfterSecondRun.usedCount).toBe(2);
    });

    test('two concurrent workers cannot double-release the same expired reservation', async () => {
      const coupon = await Coupon.create({
        code: 'CONCURRENT-RECON',
        type: 'fixed',
        value: 50,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        usedCount: 1
      });

      await CouponRedemption.create({
        coupon: coupon._id,
        user: user1._id,
        checkoutKey: 'CONCURRENT-EXP',
        status: 'reserved',
        discountSnapshot: { code: 'CONCURRENT-RECON', type: 'fixed', value: 50, discountAmount: 50 },
        expiresAt: new Date(Date.now() - 3600000)
      });

      // Run two worker instances concurrently
      const [worker1, worker2] = await Promise.all([
        reservationReconciliation.run({ mode: 'apply', batchSize: 10 }),
        reservationReconciliation.run({ mode: 'apply', batchSize: 10 })
      ]);

      const totalReleasedAcrossWorkers = worker1.totalReleased + worker2.totalReleased;
      expect(totalReleasedAcrossWorkers).toBe(1);

      const finalCoupon = await Coupon.findById(coupon._id);
      expect(finalCoupon.usedCount).toBe(0);
    });
  });
});
