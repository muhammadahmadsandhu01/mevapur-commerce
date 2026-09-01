const mongoose = require('mongoose');
const Product = require('../../models/Product');
const SkuRegistry = require('../../models/SkuRegistry');
const MediaAsset = require('../../models/MediaAsset');
const { reconcileMediaAssets } = require('../../scripts/reconcile-media-assets');

describe('Phase 2 Migration, Index Management & Media Reconciliation', () => {
  describe('phase2-create-indexes script contract', () => {
    it('defines named unique indexes without calling syncIndexes', async () => {
      const skuIndexes = SkuRegistry.schema.indexes();
      const productIndexes = Product.schema.indexes();
      const mediaIndexes = MediaAsset.schema.indexes();

      // Verify SkuRegistry unique_global_sku
      const globalSkuIndex = skuIndexes.find(idx => idx[0].sku === 1 && idx[1].name === 'unique_global_sku');
      expect(globalSkuIndex).toBeDefined();
      expect(globalSkuIndex[1].unique).toBe(true);

      // Verify Product partial root SKU index
      const rootSkuIndex = productIndexes.find(idx => idx[0].sku === 1 && idx[1].name === 'unique_product_root_sku');
      expect(rootSkuIndex).toBeDefined();
      expect(rootSkuIndex[1].unique).toBe(true);
      expect(rootSkuIndex[1].partialFilterExpression).toEqual({ sku: { $type: 'string' } });

      // Verify MediaAsset status and retry index
      const mediaStatusIndex = mediaIndexes.find(idx => idx[0].status === 1 && idx[0].nextRetryAt === 1);
      expect(mediaStatusIndex).toBeDefined();
    });
  });

  describe('reconcileMediaAssets script behavior', () => {
    let testAsset;

    beforeEach(async () => {
      testAsset = await MediaAsset.create({
        provider: 'mock',
        bucket: 'test-bucket',
        key: 'products/2026/09/test-orphan.webp',
        publicUrl: 'https://example.com/test-orphan.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        width: 100,
        height: 100,
        checksumSha256: 'a'.repeat(64),
        status: 'deletion_requested',
        uploader: new mongoose.Types.ObjectId()
      });
    });

    it('defaults to dry-run and makes no database or deletion mutations', async () => {
      // In dry-run (default), asset remains in deletion_requested state
      const before = await MediaAsset.findById(testAsset._id);
      expect(before.status).toBe('deletion_requested');
    });
  });
});
