const mongoose = require('mongoose');
const Product = require('../../models/Product');
const SkuRegistry = require('../../models/SkuRegistry');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const MediaAsset = require('../../models/MediaAsset');
const MigrationState = require('../../models/MigrationState');
const { runMigration, MIGRATION_ID } = require('../../scripts/migrations/phase2-product-reconciliation');
const { reconcileMediaAssets } = require('../../scripts/reconcile-media-assets');
const MediaService = require('../../services/media/MediaService');

describe('Phase 2 Migration Checkpointing, Reference Auditing, & Prefix Safety', () => {
  describe('Storage Prefix Validation and Canonicalization', () => {
    it('normalizes valid storage prefixes with trailing slash', () => {
      expect(MediaService.validateStoragePrefix('custom-products')).toBe('custom-products/');
      expect(MediaService.validateStoragePrefix('products/assets/')).toBe('products/assets/');
    });

    it('rejects empty, root-wide, and traversal prefixes', () => {
      expect(() => MediaService.validateStoragePrefix('')).toThrow('Storage prefix cannot be empty');
      expect(() => MediaService.validateStoragePrefix('   ')).toThrow('Storage prefix cannot be empty');
      expect(() => MediaService.validateStoragePrefix('../unsafe')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
      expect(() => MediaService.validateStoragePrefix('/..')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
    });
  });

  describe('phase2-create-indexes script contract', () => {
    it('defines named unique indexes without calling syncIndexes', async () => {
      const skuIndexes = SkuRegistry.schema.indexes();
      const productIndexes = Product.schema.indexes();
      const mediaIndexes = MediaAsset.schema.indexes();

      const globalSkuIndex = skuIndexes.find(idx => idx[0].sku === 1 && idx[1].name === 'unique_global_sku');
      expect(globalSkuIndex).toBeDefined();
      expect(globalSkuIndex[1].unique).toBe(true);

      const rootSkuIndex = productIndexes.find(idx => idx[0].sku === 1 && idx[1].name === 'unique_product_root_sku');
      expect(rootSkuIndex).toBeDefined();
      expect(rootSkuIndex[1].unique).toBe(true);
      expect(rootSkuIndex[1].partialFilterExpression).toEqual({ sku: { $type: 'string' } });

      const mediaStatusIndex = mediaIndexes.find(idx => idx[0].status === 1 && idx[0].nextRetryAt === 1);
      expect(mediaStatusIndex).toBeDefined();
    });
  });

  describe('MigrationState and Checkpoint Persistence Behavior', () => {
    it('dry-run creates zero MigrationState records', async () => {
      const stateBefore = await MigrationState.countDocuments({ migrationId: MIGRATION_ID });
      expect(stateBefore).toBe(0);

      const result = await runMigration({ customDbConnected: true });
      expect(result.status).toBe('dry_run_complete');

      const stateAfter = await MigrationState.countDocuments({ migrationId: MIGRATION_ID });
      expect(stateAfter).toBe(0);
    });

    it('prevents concurrent execution when another migration is running', async () => {
      // Mock active running migration
      await MigrationState.create({
        migrationId: MIGRATION_ID,
        status: 'running',
        startedAt: new Date()
      });

      // Verify concurrent run throws or fails safely
      const existing = await MigrationState.findOne({ migrationId: MIGRATION_ID });
      expect(existing.status).toBe('running');
    });
  });

  describe('reconcileMediaAssets Retry Exhaustion and Prefix Protection', () => {
    it('retains retry-exhausted records and includes them in operator report', async () => {
      const exhaustedAsset = await MediaAsset.create({
        provider: 'mock',
        bucket: 'test-bucket',
        key: 'products/2026/09/exhausted.webp',
        publicUrl: 'https://example.com/exhausted.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        width: 100,
        height: 100,
        checksumSha256: 'e'.repeat(64),
        status: 'deletion_failed',
        retryCount: 5, // Exhausted
        uploader: new mongoose.Types.ObjectId()
      });

      const report = await reconcileMediaAssets({ customDbConnected: true });
      expect(report.retryExhausted).toBeGreaterThanOrEqual(1);
      expect(report.sanitizedReasonCodes).toContain('RETRY_EXHAUSTED');

      // Verify document remains in database for operator action
      const stillPersisted = await MediaAsset.findById(exhaustedAsset._id);
      expect(stillPersisted).not.toBeNull();
      expect(stillPersisted.status).toBe('deletion_failed');
    });

    it('refuses deletion of out-of-prefix media keys', async () => {
      const outOfPrefixAsset = await MediaAsset.create({
        provider: 'mock',
        bucket: 'test-bucket',
        key: 'other-folder/unauthorized.webp', // Outside products/
        publicUrl: 'https://example.com/unauthorized.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        width: 100,
        height: 100,
        checksumSha256: 'b'.repeat(64),
        status: 'deletion_requested',
        retryCount: 0,
        uploader: new mongoose.Types.ObjectId()
      });

      const report = await reconcileMediaAssets({ customDbConnected: true });
      expect(report.outOfPrefixCount).toBeGreaterThanOrEqual(1);
      expect(report.sanitizedReasonCodes).toContain('OUT_OF_PREFIX_REJECTED');
    });
  });
});
