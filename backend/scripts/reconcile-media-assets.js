const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');

const MediaAsset = require('../models/MediaAsset');
const Product = require('../models/Product');
const StorageProvider = require('../services/media/StorageProvider');
const { getRuntimeConfig } = require('../config/runtime.config');
const MediaService = require('../services/media/MediaService');
const { parseMigrationCli, validateTargetAndDbConfig, MigrationGuardError } = require('./lib/migrationRuntimeGuard');

const SUPPORTED_MANIFEST_SCHEMA_VERSIONS = ['1.0.0'];

const ALLOWED_LOCAL_RECOVERY_CLASSIFICATIONS = [
  'LOCAL_MOCK_VERIFIED',
  'LOCAL_EPHEMERAL_VERIFIED'
];

const ALLOWED_REMOTE_RECOVERY_CLASSIFICATIONS = [
  'VERSIONED_OBJECT_RECOVERY_VERIFIED',
  'POINT_IN_TIME_RECOVERY_VERIFIED',
  'ISOLATED_BACKUP_SNAPSHOT_VERIFIED'
];

function validateCheckpointManifest({
  manifestPath,
  expectedSha256,
  target,
  canonicalPrefix,
  dbFingerprint,
  bucket,
  provider
}) {
  if (!manifestPath || typeof manifestPath !== 'string' || !manifestPath.trim()) {
    throw new MigrationGuardError('CHECKPOINT_MANIFEST_REQUIRED', 'Apply mode strictly requires --checkpoint-manifest=<path>');
  }
  if (!expectedSha256 || typeof expectedSha256 !== 'string' || !expectedSha256.trim()) {
    throw new MigrationGuardError('EXPECTED_MANIFEST_SHA256_REQUIRED', 'Apply mode strictly requires --expected-manifest-sha256=<hash>');
  }
  if (!fs.existsSync(manifestPath)) {
    throw new MigrationGuardError('MANIFEST_FILE_NOT_FOUND', `Checkpoint manifest file not found: ${manifestPath}`);
  }

  const rawContent = fs.readFileSync(manifestPath, 'utf8');
  const computedSha256 = crypto.createHash('sha256').update(rawContent).digest('hex');
  if (computedSha256.toLowerCase() !== expectedSha256.trim().toLowerCase()) {
    throw new MigrationGuardError('MANIFEST_HASH_MISMATCH', `Checkpoint manifest SHA-256 mismatch. Expected: ${expectedSha256}, computed: ${computedSha256}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(rawContent);
  } catch {
    throw new MigrationGuardError('MALFORMED_MANIFEST', 'Checkpoint manifest contains invalid JSON.');
  }

  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new MigrationGuardError('MALFORMED_MANIFEST', 'Checkpoint manifest must be a JSON object.');
  }

  // 1. schemaVersion
  if (!manifest.schemaVersion || typeof manifest.schemaVersion !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_SCHEMA', 'Manifest missing required schemaVersion string.');
  }
  if (!SUPPORTED_MANIFEST_SCHEMA_VERSIONS.includes(manifest.schemaVersion)) {
    throw new MigrationGuardError('UNSUPPORTED_MANIFEST_SCHEMA_VERSION', `Manifest schemaVersion '${manifest.schemaVersion}' is not supported.`);
  }

  // 2. checkpointId
  if (!manifest.checkpointId || typeof manifest.checkpointId !== 'string' || !manifest.checkpointId.trim() || manifest.checkpointId.trim().length < 8) {
    throw new MigrationGuardError('INVALID_MANIFEST_CHECKPOINT_ID', 'Manifest missing or invalid checkpointId string (must be non-empty and >= 8 chars).');
  }

  // 3. timestamp
  const ts = manifest.timestamp || manifest.createdAt;
  if (!ts || typeof ts !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_TIMESTAMP', 'Manifest missing required timestamp string.');
  }
  const date = new Date(ts);
  if (isNaN(date.getTime())) {
    throw new MigrationGuardError('INVALID_MANIFEST_TIMESTAMP', 'Manifest timestamp is invalid.');
  }
  const ageMs = Date.now() - date.getTime();
  if (ageMs < -5 * 60 * 1000) {
    throw new MigrationGuardError('MANIFEST_FUTURE_TIMESTAMP', `Checkpoint manifest timestamp is in the future (${Math.round(-ageMs / 1000)}s ahead).`);
  }
  if (ageMs > 24 * 60 * 60 * 1000) {
    throw new MigrationGuardError('MANIFEST_STALE', `Checkpoint manifest is stale (age: ${Math.round(ageMs / 1000)}s). Must be <= 24h old.`);
  }

  // 4. target
  if (!manifest.target || typeof manifest.target !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_TARGET', 'Manifest missing required target string.');
  }
  if (manifest.target.toLowerCase() !== String(target).toLowerCase()) {
    throw new MigrationGuardError('MANIFEST_TARGET_MISMATCH', `Manifest target '${manifest.target}' does not match execution target '${target}'.`);
  }

  // 5. provider
  if (!manifest.provider || typeof manifest.provider !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_PROVIDER', 'Manifest missing required provider string.');
  }
  if (provider && manifest.provider.toLowerCase() !== String(provider).toLowerCase()) {
    throw new MigrationGuardError('MANIFEST_PROVIDER_MISMATCH', `Manifest provider '${manifest.provider}' does not match configured provider '${provider}'.`);
  }

  // 6. bucket
  if (!manifest.bucket || typeof manifest.bucket !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_BUCKET', 'Manifest missing required bucket string.');
  }
  if (bucket && manifest.bucket !== bucket) {
    throw new MigrationGuardError('MANIFEST_BUCKET_MISMATCH', `Manifest bucket '${manifest.bucket}' does not match configured bucket '${bucket}'.`);
  }

  // 7. prefix
  if (!manifest.prefix || typeof manifest.prefix !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_PREFIX', 'Manifest missing required prefix string.');
  }
  if (canonicalPrefix && manifest.prefix !== canonicalPrefix) {
    throw new MigrationGuardError('MANIFEST_PREFIX_MISMATCH', `Manifest prefix '${manifest.prefix}' does not match canonical prefix '${canonicalPrefix}'.`);
  }

  // 8. dbFingerprint
  if (!manifest.dbFingerprint || typeof manifest.dbFingerprint !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_DB_FINGERPRINT', 'Manifest missing required dbFingerprint string.');
  }
  if (dbFingerprint && manifest.dbFingerprint !== dbFingerprint) {
    throw new MigrationGuardError('MANIFEST_DB_FINGERPRINT_MISMATCH', `Manifest dbFingerprint '${manifest.dbFingerprint}' does not match DB '${dbFingerprint}'.`);
  }

  // 9. inventoryCount
  if (typeof manifest.inventoryCount !== 'number' || !Number.isSafeInteger(manifest.inventoryCount) || manifest.inventoryCount < 0) {
    throw new MigrationGuardError('INVALID_MANIFEST_INVENTORY_COUNT', 'Manifest inventoryCount must be a non-negative integer.');
  }

  // 10. inventorySha256 (optional format check)
  if (manifest.inventorySha256 !== undefined && manifest.inventorySha256 !== null) {
    if (typeof manifest.inventorySha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(manifest.inventorySha256)) {
      throw new MigrationGuardError('INVALID_MANIFEST_INVENTORY_SHA256', 'Manifest inventorySha256 must be a 64-character hexadecimal SHA-256 string.');
    }
  }

  // 11. operatorVerificationState
  if (manifest.operatorVerificationState !== 'VERIFIED') {
    throw new MigrationGuardError('INVALID_MANIFEST_OPERATOR_STATE', `Manifest operatorVerificationState must be exactly 'VERIFIED' (received: '${manifest.operatorVerificationState}').`);
  }

  // 12. recoveryClassification
  if (!manifest.recoveryClassification || typeof manifest.recoveryClassification !== 'string') {
    throw new MigrationGuardError('INVALID_MANIFEST_RECOVERY_CLASSIFICATION', 'Manifest missing required recoveryClassification string.');
  }

  const normalizedTarget = String(target).toLowerCase();
  if (normalizedTarget === 'local') {
    if (!ALLOWED_LOCAL_RECOVERY_CLASSIFICATIONS.includes(manifest.recoveryClassification)) {
      throw new MigrationGuardError(
        'INVALID_LOCAL_RECOVERY_CLASSIFICATION',
        `Local target requires local recovery classification (${ALLOWED_LOCAL_RECOVERY_CLASSIFICATIONS.join(', ')}). Received: '${manifest.recoveryClassification}'.`
      );
    }
  } else {
    // staging or production
    if (['UNVERIFIED', 'NONE'].includes(manifest.recoveryClassification) || ALLOWED_LOCAL_RECOVERY_CLASSIFICATIONS.includes(manifest.recoveryClassification)) {
      throw new MigrationGuardError(
        'UNVERIFIED_RECOVERY_CLASSIFICATION_BLOCKED',
        `Staging/Production apply strictly rejects unverified/local recovery classification '${manifest.recoveryClassification}'. Must be one of: ${ALLOWED_REMOTE_RECOVERY_CLASSIFICATIONS.join(', ')}.`
      );
    }
    if (!ALLOWED_REMOTE_RECOVERY_CLASSIFICATIONS.includes(manifest.recoveryClassification)) {
      throw new MigrationGuardError(
        'UNKNOWN_RECOVERY_CLASSIFICATION',
        `Unknown recovery classification '${manifest.recoveryClassification}'. Allowed: ${ALLOWED_REMOTE_RECOVERY_CLASSIFICATIONS.join(', ')}.`
      );
    }
  }

  return manifest;
}

async function reconcileMediaAssets({
  argv = process.argv.slice(2),
  customConfig = null,
  customDbConnected = false,
  customStorageProvider = null,
  checkpointManifestPath = null,
  expectedManifestSha256 = null,
  env = process.env
} = {}) {
  // 1. Strict CLI Argument Parsing
  const cli = parseMigrationCli(argv, {
    allowedModes: ['--dry-run', '--apply'],
    allowedFlags: [
      '--confirm-media-reconciliation',
      '--confirm-production-media-reconciliation',
      '--checkpoint-manifest=',
      '--expected-manifest-sha256='
    ],
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

  // 2. Validate DB Target and Identity Fingerprint (pure computation, zero DB connection)
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
      runtimeConfig = { storage: { provider: 'mock', s3: { bucket: 'mevapur-products', keyPrefix: 'products/' } } };
    }
  }

  const rawPrefix = runtimeConfig?.storage?.s3?.keyPrefix || 'products/';
  const canonicalPrefix = MediaService.validateStoragePrefix(rawPrefix);
  console.log(`Canonical Storage Prefix: '${canonicalPrefix}'`);

  const configuredBucket = runtimeConfig?.storage?.s3?.bucket || 'mevapur-products';
  const configuredProvider = runtimeConfig?.storage?.provider || (cli.target === 'local' ? 'mock' : 's3');

  // 3. Checkpoint Manifest Apply Gate — STRICTLY VERIFIED BEFORE ANY DB OR STORAGE INITIALIZATION
  if (isApply) {
    let manifestPath = checkpointManifestPath;
    let manifestSha = expectedManifestSha256;

    for (const flag of cli.flags) {
      if (flag.startsWith('--checkpoint-manifest=')) {
        manifestPath = flag.slice('--checkpoint-manifest='.length);
      } else if (flag.startsWith('--expected-manifest-sha256=')) {
        manifestSha = flag.slice('--expected-manifest-sha256='.length);
      }
    }

    validateCheckpointManifest({
      manifestPath,
      expectedSha256: manifestSha,
      target: cli.target,
      canonicalPrefix,
      dbFingerprint: dbConfig.sanitizedFingerprint,
      bucket: configuredBucket,
      provider: configuredProvider
    });
    console.log('✅ Checkpoint manifest verified.');
  }

  // 4. Initialize storage provider AFTER manifest verification passes
  const storageProvider = customStorageProvider || StorageProvider.createStorageProvider(runtimeConfig);

  // 5. Connect to MongoDB AFTER manifest verification passes
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
      status: { $in: ['deletion_requested', 'deletion_failed', 'deletion_in_progress'] }
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
            { $set: { status: 'deletion_failed', lastError: reason, leaseId: null, leaseExpiresAt: null } }
          );
        }
        continue;
      }

      // Execute Deletion
      if (isApply) {
        const leaseId = crypto.randomUUID();
        const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Atomic Exclusive Lease Claim
        const claimed = await MediaAsset.findOneAndUpdate(
          {
            _id: asset._id,
            $or: [
              { status: 'deletion_requested' },
              {
                status: 'deletion_failed',
                retryCount: { $lt: 5 },
                $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }]
              },
              { status: 'deletion_in_progress', leaseExpiresAt: { $lt: now } }
            ]
          },
          {
            $set: {
              status: 'deletion_in_progress',
              leaseId,
              leaseExpiresAt
            }
          },
          { new: true }
        );

        if (!claimed) {
          console.log(`[LEASE-UNAVAILABLE] Asset ${assetIdStr} could not be leased. Skipping.`);
          continue;
        }

        // Authoritative post-claim attachment recheck
        const isAttached = await Product.exists({
          $or: [
            { _id: claimed.attachedTo?.id },
            { mediaAssetIds: claimed._id },
            { primaryMediaAssetId: claimed._id },
            { 'variants.mediaAssetIds': claimed._id }
          ]
        });

        if (isAttached) {
          report.quarantinedAttached += 1;
          if (!report.sanitizedReasonCodes.includes('STILL_ATTACHED_TO_PRODUCT')) {
            report.sanitizedReasonCodes.push('STILL_ATTACHED_TO_PRODUCT');
          }
          console.warn(`[ATTACHED-PRESERVED] Asset ${assetIdStr} is still referenced by a Product. Preserving from deletion.`);
          await MediaAsset.findOneAndUpdate(
            { _id: claimed._id, leaseId },
            {
              $set: {
                status: 'deletion_failed',
                lastError: 'STILL_ATTACHED_TO_PRODUCT',
                leaseId: null,
                leaseExpiresAt: null
              }
            }
          );
          continue;
        }

        try {
          await storageProvider.delete({ key: keyValidation.normalizedKey });
          await MediaAsset.findOneAndUpdate(
            { _id: claimed._id, leaseId },
            { $set: { status: 'deleted', lastError: null, leaseId: null, leaseExpiresAt: null } }
          );
          report.deleted += 1;
          report.affectedAssetIds.push(assetIdStr);
        } catch (err) {
          const isNotFound = err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
          if (isNotFound) {
            await MediaAsset.findOneAndUpdate(
              { _id: claimed._id, leaseId },
              { $set: { status: 'deleted', lastError: 'OBJECT_ALREADY_MISSING_ON_PROVIDER', leaseId: null, leaseExpiresAt: null } }
            );
            report.deleted += 1;
            report.affectedAssetIds.push(assetIdStr);
          } else {
            await MediaAsset.findOneAndUpdate(
              { _id: claimed._id, leaseId },
              {
                $set: {
                  status: 'deletion_failed',
                  lastError: 'DELETION_FAILED',
                  nextRetryAt: new Date(Date.now() + 5 * 60 * 1000 * Math.pow(2, (claimed.retryCount || 0) + 1)),
                  leaseId: null,
                  leaseExpiresAt: null
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
        // Dry-run: check attachment and report
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

      if (isApply) {
        const leaseId = crypto.randomUUID();
        const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

        const claimed = await MediaAsset.findOneAndUpdate(
          {
            _id: orphan._id,
            status: { $in: ['uploading', 'pending', 'upload_failed'] }
          },
          {
            $set: {
              status: 'deletion_in_progress',
              leaseId,
              leaseExpiresAt
            }
          },
          { new: true }
        );

        if (!claimed) {
          console.log(`[LEASE-UNAVAILABLE] Orphan asset ${orphanIdStr} could not be leased. Skipping.`);
          continue;
        }

        const orphanAttached = await Product.exists({
          $or: [
            { mediaAssetIds: claimed._id },
            { primaryMediaAssetId: claimed._id },
            { 'variants.mediaAssetIds': claimed._id }
          ]
        });

        if (orphanAttached) {
          report.quarantinedAttached += 1;
          if (!report.sanitizedReasonCodes.includes('STILL_ATTACHED_TO_PRODUCT')) {
            report.sanitizedReasonCodes.push('STILL_ATTACHED_TO_PRODUCT');
          }
          console.warn(`[ATTACHED-PRESERVED] Orphan asset ${orphanIdStr} is referenced by a Product. Preserving from deletion.`);
          await MediaAsset.findOneAndUpdate(
            { _id: claimed._id, leaseId },
            {
              $set: {
                status: 'deletion_failed',
                lastError: 'STILL_ATTACHED_TO_PRODUCT',
                leaseId: null,
                leaseExpiresAt: null
              }
            }
          );
          continue;
        }

        try {
          await storageProvider.delete({ key: keyValidation.normalizedKey });
          await MediaAsset.findOneAndUpdate(
            { _id: claimed._id, leaseId },
            { $set: { status: 'deleted', lastError: null, leaseId: null, leaseExpiresAt: null } }
          );
        } catch (err) {
          const isNotFound = err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
          if (isNotFound) {
            await MediaAsset.findOneAndUpdate(
              { _id: claimed._id, leaseId },
              { $set: { status: 'deleted', lastError: 'OBJECT_ALREADY_MISSING_ON_PROVIDER', leaseId: null, leaseExpiresAt: null } }
            );
          } else {
            await MediaAsset.findOneAndUpdate(
              { _id: claimed._id, leaseId },
              {
                $set: {
                  status: 'deletion_failed',
                  lastError: 'DELETION_FAILED',
                  nextRetryAt: new Date(Date.now() + 5 * 60 * 1000 * Math.pow(2, (claimed.retryCount || 0) + 1)),
                  leaseId: null,
                  leaseExpiresAt: null
                },
                $inc: { retryCount: 1 }
              }
            );
          }
        }
      } else {
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

module.exports = {
  reconcileMediaAssets,
  validateCheckpointManifest,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
  ALLOWED_LOCAL_RECOVERY_CLASSIFICATIONS,
  ALLOWED_REMOTE_RECOVERY_CLASSIFICATIONS
};
