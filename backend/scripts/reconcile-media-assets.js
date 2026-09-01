const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MediaAsset = require('../models/MediaAsset');
const { createStorageProvider } = require('../services/media/StorageProvider');
const { getRuntimeConfig } = require('../config/runtime.config');

const isApply = process.argv.includes('--apply');

async function reconcileMediaAssets() {
  console.log('--- Durable Media Asset Reconciliation ---');
  console.log(`Mode: ${isApply ? 'APPLY (Executing deletions)' : 'DRY-RUN (Reporting only, default)'}`);

  const runtimeConfig = getRuntimeConfig();
  const storageProvider = createStorageProvider(runtimeConfig);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    // 1. Find assets queued for deletion
    const deletionCandidates = await MediaAsset.find({
      status: { $in: ['deletion_requested', 'deletion_failed'] },
      retryCount: { $lt: 5 }
    });

    console.log(`Found ${deletionCandidates.length} media assets queued for deletion.`);

    let successCount = 0;
    let failureCount = 0;

    for (const asset of deletionCandidates) {
      if (isApply) {
        try {
          await storageProvider.delete({ key: asset.key });
          asset.status = 'deleted';
          asset.lastError = null;
          await asset.save();
          successCount += 1;
        } catch (err) {
          asset.status = 'deletion_failed';
          asset.retryCount += 1;
          asset.lastError = err.name || 'DELETION_FAILED';
          asset.nextRetryAt = new Date(Date.now() + 5 * 60 * 1000 * Math.pow(2, asset.retryCount));
          await asset.save();
          failureCount += 1;
        }
      } else {
        console.log(`[DRY-RUN] Would delete asset ${asset._id} (Key: ${asset.key}, Retries: ${asset.retryCount})`);
      }
    }

    // 2. Identify stale unattached assets older than 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleOrphans = await MediaAsset.find({
      status: { $in: ['uploading', 'pending', 'upload_failed'] },
      'attachedTo.id': null,
      createdAt: { $lt: oneDayAgo }
    });

    console.log(`Found ${staleOrphans.length} orphaned/stale unattached media assets (>24h old).`);
    for (const orphan of staleOrphans) {
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
        console.log(`[DRY-RUN] Would clean up orphan asset ${orphan._id} (Key: ${orphan.key}, Status: ${orphan.status})`);
      }
    }

    if (isApply) {
      console.log(`\nReconciliation Summary: ${successCount} deleted successfully, ${failureCount} failed.`);
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  reconcileMediaAssets().catch(err => {
    console.error('Reconciliation failed:', err);
    process.exit(1);
  });
}

module.exports = { reconcileMediaAssets };
