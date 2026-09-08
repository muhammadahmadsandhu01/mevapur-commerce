const mongoose = require('mongoose');
const Product = require('../../models/Product');
const SkuRegistry = require('../../models/SkuRegistry');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const MediaAsset = require('../../models/MediaAsset');
const MigrationState = require('../../models/MigrationState');
const { runMigration, MIGRATION_ID } = require('../../scripts/migrations/phase2-product-reconciliation');
const { manageIndexes, TARGET_INDEXES } = require('../../scripts/migrations/phase2-create-indexes');
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

  describe('phase2-create-indexes script contract and ownership safety', () => {
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

    it('dry-run performs inspection only and modifies zero indexes or MigrationState', async () => {
      const stateBefore = await MigrationState.countDocuments({ migrationId: 'phase2-create-indexes' });
      expect(stateBefore).toBe(0);

      const res = await manageIndexes({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      expect(res.status).toBe('dry_run_complete');
      expect(res.indexInspectionResults).toBeDefined();

      const stateAfter = await MigrationState.countDocuments({ migrationId: 'phase2-create-indexes' });
      expect(stateAfter).toBe(0);
    });

    it('apply creates indexes and records created index names in MigrationState for audited ownership', async () => {
      const res = await manageIndexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase2-indexes'],
        customDbConnected: true
      });

      expect(res.status).toBe('completed');
      expect(Array.isArray(res.createdIndexes)).toBe(true);

      const state = await MigrationState.findOne({ migrationId: 'phase2-create-indexes' });
      expect(state).not.toBeNull();
      expect(state.status).toBe('completed');
      expect(state.createdIndexes).toEqual(res.createdIndexes);
    });

    it('rollback drops ONLY recorded rollout-created indexes and preserves unowned indexes', async () => {
      // First ensure an apply record exists with specific tracked index
      await MigrationState.findOneAndUpdate(
        { migrationId: 'phase2-create-indexes' },
        {
          $set: {
            status: 'completed',
            createdIndexes: ['skuregistries.unique_global_sku']
          }
        },
        { upsert: true }
      );

      const res = await manageIndexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase2-index-rollback'],
        customDbConnected: true
      });

      expect(res.status).toBe('rolled_back');
      expect(res.droppedIndexes).toContain('skuregistries.unique_global_sku');

      const state = await MigrationState.findOne({ migrationId: 'phase2-create-indexes' });
      expect(state.status).toBe('rolled_back');
    });

    it('rollback refuses when rollout ownership cannot be proven', async () => {
      // Clear MigrationState
      await MigrationState.deleteOne({ migrationId: 'phase2-create-indexes' });

      await expect(manageIndexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase2-index-rollback'],
        customDbConnected: true
      })).rejects.toThrow('Rollout ownership cannot be proven');
    });

    it('duplicate SKU/slug data blocks index apply', async () => {
      try {
        await mongoose.connection.collection('products').dropIndex('unique_product_slug');
      } catch {}

      const dupSlug = `dup-slug-${Date.now()}`;
      await Product.create({ name: 'Product A', slug: dupSlug, price: 100 });
      await Product.create({ name: 'Product B', slug: dupSlug, price: 100 });

      await expect(manageIndexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase2-indexes'],
        customDbConnected: true
      })).rejects.toThrow('duplicate data conflicts detected');

      // Cleanup
      await Product.deleteMany({ slug: dupSlug });
    });
  });

  describe('MigrationState and Checkpoint Persistence Behavior', () => {
    it('dry-run creates zero MigrationState records', async () => {
      await MigrationState.deleteMany({ migrationId: MIGRATION_ID });
      const stateBefore = await MigrationState.countDocuments({ migrationId: MIGRATION_ID });
      expect(stateBefore).toBe(0);

      const result = await runMigration({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });
      expect(result.status).toBe('dry_run_complete');

      const stateAfter = await MigrationState.countDocuments({ migrationId: MIGRATION_ID });
      expect(stateAfter).toBe(0);
    });

    it('first apply creates running checkpoint', async () => {
      const state = await MigrationState.create({
        migrationId: 'test-first-apply',
        status: 'running',
        startedAt: new Date()
      });

      expect(state.status).toBe('running');
      expect(state.startedAt).toBeInstanceOf(Date);
      expect(state.lastProcessedId).toBeNull();
      expect(state.processedCount).toBe(0);
    });

    it('successful batch advances lastProcessedId and processed counts', async () => {
      const dummyId1 = new mongoose.Types.ObjectId();
      const state = await MigrationState.create({
        migrationId: 'test-advancing-batch',
        status: 'running',
        lastProcessedId: null,
        processedCount: 0,
        updatedCount: 0
      });

      // Simulate successful batch commit
      state.lastProcessedId = dummyId1;
      state.processedCount = 50;
      state.updatedCount = 50;
      await state.save();

      const reloaded = await MigrationState.findById(state._id);
      expect(reloaded.lastProcessedId.toString()).toBe(dummyId1.toString());
      expect(reloaded.processedCount).toBe(50);
      expect(reloaded.updatedCount).toBe(50);
    });

    it('failed batch does not advance checkpoint and records error reason code', async () => {
      const committedId = new mongoose.Types.ObjectId();
      const state = await MigrationState.create({
        migrationId: 'test-failed-batch',
        status: 'running',
        lastProcessedId: committedId,
        processedCount: 100,
        updatedCount: 100
      });

      // Simulate failure in next batch
      state.status = 'failed';
      state.lastReasonCode = 'DUPLICATE_SKU_COLLISION';
      // Notice: lastProcessedId remains unchanged at committedId
      await state.save();

      const reloaded = await MigrationState.findById(state._id);
      expect(reloaded.status).toBe('failed');
      expect(reloaded.lastProcessedId.toString()).toBe(committedId.toString());
      expect(reloaded.processedCount).toBe(100);
      expect(reloaded.lastReasonCode).toBe('DUPLICATE_SKU_COLLISION');
    });

    it('interrupted run resumes after lastProcessedId', async () => {
      const testCat = await Category.create({ name: 'Cat Checkpoint', slug: `cat-chk-${Date.now()}` });
      const p1 = await Product.create({ name: 'Product 1', slug: `p1-${Date.now()}`, category: testCat._id, price: 100 });
      const p2 = await Product.create({ name: 'Product 2', slug: `p2-${Date.now()}`, category: testCat._id, price: 200 });

      // Simulate interrupted checkpoint at p1
      const state = await MigrationState.create({
        migrationId: 'test-resume-interrupted',
        status: 'running',
        lastProcessedId: p1._id,
        processedCount: 1
      });

      // Verify resumption query strictly searches _id > lastProcessedId
      const remainingProducts = await Product.find({ _id: { $gt: state.lastProcessedId } }).sort({ _id: 1 });
      expect(remainingProducts.length).toBeGreaterThanOrEqual(1);
      expect(remainingProducts[0]._id.toString()).toBe(p2._id.toString());
    });

    it('completed migration rerun is idempotent and reports already completed', async () => {
      await MigrationState.create({
        migrationId: 'test-completed-rerun',
        status: 'completed',
        completedAt: new Date(),
        processedCount: 50,
        updatedCount: 50
      });

      const existing = await MigrationState.findOne({ migrationId: 'test-completed-rerun' });
      expect(existing.status).toBe('completed');
      expect(existing.completedAt).toBeInstanceOf(Date);
    });

    it('concurrent apply is rejected when another migration is running', async () => {
      await MigrationState.findOneAndUpdate(
        { migrationId: MIGRATION_ID },
        {
          $set: {
            status: 'running',
            startedAt: new Date()
          }
        },
        { upsert: true }
      );

      await expect(runMigration({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase2-migration'],
        customDbConnected: true
      })).rejects.toThrow('Another migration run is currently active');

      // Cleanup
      await MigrationState.deleteOne({ migrationId: MIGRATION_ID });
    });

    it('final batch marks completed with final counts and clears reason codes', async () => {
      const state = await MigrationState.create({
        migrationId: 'test-final-completion',
        status: 'running',
        lastReasonCode: 'PREVIOUS_TRANSIENT_ERROR'
      });

      state.status = 'completed';
      state.completedAt = new Date();
      state.lastReasonCode = null;
      state.processedCount = 250;
      state.updatedCount = 250;
      await state.save();

      const finalState = await MigrationState.findById(state._id);
      expect(finalState.status).toBe('completed');
      expect(finalState.completedAt).toBeInstanceOf(Date);
      expect(finalState.lastReasonCode).toBeNull();
      expect(finalState.processedCount).toBe(250);
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

      const report = await reconcileMediaAssets({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });
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

      const report = await reconcileMediaAssets({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });
      expect(report.outOfPrefixCount).toBeGreaterThanOrEqual(1);
      expect(report.sanitizedReasonCodes).toContain('OUT_OF_PREFIX_REJECTED');
    });
  });
});
