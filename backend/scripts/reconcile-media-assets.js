const mongoose = require('mongoose');

const MediaAsset = require('../models/MediaAsset');
const Product = require('../models/Product');
const { createStorageProvider } = require('../services/media/StorageProvider');
const { getRuntimeConfig } = require('../config/runtime.config');
const MediaService = require('../services/media/MediaService');
const { parseMigrationCli, validateTargetAndDbConfig } = require('./lib/migrationRuntimeGuard');

async function reconcileMediaAssets({
  argv = process.argv.slice(2),
  customConfig = null,
  customDbConnected = false,
  customStorageProvider = null,
  env = process.env
} = {}) {
  // 1. Strict CLI Argument Parsing
  const cli = parseMigrationCli(argv, {
    allowedModes: ['--dry-run', '--apply'],
    allowedFlags: ['--confirm-media-reconciliation', '--confirm-production-media-reconciliation'],
    requiredConfirmationMap: {
      apply: {
        staging: ['--confirm-media-reconciliation'],
        production: ['--confirm-media-reconciliation', '--confirm-production-media-reconciliation'],
        local: ['--confirm-media-reconciliation']
      }
    }
  });

  const isApply = cli.isApply;

  console.log('--- Durable Media Asset Reconciliation ---');
  console.log(`Mode: ${isApply ? 'APPLY (Executing deletions)' : 'DRY-RUN (Reporting only, default)'}`);
  console.log(`Target: ${cli.target}`);

  // 2. Validate DB Target and Identity Fingerprint
  const dbConfig = validateTargetAndDbConfig({
    target: cli.target,
    hasAllowLocal: cli.hasAllowLocal,
    env
  });

  console.log(`Database Fingerprint: ${dbConfig.sanitizedFingerprint}`);

  let runtimeConfig = customConfig;
  if (!runtimeConfig) {
    try {
      runtimeConfig = getRuntimeConfig(env);
    } catch {
      runtimeConfig = { storage: { provider: 'mock', s3: { keyPrefix: 'products/' } } };
    }
  }
  const storageProvider = customStorageProvider || createStorageProvider(runtimeConfig);

  const rawPrefix = runtimeConfig?.storage?.s3?.keyPrefix || 'products/';
  const canonicalPrefix = MediaService.validateStoragePrefix(rawPrefix);
  console.log(`Canonical Storage Prefix: '${canonicalPrefix}'`);

  let shouldDisconnect = false;
  if (!customDbConnected && mongoose.connection.readyState === 0) {
    await mongoose.connect(dbConfig.mongoUri);
    console.log('Connected to MongoDB.');
    shouldDisconnect = true;
  }

  const report = {
    mode: isApply ? 'APPLY' : 'DRY-RUN',
    target: cli.target,
    canonicalPrefix,
    attempted: 0,
    deleted: 0,
    failed: 0,
    skippedUntilNextRetry: 0,
    retryExhausted: 0,
    staleOrphans: 0,
    quarantinedAttached: 0,
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
        console.warn(`[RETRY-EXHAUSTED] Asset ${assetIdStr} has failed 5 times. Retained for operator inspection.`);
        continue;
      }

      // Check if waiting for exponential backoff window
      if (asset.nextRetryAt && asset.nextRetryAt > now) {
        report.skippedUntilNextRetry += 1;
        console.log(`[BACKOFF-DELAY] Asset ${assetIdStr} next retry scheduled at ${asset.nextRetryAt}. Skipping.`);
        continue;
      }

      // Key & Prefix Security Guard
      const keyValidation = MediaService.validateObjectKey(asset.key, canonicalPrefix);
      if (!keyValidation.valid) {
        report.outOfPrefixCount += 1;
        report.failed += 1;
        report.affectedAssetIds.push(assetIdStr);
        const reason = keyValidation.reason === 'OUT_OF_PREFIX' ? 'OUT_OF_PREFIX_REJECTED' : 'UNSAFE_KEY_REJECTED';
        if (!report.sanitizedReasonCodes.includes(reason)) {
          report.sanitizedReasonCodes.push(reason);
        }
        console.error(`[PREFIX-VIOLATION] Asset ${assetIdStr} key '${asset.key}' failed validation (${keyValidation.reason}). Refusing deletion.`);
        if (isApply) {
          await MediaAsset.findOneAndUpdate(
            { _id: asset._id },
            { $set: { status: 'deletion_failed', lastError: reason } }
          );
        }
        continue;
      }

      // Active Product Attachment Safety Guard: check if referenced by any Product
      const isAttached = await Product.exists({
        $or: [
          { _id: asset.attachedTo?.id },
          { mediaAssetIds: asset._id },
          { primaryMediaAssetId: asset._id },
          { 'variants.mediaAssetIds': asset._id }
        ]
      });

      if (isAttached) {
        report.quarantinedAttached += 1;
        if (!report.sanitizedReasonCodes.includes('STILL_ATTACHED_TO_PRODUCT')) {
          report.sanitizedReasonCodes.push('STILL_ATTACHED_TO_PRODUCT');
        }
        console.warn(`[ATTACHED-PRESERVED] Asset ${assetIdStr} is still referenced by a Product. Preserving from deletion.`);
        continue;
      }

      // Execute Deletion
      if (isApply) {
        try {
          await storageProvider.delete({ key: keyValidation.normalizedKey });
          await MediaAsset.findOneAndUpdate(
            { _id: asset._id, status: { $in: ['deletion_requested', 'deletion_failed'] } },
            { $set: { status: 'deleted', lastError: null } }
          );
          report.deleted += 1;
          report.affectedAssetIds.push(assetIdStr);
        } catch (err) {
          const isNotFound = err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
          if (isNotFound) {
            await MediaAsset.findOneAndUpdate(
              { _id: asset._id },
              { $set: { status: 'deleted', lastError: 'OBJECT_ALREADY_MISSING_ON_PROVIDER' } }
            );
            report.deleted += 1;
            report.affectedAssetIds.push(assetIdStr);
          } else {
            await MediaAsset.findOneAndUpdate(
              { _id: asset._id },
              {
                $set: {
                  status: 'deletion_failed',
                  lastError: 'DELETION_FAILED',
                  nextRetryAt: new Date(Date.now() + 5 * 60 * 1000 * Math.pow(2, asset.retryCount + 1))
                },
                $inc: { retryCount: 1 }
              }
            );
            report.failed += 1;
            report.affectedAssetIds.push(assetIdStr);
            if (!report.sanitizedReasonCodes.includes('DELETION_FAILED')) {
              report.sanitizedReasonCodes.push('DELETION_FAILED');
            }
          }
        }
      } else {
        console.log(`[DRY-RUN] Would delete asset ${assetIdStr} (Retries: ${asset.retryCount})`);
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

      const keyValidation = MediaService.validateObjectKey(orphan.key, canonicalPrefix);
      if (!keyValidation.valid) {
        report.outOfPrefixCount += 1;
        console.error(`[PREFIX-VIOLATION] Orphan asset ${orphanIdStr} outside prefix '${canonicalPrefix}'.`);
        continue;
      }

      const orphanAttached = await Product.exists({
        $or: [
          { mediaAssetIds: orphan._id },
          { primaryMediaAssetId: orphan._id },
          { 'variants.mediaAssetIds': orphan._id }
        ]
      });

      if (orphanAttached) {
        report.quarantinedAttached += 1;
        if (!report.sanitizedReasonCodes.includes('STILL_ATTACHED_TO_PRODUCT')) {
          report.sanitizedReasonCodes.push('STILL_ATTACHED_TO_PRODUCT');
        }
        console.warn(`[ATTACHED-PRESERVED] Orphan asset ${orphanIdStr} is referenced by a Product. Preserving from deletion.`);
        continue;
      }

      if (isApply) {
        try {
          await storageProvider.delete({ key: keyValidation.normalizedKey });
          await MediaAsset.findOneAndUpdate(
            { _id: orphan._id },
            { $set: { status: 'deleted', lastError: null } }
          );
        } catch (err) {
          const isNotFound = err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
          if (isNotFound) {
            await MediaAsset.findOneAndUpdate(
              { _id: orphan._id },
              { $set: { status: 'deleted', lastError: 'OBJECT_ALREADY_MISSING_ON_PROVIDER' } }
            );
          } else {
            await MediaAsset.findOneAndUpdate(
              { _id: orphan._id },
              {
                $set: {
                  status: 'deletion_failed',
                  lastError: 'DELETION_FAILED',
                  nextRetryAt: new Date(Date.now() + 5 * 60 * 1000 * Math.pow(2, orphan.retryCount + 1))
                },
                $inc: { retryCount: 1 }
              }
            );
          }
        }
      } else {
        console.log(`[DRY-RUN] Would clean up orphan asset ${orphanIdStr} (Status: ${orphan.status})`);
      }
    }

    console.log('\n--- Reconciliation Summary ---');
    console.log(`Attempted: ${report.attempted}`);
    console.log(`Deleted / Planned deletions: ${report.deleted}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Skipped (Backoff): ${report.skippedUntilNextRetry}`);
    console.log(`Retry Exhausted: ${report.retryExhausted}`);
    console.log(`Quarantined (Attached to Product): ${report.quarantinedAttached}`);
    console.log(`Stale Orphans: ${report.staleOrphans}`);
    console.log(`Out-of-prefix violations: ${report.outOfPrefixCount}`);

    return report;
  } finally {
    if (shouldDisconnect && mongoose.connection.readyState !== 0 && require.main === module) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }
}

if (require.main === module) {
  reconcileMediaAssets().catch(err => {
    console.error('Reconciliation failed:', err.message);
    process.exit(1);
  });
}

module.exports = { reconcileMediaAssets };
