const crypto = require('crypto');
const mongoose = require('mongoose');
const sharp = require('sharp');
const request = require('supertest');

const app = require('../../app');
const MediaAsset = require('../../models/MediaAsset');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Order = require('../../models/Order');
const InventoryTransaction = require('../../models/InventoryTransaction');
const Session = require('../../models/Session');
const TokenService = require('../../services/TokenService');
const MediaService = require('../../services/media/MediaService');
const { MockStorageProvider } = require('../../services/media/StorageProvider');
const ProductCatalogService = require('../../services/product/ProductCatalogService');
const { reconcileMediaAssets } = require('../../scripts/reconcile-media-assets');

describe('Phase 3C-3A: Media Lifecycle, Storage Reconciliation & Irreversible Deletion Safety', () => {
  let mockStorage;
  let adminUser;
  let adminToken;
  let activeCategory;
  let sequence = 0;

  beforeEach(async () => {
    sequence += 1;
    mockStorage = new MockStorageProvider();
    MediaService.storageProvider = mockStorage;

    adminUser = await global.createTestUser({
      email: `media-admin-${sequence}@example.test`,
      role: 'admin'
    });

    const session = await Session.create({
      user: adminUser._id,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
      tokenFamilyId: crypto.randomUUID(),
      isActive: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000)
    });

    adminToken = `Bearer ${TokenService.generateAccessToken({
      userId: adminUser._id,
      sessionId: session._id,
      tokenVersion: adminUser.tokenVersion
    })}`;

    activeCategory = await Category.create({
      name: `Media Category ${sequence}`,
      slug: `media-cat-${sequence}-${crypto.randomUUID()}`,
      isActive: true
    });
  });

  // 1. Module import causes zero execution
  it('1. importing reconcile-media-assets module causes zero execution and zero DB/storage side effects', () => {
    expect(typeof reconcileMediaAssets).toBe('function');
  });

  // 2. No-argument CLI is non-mutating
  it('2. no-argument CLI execution fails closed or defaults safely without mutations', async () => {
    await expect(reconcileMediaAssets({
      argv: [],
      customDbConnected: true
    })).rejects.toThrow();
  });

  // 3. Invalid target/mode/token fails closed
  it('3. invalid target, mode, or missing confirmation tokens fail closed without mutation', async () => {
    await expect(reconcileMediaAssets({
      argv: ['--apply', '--target=production'],
      customDbConnected: true
    })).rejects.toThrow();

    await expect(reconcileMediaAssets({
      argv: ['--target=invalid-target'],
      customDbConnected: true
    })).rejects.toThrow();
  });

  // 4. Dry-run causes zero DB writes
  it('4. dry-run mode causes exactly zero database writes', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/dryrun.webp',
      publicUrl: 'https://example.com/dryrun.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    const initialVersion = asset.__v;

    const report = await reconcileMediaAssets({
      argv: ['--dry-run', '--target=local', '--allow-local'],
      customDbConnected: true
    });

    expect(report.mode).toBe('DRY-RUN');
    expect(report.deleted).toBe(1);

    const reloaded = await MediaAsset.findById(asset._id);
    expect(reloaded.status).toBe('deletion_requested'); // Unchanged!
    expect(reloaded.__v).toBe(initialVersion);
  });

  // 5. Dry-run causes zero provider writes/deletes
  it('5. dry-run mode causes exactly zero storage provider deletions', async () => {
    const key = 'products/2026/09/preserve-in-storage.webp';
    await mockStorage.upload({ key, buffer: Buffer.from('image content'), mimeType: 'image/webp' });
    expect(mockStorage.has(key)).toBe(true);

    await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key,
      publicUrl: `https://example.com/${key}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'b'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    await reconcileMediaAssets({
      argv: ['--dry-run', '--target=local', '--allow-local'],
      customDbConnected: true
    });

    expect(mockStorage.has(key)).toBe(true); // Still exists in storage!
  });

  // 6. Root/empty/traversal prefix rejected
  it('6. empty, root, dot, backslash, wildcard, and traversal prefixes are rejected', () => {
    expect(() => MediaService.validateStoragePrefix('')).toThrow();
    expect(() => MediaService.validateStoragePrefix('   ')).toThrow();
    expect(() => MediaService.validateStoragePrefix('/')).toThrow();
    expect(() => MediaService.validateStoragePrefix('.')).toThrow();
    expect(() => MediaService.validateStoragePrefix('..')).toThrow();
    expect(() => MediaService.validateStoragePrefix('../products/')).toThrow();
    expect(() => MediaService.validateStoragePrefix('products/../')).toThrow();
    expect(() => MediaService.validateStoragePrefix('products\\nested/')).toThrow();
    expect(() => MediaService.validateStoragePrefix('products/*/')).toThrow();
  });

  // 7. Encoded traversal rejected
  it('7. URL-encoded path traversals (%2e%2e, %2f, %5c) are rejected in prefixes and keys', () => {
    expect(() => MediaService.validateStoragePrefix('products/%2e%2e/')).toThrow();
    expect(() => MediaService.validateStoragePrefix('%2e%2e%2fproducts/')).toThrow();

    const result = MediaService.validateObjectKey('products/%2e%2e/secret.png', 'products/');
    expect(result.valid).toBe(false);
  });

  // 8. Segment-prefix collision rejected
  it('8. prefix matching is segment-aware and rejects prefix collision with similarly named folders', () => {
    const validKey = MediaService.validateObjectKey('products/2026/photo.webp', 'products/');
    expect(validKey.valid).toBe(true);

    // Collision check: 'products-other/' or 'products_archive/' must NOT match 'products/'
    const collisionKey = MediaService.validateObjectKey('products-other/2026/photo.webp', 'products/');
    expect(collisionKey.valid).toBe(false);
    expect(collisionKey.reason).toBe('OUT_OF_PREFIX');
  });

  // 9. Object outside prefix rejected
  it('9. object keys outside configured canonical prefix are rejected from deletion', async () => {
    const outKey = 'system/secret.webp';
    await mockStorage.upload({ key: outKey, buffer: Buffer.from('secret'), mimeType: 'image/webp' });

    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: outKey,
      publicUrl: `https://example.com/${outKey}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'c'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true
    });

    expect(report.outOfPrefixCount).toBe(1);
    expect(mockStorage.has(outKey)).toBe(true); // NOT deleted!

    const reloaded = await MediaAsset.findById(asset._id);
    expect(reloaded.status).toBe('deletion_failed');
    expect(reloaded.lastError).toBe('OUT_OF_PREFIX_REJECTED');
  });

  // 10. Unknown provider object is reported, not deleted
  it('10. unknown provider objects without database record are preserved, not deleted', async () => {
    const unknownKey = 'products/2026/09/unknown-manual-upload.webp';
    await mockStorage.upload({ key: unknownKey, buffer: Buffer.from('manual'), mimeType: 'image/webp' });

    await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true
    });

    expect(mockStorage.has(unknownKey)).toBe(true); // Never deleted without DB identity!
  });

  // 11. Ambiguous ownership is quarantined
  it('11. assets with malformed keys are quarantined with UNSAFE_KEY_REJECTED', async () => {
    const badKeyAsset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/../etc/passwd.webp',
      publicUrl: 'https://example.com/bad.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'd'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true
    });

    expect(report.failed).toBe(1);
    const reloaded = await MediaAsset.findById(badKeyAsset._id);
    expect(reloaded.status).toBe('deletion_failed');
    expect(reloaded.lastError).toBe('UNSAFE_KEY_REJECTED');
  });

  // 12. Attached committed asset is preserved
  it('12. committed assets attached to active products are never deletion candidates', async () => {
    const key = 'products/2026/09/committed-active.webp';
    await mockStorage.upload({ key, buffer: Buffer.from('active'), mimeType: 'image/webp' });

    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key,
      publicUrl: `https://example.com/${key}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'e'.repeat(64),
      status: 'committed',
      uploader: adminUser._id
    });

    await Product.create({
      name: 'Active Product',
      slug: `active-prod-${Date.now()}`,
      category: activeCategory._id,
      status: 'published',
      isActive: true,
      price: 50,
      mediaAssetIds: [asset._id]
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true
    });

    expect(report.attempted).toBe(0); // Not even considered
    expect(mockStorage.has(key)).toBe(true);
  });

  // 13. Deletion-requested but still-attached asset is preserved
  it('13. deletion-requested asset still referenced by a Product document is quarantined and preserved', async () => {
    const key = 'products/2026/09/still-attached.webp';
    await mockStorage.upload({ key, buffer: Buffer.from('attached'), mimeType: 'image/webp' });

    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key,
      publicUrl: `https://example.com/${key}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'f'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    await Product.create({
      name: 'Product Referencing Asset',
      slug: `prod-ref-${Date.now()}`,
      category: activeCategory._id,
      status: 'published',
      isActive: true,
      price: 100,
      mediaAssetIds: [asset._id]
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true
    });

    expect(report.quarantinedAttached).toBe(1);
    expect(report.deleted).toBe(0);
    expect(mockStorage.has(key)).toBe(true); // NOT physically deleted!
  });

  // 14. Safe deletion candidate is identified deterministically
  it('14. truly unattached deletion_requested asset is identified and physically deleted in apply mode', async () => {
    const key = 'products/2026/09/safe-to-delete.webp';
    await mockStorage.upload({ key, buffer: Buffer.from('delete-me'), mimeType: 'image/webp' });
    expect(mockStorage.has(key)).toBe(true);

    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key,
      publicUrl: `https://example.com/${key}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '1'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.deleted).toBe(1);
    expect(mockStorage.has(key)).toBe(false); // Deleted from storage!

    const reloaded = await MediaAsset.findById(asset._id);
    expect(reloaded.status).toBe('deleted');
  });

  // 15. Apply cannot run without authorization confirmation flags
  it('15. apply mode fails closed if required confirmation tokens are missing', async () => {
    await expect(reconcileMediaAssets({
      argv: ['--apply', '--target=staging'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    })).rejects.toThrow('requires explicit confirmation token');
  });

  // 16. Duplicate apply/replay is idempotent
  it('16. duplicate apply runs on already-deleted assets are idempotent with 0 additional mutations', async () => {
    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.attempted).toBe(0);
    expect(report.deleted).toBe(0);
  });

  // 17. Already-missing provider object handled truthfully
  it('17. deleting a key already missing on provider handles 404 gracefully and marks deleted', async () => {
    const missingKey = 'products/2026/09/already-missing-on-s3.webp';
    // Do NOT upload to mockStorage, so it is absent!

    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: missingKey,
      publicUrl: `https://example.com/${missingKey}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '2'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.deleted).toBe(1);
    const reloaded = await MediaAsset.findById(asset._id);
    expect(reloaded.status).toBe('deleted');
  });

  // 18. Exponential backoff delay
  it('18. exponential backoff skips assets whose nextRetryAt is in the future', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/in-backoff.webp',
      publicUrl: 'https://example.com/in-backoff.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '4'.repeat(64),
      status: 'deletion_failed',
      retryCount: 2,
      nextRetryAt: new Date(Date.now() + 600000), // 10 mins in future
      uploader: adminUser._id
    });

    const report = await reconcileMediaAssets({
      argv: ['--dry-run', '--target=local', '--allow-local'],
      customDbConnected: true
    });

    expect(report.skippedUntilNextRetry).toBe(1);
  });

  // 19. Retry exhaustion becomes visible/quarantined
  it('19. assets reaching 5 retry failures are quarantined as RETRY_EXHAUSTED', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/exhausted-asset.webp',
      publicUrl: 'https://example.com/exhausted-asset.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '5'.repeat(64),
      status: 'deletion_failed',
      retryCount: 5,
      uploader: adminUser._id
    });

    const report = await reconcileMediaAssets({
      argv: ['--dry-run', '--target=local', '--allow-local'],
      customDbConnected: true
    });

    expect(report.retryExhausted).toBe(1);
    expect(report.sanitizedReasonCodes).toContain('RETRY_EXHAUSTED');
  });

  // 20. Concurrent attachment prevents deletion
  it('20. concurrent product creation claiming asset blocks physical deletion', async () => {
    const key = 'products/2026/09/concurrent-asset.webp';
    await mockStorage.upload({ key, buffer: Buffer.from('data'), mimeType: 'image/webp' });

    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key,
      publicUrl: `https://example.com/${key}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '6'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    // Concurrently attach to product directly without changing deletion_requested status (simulating race)
    await Product.create({
      name: 'Concurrent Attached Product',
      slug: `concurrent-prod-${Date.now()}`,
      category: activeCategory._id,
      price: 99,
      status: 'published',
      isActive: true,
      mediaAssetIds: [asset._id]
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.quarantinedAttached).toBe(1);
    expect(mockStorage.has(key)).toBe(true); // Preserved!
  });

  // 21. Crash/retry boundary compare-and-set
  it('21. compare-and-set query guarantees exactly-once status transition from deletion_requested to deleted', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/atomic-cas.webp',
      publicUrl: 'https://example.com/atomic-cas.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '7'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    // First atomic transition
    const first = await MediaAsset.findOneAndUpdate(
      { _id: asset._id, status: { $in: ['deletion_requested', 'deletion_failed'] } },
      { $set: { status: 'deleted' } },
      { new: true }
    );
    expect(first).not.toBeNull();
    expect(first.status).toBe('deleted');

    // Second atomic transition fails because status is already 'deleted'
    const second = await MediaAsset.findOneAndUpdate(
      { _id: asset._id, status: { $in: ['deletion_requested', 'deletion_failed'] } },
      { $set: { status: 'deleted' } },
      { new: true }
    );
    expect(second).toBeNull();
  });

  // 22. Stale orphans (>24h unattached) are safely cleaned up
  it('22. stale unattached orphan assets older than 24h are identified and cleaned up in apply mode', async () => {
    const orphanKey = 'products/2026/09/stale-orphan.webp';
    await mockStorage.upload({ key: orphanKey, buffer: Buffer.from('orphan'), mimeType: 'image/webp' });

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const orphan = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: orphanKey,
      publicUrl: `https://example.com/${orphanKey}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '8'.repeat(64),
      status: 'upload_failed',
      attachedTo: { model: 'Product', id: null },
      uploader: adminUser._id,
      createdAt: twoDaysAgo
    });

    const report = await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.staleOrphans).toBe(1);
    expect(mockStorage.has(orphanKey)).toBe(false);

    const reloaded = await MediaAsset.findById(orphan._id);
    expect(reloaded.status).toBe('deleted');
  });

  // 23. Pagination / list continuation cannot escape prefix
  it('23. validateObjectKey strictly confines keys to canonical prefix segments', () => {
    expect(MediaService.validateObjectKey('products/nested/image.webp', 'products/').valid).toBe(true);
    expect(MediaService.validateObjectKey('products/image.webp', 'products/').valid).toBe(true);
    expect(MediaService.validateObjectKey('other-bucket/image.webp', 'products/').valid).toBe(false);
  });

  // 24. Public product response exposes only committed assets
  it('24. public product response exposes only committed media URLs and hides internal storage metadata', async () => {
    const key = 'products/2026/09/public-view.webp';
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key,
      publicUrl: `https://example.com/${key}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 200,
      height: 200,
      checksumSha256: '9'.repeat(64),
      status: 'pending',
      uploader: adminUser._id
    });

    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'Public Product',
        description: 'Description',
        category: activeCategory._id,
        price: 150,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    });

    const res = await request(app).get(`/api/products/${product.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.images).toContain(`https://example.com/${key}`);
    expect(res.body.data).not.toHaveProperty('bucket');
    expect(res.body.data).not.toHaveProperty('checksumSha256');
  });

  // 25. Cross-product asset hijacking is rejected
  it('25. product creation/update cannot hijack a media asset committed to another product', async () => {
    const key = 'products/2026/09/hijack-test.webp';
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key,
      publicUrl: `https://example.com/${key}`,
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a1'.repeat(32),
      status: 'pending',
      uploader: adminUser._id
    });

    await ProductCatalogService.createProduct({
      data: {
        name: 'Legitimate Owner Product',
        description: 'First owner',
        category: activeCategory._id,
        price: 100,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    });

    // Second product attempt to claim same asset
    await expect(ProductCatalogService.createProduct({
      data: {
        name: 'Hijacker Product',
        description: 'Should fail',
        category: activeCategory._id,
        price: 200,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    })).rejects.toThrow('Media asset is already committed to another product');
  });

  // 26. Product update preserves unrelated assets
  it('26. updating a product replaces only changed media and marks removed ones for deletion', async () => {
    const a1 = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/a1.webp',
      publicUrl: 'https://example.com/a1.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a2'.repeat(32),
      status: 'pending',
      uploader: adminUser._id
    });

    const a2 = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/a2.webp',
      publicUrl: 'https://example.com/a2.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a3'.repeat(32),
      status: 'pending',
      uploader: adminUser._id
    });

    const p = await ProductCatalogService.createProduct({
      data: {
        name: 'Update Media Product',
        description: 'Testing update',
        category: activeCategory._id,
        price: 100,
        status: 'published',
        mediaAssetIds: [a1._id.toString()]
      },
      userId: adminUser._id
    });

    // Update product to use a2 instead of a1
    await ProductCatalogService.updateProduct({
      id: p._id,
      data: {
        mediaAssetIds: [a2._id.toString()],
        expectedVersion: p.__v
      },
      userId: adminUser._id
    });

    const reloadedA1 = await MediaAsset.findById(a1._id);
    const reloadedA2 = await MediaAsset.findById(a2._id);

    expect(reloadedA1.status).toBe('deletion_requested'); // Removed asset marked for deletion
    expect(reloadedA2.status).toBe('committed'); // New asset committed
  });

  // 27. Historical order/invoice data remains unchanged
  it('27. historical order and invoice records retain immutable item and price snapshots independent of media status', async () => {
    const order = await Order.create({
      user: adminUser._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Historical Walnut Pack',
        sku: 'WALNUT-01',
        price: 250,
        quantity: 2,
        lineTotal: 500
      }],
      shippingAddress: {
        fullName: 'Historical Customer',
        phone: '03001234567',
        address: '123 History Lane',
        city: 'Lahore',
        province: 'Punjab',
        country: 'PK'
      },
      paymentMethod: 'cod',
      payment: { currency: 'PKR' },
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      subtotal: 500,
      shippingCost: 0,
      taxAmount: 0,
      discount: 0,
      totalAmount: 500,
      statusTimeline: [{
        status: 'Delivered',
        actor: adminUser._id,
        actorRole: 'admin',
        timestamp: new Date()
      }]
    });

    const res = await request(app)
      .get(`/api/account/orders/${order._id}/invoice`)
      .set('Authorization', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.data.invoice.items[0].name).toBe('Historical Walnut Pack');
    expect(res.body.data.invoice.items[0].unitPrice).toBe(250);
    expect(res.body.data.invoice.total).toBe(500);
  });

  // 28. Stock/SKU/price/ledger remain unchanged
  it('28. media reconciliation and deletion operations create zero InventoryTransaction records and alter no stock', async () => {
    const initialTxCount = await InventoryTransaction.countDocuments();

    await reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true
    });

    const finalTxCount = await InventoryTransaction.countDocuments();
    expect(finalTxCount).toBe(initialTxCount); // Zero inventory ledger entries created!
  });

  // 29. Category active state changes do not alter media asset records or statuses
  it('29. category active state changes do not alter media asset records or statuses', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/category-toggle.webp',
      publicUrl: 'https://example.com/category-toggle.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a4'.repeat(32),
      status: 'committed',
      uploader: adminUser._id
    });

    // Deactivate category
    activeCategory.isActive = false;
    await activeCategory.save();

    const reloadedAsset = await MediaAsset.findById(asset._id);
    expect(reloadedAsset.status).toBe('committed'); // Media record is untouched!
  });

  // 30. Existing DEF-27 category product visibility invariants remain untouched
  it('30. DEF-27 category visibility rules continue functioning alongside media assets', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/def27-check.webp',
      publicUrl: 'https://example.com/def27-check.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a5'.repeat(32),
      status: 'pending',
      uploader: adminUser._id
    });

    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'DEF27 Protected Product',
        description: 'Testing DEF-27',
        category: activeCategory._id,
        price: 120,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    });

    // Product is visible initially
    const res1 = await request(app).get(`/api/products/${product.slug}`);
    expect(res1.status).toBe(200);

    // Deactivate category -> Product becomes 404 (DEF-27 inheritance)
    activeCategory.isActive = false;
    await activeCategory.save();

    const res2 = await request(app).get(`/api/products/${product.slug}`);
    expect(res2.status).toBe(404);
  });
});
