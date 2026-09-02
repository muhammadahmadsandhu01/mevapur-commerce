/**
 * Database-backed review ratings & counts reconciliation script
 * Usage: node reconcileReviewRatings.js [--dry-run|--verify|--apply]
 */
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');
const ReviewService = require('../services/ReviewService');

async function run() {
  const mode = process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--verify')
      ? 'verify'
      : 'dry-run';

  console.log(`[Review Ratings Reconciliation] Running in mode: ${mode.toUpperCase()}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const products = await Product.find({});
  let discrepancies = 0;
  const plan = [];

  for (const product of products) {
    const approvedReviews = await Review.aggregate([
      { $match: { product: product._id, status: 'approved' } },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } }
    ]);

    const actualCount = approvedReviews[0]?.count || 0;
    const actualAvg = actualCount > 0 ? Math.round((approvedReviews[0].avg + Number.EPSILON) * 10) / 10 : 0;

    const currentRating = product.rating || 0;
    const currentCount = product.reviewCount || 0;

    if (currentRating !== actualAvg || currentCount !== actualCount) {
      discrepancies++;
      plan.push({
        productId: product._id,
        name: product.name,
        current: { rating: currentRating, reviewCount: currentCount },
        target: { rating: actualAvg, reviewCount: actualCount }
      });
    }
  }

  console.log(`[Review Ratings Reconciliation] Checked ${products.length} products. Discrepancies found: ${discrepancies}`);

  if (mode === 'dry-run') {
    console.log('[Review Ratings Reconciliation] Dry-run plan (sample 5):', plan.slice(0, 5));
  } else if (mode === 'apply') {
    for (const item of plan) {
      await ReviewService.recalculateProductRating(item.productId);
    }
    console.log(`[Review Ratings Reconciliation] Successfully reconciled ${plan.length} products.`);
  } else if (mode === 'verify') {
    if (discrepancies > 0) {
      console.error(`[Review Ratings Reconciliation] Verification failed: ${discrepancies} products out of sync.`);
      process.exitCode = 1;
    } else {
      console.log('[Review Ratings Reconciliation] Verification passed: All product ratings and review counts 100% synchronized.');
    }
  }

  if (require.main === module) {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[Review Ratings Reconciliation] Error:', err);
    process.exit(1);
  });
}

module.exports = { run };
