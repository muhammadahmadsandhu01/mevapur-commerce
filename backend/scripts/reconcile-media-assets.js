const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MediaAsset = require('../models/MediaAsset');
const { createStorageProvider } = require('../services/media/StorageProvider');
const { getRuntimeConfig } = require('../config/runtime.config');
const MediaService = require('../services/media/MediaService');

const isApply = process.argv.includes('--apply');

async function reconcileMediaAssets({ customConfig = null, customDbConnected = false } = {}) {
  console.log('--- Durable Media Asset Reconciliation ---');
  console.log(`Mode: ${isApply ? 'APPLY (Executing deletions)' : 'DRY-RUN (Reporting only, default)'}`);

  const runtimeConfig = customConfig || getRuntimeConfig();
  const storageProvider = createStorageProvider(runtimeConfig);

  const rawPrefix = runtimeConfig.storage?.s3?.keyPrefix || 'products/';
  const canonicalPrefix = MediaService.validateStoragePrefix(rawPrefix);
  console.log(`Canonical Storage Prefix: '${canonicalPrefix}'`);

  if (!customDbConnected && mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');
  }

  const report = {
    mode: isApply ? 'APPLY' : 'DRY-RUN',
    canonicalPrefix,
    attempted: 0,
    deleted: 0,
    failed: 0,
    skippedUntilNextRetry: 0,
    retryExhausted: 0,
    staleOrphans: 0,
    outOfPrefixCount: 0,
    affectedAssetIds: [],
    sanitizedReasonCodes: []
  };

  try {
    const now = new Date();

    // 1. Find all deletion candidates
    const allDeletionCandidates = await MediaAsset.find({
      status: { $in: ['deletion_requested', 'deletion_failed'] }
    });

    console.log(`Total deletion candidate documents found: ${allDeletionCandidates.length}`);

    for (const asset of allDeletionCandidates) {
      report.attempted += 1;
      const assetIdStr = String(asset._id);

      // Check if retry exhausted (>= 5 retries)
      if (asset.retryCount >= 5) {
        report.retryExhausted += 1;
        report.affectedAssetIds.push(assetIdStr);
        if (!report.sanitizedReasonCodes.includes('RETRY_EXHAUSTED')) {
          report.sanitizedReasonCodes.push('RETRY_EXHAUSTED');
        }
        console.warn(`[RETRY-EXHAUSTED] Asset ${assetIdStr} has failed 5 times (Key: ${asset.key}). Retained for operator inspection.`);
        continue;
      }

      // Check if waiting for exponential backoff window
      if (asset.nextRetryAt && asset.nextRetryAt > now) {
        report.skippedUntilNextRetry += 1;
        console.log(`[BACKOFF-DELAY] Asset ${assetIdStr} next retry scheduled at ${asset.nextRetryAt}. Skipping.`);
        continue;
      }

      // Prefix Guard: refuse deleting object outside configured canonical prefix
      if (!asset.key.startsWith(canonicalPrefix)) {
        report.outOfPrefixCount += 1;
        report.failed += 1;
        report.affectedAssetIds.push(assetIdStr);
        if (!report.sanitizedReasonCodes.includes('OUT_OF_PREFIX_REJECTED')) {
          report.sanitizedReasonCodes.push('OUT_OF_PREFIX_REJECTED');
        }
        console.error(`[PREFIX-VIOLATION] Asset ${assetIdStr} key '${asset.key}' is outside configured prefix '${canonicalPrefix}'. Refusing deletion.`);
        if (isApply) {
          asset.status = 'deletion_failed';
          asset.lastError = 'OUT_OF_PREFIX_REJECTED';
          await asset.save();
        }
        continue;
      }

      // Execute Deletion
      if (isApply) {
        try {
          await storageProvider.delete({ key: asset.key });
          asset.status = 'deleted';
          asset.lastError = null;
          await asset.save();
          report.deleted += 1;
          report.affectedAssetIds.push(assetIdStr);
        } catch (err) {
          asset.status = 'deletion_failed';
          asset.retryCount += 1;
          asset.lastError = 'DELETION_FAILED';
          asset.nextRetryAt = new Date(Date.now() + 5 * 60 * 1000 * Math.pow(2, asset.retryCount));
          await asset.save();
          report.failed += 1;
          report.affectedAssetIds.push(assetIdStr);
          if (!report.sanitizedReasonCodes.includes('DELETION_FAILED')) {
            report.sanitizedReasonCodes.push('DELETION_FAILED');
          }
        }
      } else {
        console.log(`[DRY-RUN] Would delete asset ${assetIdStr} (Key: ${asset.key}, Retries: ${asset.retryCount})`);
        report.deleted += 1;
        report.affectedAssetIds.push(assetIdStr);
      }
    }

    // 2. Identify stale unattached assets (>24h old in uploading/pending/upload_failed without attached Product)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleOrphans = await MediaAsset.find({
      status: { $in: ['uploading', 'pending', 'upload_failed'] },
      'attachedTo.id': null,
      createdAt: { $lt: oneDayAgo }
    });

    console.log(`Found ${staleOrphans.length} stale unattached orphan media assets (>24h old).`);
    report.staleOrphans = staleOrphans.length;

    for (const orphan of staleOrphans) {
      const orphanIdStr = String(orphan._id);

      if (!orphan.key.startsWith(canonicalPrefix)) {
        report.outOfPrefixCount += 1;
        console.error(`[PREFIX-VIOLATION] Orphan asset ${orphanIdStr} key '${orphan.key}' outside prefix '${canonicalPrefix}'.`);
        continue;
      }

      if (isApply) {
        try {
          await storageProvider.delete({ key: orphan.key });
          orphan.status = 'deleted';
          await orphan.save();
        } catch (err) {
          orphan.status = 'deletion_failed';
          await orphan.save();
        }
      } else {
        console.log(`[DRY-RUN] Would clean up orphan asset ${orphanIdStr} (Key: ${orphan.key}, Status: ${orphan.status})`);
      }
    }

    console.log('\n--- Reconciliation Summary ---');
    console.log(`Attempted: ${report.attempted}`);
    console.log(`Deleted / Planned deletions: ${report.deleted}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Skipped (Backoff): ${report.skippedUntilNextRetry}`);
    console.log(`Retry Exhausted: ${report.retryExhausted}`);
    console.log(`Stale Orphans: ${report.staleOrphans}`);
    console.log(`Out-of-prefix violations: ${report.outOfPrefixCount}`);

    return report;
  } finally {
    if (!customDbConnected && mongoose.connection.readyState !== 0 && require.main === module) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }
}

if (require.main === module) {
  reconcileMediaAssets().catch(err => {
    console.error('Reconciliation failed:', err);
    process.exit(1);
  });
}

module.exports = { reconcileMediaAssets };
