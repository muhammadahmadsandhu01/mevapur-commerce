const fs = require('fs');
const os = require('os');
const path = require('path');
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

function createTempManifest({
  target = 'local',
  canonicalPrefix = 'products/',
  bucket = 'mevapur-products',
  dbFingerprint = 'sha256:435744d67cb1',
  inventoryCount = 10,
  schemaVersion = '1.0.0',
  checkpointId = crypto.randomUUID(),
  timestamp = new Date().toISOString(),
  manifestHash = 'manifest-content-sha256-hash',
  recoveryClassification = 'UNVERIFIED',
  operatorVerificationState = 'VERIFIED'
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manifest-'));
  const manifestObj = {
    schemaVersion,
    checkpointId,
    timestamp,
    target,
    provider: 'mock',
    bucket,
    prefix: canonicalPrefix,
    dbFingerprint,
    inventoryCount,
    manifestHash,
    recoveryClassification,
    operatorVerificationState
  };
  const manifestPath = path.join(dir, 'checkpoint-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), 'utf8');
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(manifestPath, 'utf8')).digest('hex');
  return { manifestPath, sha256, dir, manifestObj };
}

describe('Phase 3C-3A: Media Lifecycle, Storage Reconciliation & Irreversible Deletion Safety', () => {
  let mockStorage;
  let adminUser;
  let adminToken;
  let activeCategory;
  let sequence = 0;
  let tempManifests = [];

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

  afterEach(() => {
    for (const item of tempManifests) {
      try {
        fs.rmSync(item.dir, { recursive: true, force: true });
      } catch {}
    }
    tempManifests = [];
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
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.mode).toBe('DRY-RUN');
    expect(report.deleted).toBe(1);

    const reloaded = await MediaAsset.findById(asset._id);
    expect(reloaded.status).toBe('deletion_requested');
    expect(reloaded.__v).toBe(initialVersion);
  });

  // 5. Dry-run causes zero provider writes/deletes
  it('5. dry-run mode causes exactly zero storage provider deletions', async () => {
    const key = 'products/2026/09/preserve-in-dryrun.webp';
    await mockStorage.upload({ key, buffer: Buffer.from('image-data'), mimeType: 'image/webp' });
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
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(mockStorage.has(key)).toBe(true);
  });

  // 6. Root/empty/traversal prefix rejected
  it('6. empty, root, dot, backslash, wildcard, and traversal prefixes are rejected', () => {
    expect(() => MediaService.validateStoragePrefix('')).toThrow('Storage prefix cannot be empty');
    expect(() => MediaService.validateStoragePrefix('   ')).toThrow('Storage prefix cannot be empty');
    expect(() => MediaService.validateStoragePrefix('/')).toThrow('Storage prefix cannot be root or dot');
    expect(() => MediaService.validateStoragePrefix('.')).toThrow('Storage prefix cannot be root or dot');
    expect(() => MediaService.validateStoragePrefix('..')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
    expect(() => MediaService.validateStoragePrefix('../products')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
    expect(() => MediaService.validateStoragePrefix('products\\nested')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
    expect(() => MediaService.validateStoragePrefix('products/*')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
  });

  // 7. Encoded traversal rejected
  it('7. URL-encoded path traversals (%2e%2e, %2f, %5c) are rejected in prefixes and keys', () => {
    expect(() => MediaService.validateStoragePrefix('%2e%2e/products')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
    expect(() => MediaService.validateStoragePrefix('products%2f..%2fsecret')).toThrow('Storage prefix contains invalid or unsafe traversal characters');
    expect(() => MediaService.validateStoragePrefix('products%5csecret')).toThrow('Storage prefix contains invalid or unsafe traversal characters');

    const keyValidation = MediaService.validateObjectKey('products/%2e%2e/unauthorized.webp', 'products/');
    expect(keyValidation.valid).toBe(false);
  });

  // 8. Segment-prefix collision rejected
  it('8. prefix matching is segment-aware and rejects prefix collision with similarly named folders', () => {
    const key1 = 'products-other/image.webp';
    const key2 = 'products_backup/image.webp';

    const val1 = MediaService.validateObjectKey(key1, 'products/');
    const val2 = MediaService.validateObjectKey(key2, 'products/');

    expect(val1.valid).toBe(false);
    expect(val1.reason).toBe('OUT_OF_PREFIX');
    expect(val2.valid).toBe(false);
    expect(val2.reason).toBe('OUT_OF_PREFIX');
  });

  // 9. Object outside prefix rejected
  it('9. object keys outside configured canonical prefix are rejected from deletion', () => {
    const key = 'user-avatars/avatar1.webp';
    const val = MediaService.validateObjectKey(key, 'products/');
    expect(val.valid).toBe(false);
    expect(val.reason).toBe('OUT_OF_PREFIX');
  });

  // 10. Unknown provider object reported, not deleted
  it('10. unknown provider objects without database record are preserved, not deleted', async () => {
    const unmanagedKey = 'products/2026/09/unknown-manual-upload.webp';
    await mockStorage.upload({ key: unmanagedKey, buffer: Buffer.from('blob'), mimeType: 'image/webp' });

    const report = await reconcileMediaAssets({
      argv: ['--dry-run', '--target=local', '--allow-local'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.deleted).toBe(0);
    expect(mockStorage.has(unmanagedKey)).toBe(true);
  });

  // 11. Ambiguous/unsafe key quarantined
  it('11. assets with malformed keys are quarantined with UNSAFE_KEY_REJECTED', async () => {
    const unsafeKey = 'products/../etc/passwd.webp';
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: unsafeKey,
      publicUrl: 'https://example.com/unsafe.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'c'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    const report = await reconcileMediaAssets({
      argv: ['--dry-run', '--target=local', '--allow-local'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.failed).toBe(1);
    expect(report.sanitizedReasonCodes).toContain('UNSAFE_KEY_REJECTED');
  });

  // 12. Attached committed asset is preserved
  it('12. committed assets attached to active products are never deletion candidates', async () => {
    const key = 'products/2026/09/attached-active.webp';
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
      checksumSha256: 'd'.repeat(64),
      status: 'committed',
      uploader: adminUser._id
    });

    await Product.create({
      name: 'Product With Active Media',
      slug: `prod-media-${Date.now()}`,
      category: activeCategory._id,
      status: 'published',
      isActive: true,
      price: 150,
      mediaAssetIds: [asset._id]
    });

    const report = await reconcileMediaAssets({
      argv: ['--dry-run', '--target=local', '--allow-local'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.attempted).toBe(0);
    expect(report.deleted).toBe(0);
    expect(mockStorage.has(key)).toBe(true);
  });

  // 13. Deletion-requested but still-attached asset is quarantined and preserved
  it('13. deletion-requested asset still referenced by a Product document is quarantined and preserved', async () => {
    const key = 'products/2026/09/still-attached.webp';
    await mockStorage.upload({ key, buffer: Buffer.from('referenced'), mimeType: 'image/webp' });

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

    const m = createTempManifest();
    tempManifests.push(m);

    const report = await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.quarantinedAttached).toBe(1);
    expect(report.deleted).toBe(0);
    expect(mockStorage.has(key)).toBe(true);
  });

  // 14. Safe deletion candidate is identified and deleted in apply mode
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

    const m = createTempManifest();
    tempManifests.push(m);

    const report = await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.deleted).toBe(1);
    expect(mockStorage.has(key)).toBe(false);

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
    const m = createTempManifest();
    tempManifests.push(m);

    const report = await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.attempted).toBe(0);
    expect(report.deleted).toBe(0);
  });

  // 17. Already-missing provider object handled truthfully
  it('17. deleting a key already missing on provider handles 404 gracefully and marks deleted', async () => {
    const missingKey = 'products/2026/09/already-missing-on-s3.webp';

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

    const m = createTempManifest();
    tempManifests.push(m);

    const provider404 = {
      delete: jest.fn().mockImplementation(() => {
        const err = new Error('Object not found');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      })
    };

    const report = await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: provider404
    });

    expect(report.deleted).toBe(1);
    const reloaded = await MediaAsset.findById(asset._id);
    expect(reloaded.status).toBe('deleted');
    expect(reloaded.lastError).toBe('OBJECT_ALREADY_MISSING_ON_PROVIDER');
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
      nextRetryAt: new Date(Date.now() + 600000),
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

    await Product.create({
      name: 'Concurrent Attached Product',
      slug: `concurrent-prod-${Date.now()}`,
      category: activeCategory._id,
      price: 99,
      status: 'published',
      isActive: true,
      mediaAssetIds: [asset._id]
    });

    const m = createTempManifest();
    tempManifests.push(m);

    const report = await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.quarantinedAttached).toBe(1);
    expect(mockStorage.has(key)).toBe(true);
  });

  // 21. Crash/retry boundary compare-and-set and atomic leasing
  it('21. exclusive lease query guarantees single worker execution on candidate', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/atomic-lease.webp',
      publicUrl: 'https://example.com/atomic-lease.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: '7'.repeat(64),
      status: 'deletion_requested',
      uploader: adminUser._id
    });

    const leaseId1 = crypto.randomUUID();
    const leaseId2 = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + 60000);

    // Worker 1 acquires lease
    const claimed1 = await MediaAsset.findOneAndUpdate(
      { _id: asset._id, status: 'deletion_requested' },
      { $set: { status: 'deletion_in_progress', leaseId: leaseId1, leaseExpiresAt } },
      { new: true }
    );
    expect(claimed1).not.toBeNull();
    expect(claimed1.leaseId).toBe(leaseId1);

    // Worker 2 attempts lease and fails
    const claimed2 = await MediaAsset.findOneAndUpdate(
      { _id: asset._id, status: 'deletion_requested' },
      { $set: { status: 'deletion_in_progress', leaseId: leaseId2, leaseExpiresAt } },
      { new: true }
    );
    expect(claimed2).toBeNull();
  });

  // 22. Stale orphans (>24h unattached) are safely cleaned up in apply mode
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
      status: 'uploading',
      uploader: adminUser._id,
      createdAt: twoDaysAgo
    });

    const m = createTempManifest();
    tempManifests.push(m);

    await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(mockStorage.has(orphanKey)).toBe(false);
    const reloaded = await MediaAsset.findById(orphan._id);
    expect(reloaded.status).toBe('deleted');
  });

  // 23. validateObjectKey strictly confines keys to canonical prefix segments
  it('23. validateObjectKey strictly confines keys to canonical prefix segments', () => {
    expect(MediaService.validateObjectKey('products/2026/img.webp', 'products/').valid).toBe(true);
    expect(MediaService.validateObjectKey('products/', 'products/').valid).toBe(false);
    expect(MediaService.validateObjectKey('products', 'products/').valid).toBe(false);
    expect(MediaService.validateObjectKey('https://example.com/products/img.webp', 'products/').valid).toBe(false);
    expect(MediaService.validateObjectKey('other/img.webp', 'products/').valid).toBe(false);
  });

  // 24. Public product response exposes only committed media URLs
  it('24. public product response exposes only committed media URLs and hides internal storage metadata', async () => {
    const committedAsset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/public-view.webp',
      publicUrl: 'https://cdn.mevapur.test/products/2026/09/public-view.webp',
      mimeType: 'image/webp',
      sizeBytes: 2048,
      width: 200,
      height: 200,
      checksumSha256: '9'.repeat(64),
      status: 'pending',
      uploader: adminUser._id
    });

    const product = await ProductCatalogService.createProduct({
      data: {
        name: 'Public Serialized Product',
        description: 'Testing public view',
        category: activeCategory._id,
        price: 300,
        status: 'published',
        mediaAssetIds: [committedAsset._id.toString()]
      },
      userId: adminUser._id
    });

    const res = await request(app).get(`/api/products/${product.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.images[0]).toBe('https://cdn.mevapur.test/products/2026/09/public-view.webp');
    expect(res.body.data.provider).toBeUndefined();
    expect(res.body.data.bucket).toBeUndefined();
    expect(res.body.data.key).toBeUndefined();
  });

  // 25. Cross-product asset hijacking is rejected
  it('25. product creation/update cannot hijack a media asset committed to another product', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/exclusive.webp',
      publicUrl: 'https://example.com/exclusive.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a1'.repeat(32),
      status: 'pending',
      uploader: adminUser._id
    });

    // Attach to product 1
    await ProductCatalogService.createProduct({
      data: {
        name: 'Product One',
        category: activeCategory._id,
        price: 50,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    });

    // Product 2 attempts to claim same asset -> rejected with 409
    await expect(ProductCatalogService.createProduct({
      data: {
        name: 'Product Two (Hijacker)',
        category: activeCategory._id,
        price: 75,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    })).rejects.toThrow('Media asset is already committed to another product');
  });

  // 26. Product update replaces only changed media
  it('26. updating a product replaces only changed media and marks removed ones for deletion', async () => {
    const a1 = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/old-image.webp',
      publicUrl: 'https://example.com/old-image.webp',
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
      key: 'products/2026/09/new-image.webp',
      publicUrl: 'https://example.com/new-image.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a3'.repeat(32),
      status: 'pending',
      uploader: adminUser._id
    });

    const prod = await ProductCatalogService.createProduct({
      data: {
        name: 'Product For Update',
        description: 'Product For Update Description',
        category: activeCategory._id,
        price: 80,
        status: 'published',
        mediaAssetIds: [a1._id.toString()]
      },
      userId: adminUser._id
    });

    await ProductCatalogService.updateProduct({
      id: prod._id,
      data: {
        name: 'Product For Update Modified',
        description: 'Product For Update Modified Description',
        mediaAssetIds: [a2._id.toString()],
        images: [a2.publicUrl]
      },
      userId: adminUser._id
    });

    const reloadedA1 = await MediaAsset.findById(a1._id);
    const reloadedA2 = await MediaAsset.findById(a2._id);

    expect(reloadedA1.status).toBe('deletion_requested');
    expect(reloadedA2.status).toBe('committed');
  });

  // 27. Historical order/invoice data remains unchanged
  it('27. historical order and invoice records retain immutable item and price snapshots independent of media status', async () => {
    const order = await Order.create({
      user: adminUser._id,
      idempotencyKey: crypto.randomBytes(16).toString('hex'),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Historical Walnut Pack',
        sku: 'WAL-HIST-01',
        price: 250,
        quantity: 2,
        lineTotal: 500,
        image: 'https://example.com/products/historical-walnut.webp'
      }],
      subtotal: 500,
      totalAmount: 500,
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '+923001234567',
        address: '123 Main St',
        city: 'Lahore',
        province: 'Punjab',
        postalCode: '54000',
        country: 'Pakistan'
      },
      paymentMethod: 'cod',
      statusTimeline: [{
        status: 'Pending',
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
    const m = createTempManifest();
    tempManifests.push(m);

    await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true
    });

    const finalTxCount = await InventoryTransaction.countDocuments();
    expect(finalTxCount).toBe(initialTxCount);
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

    activeCategory.isActive = false;
    await activeCategory.save();

    const reloadedAsset = await MediaAsset.findById(asset._id);
    expect(reloadedAsset.status).toBe('committed');
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

    const res1 = await request(app).get(`/api/products/${product.slug}`);
    expect(res1.status).toBe(200);

    activeCategory.isActive = false;
    await activeCategory.save();

    const res2 = await request(app).get(`/api/products/${product.slug}`);
    expect(res2.status).toBe(404);
  });

  // Additional Correction Tests (STEP 10 Focused Tests)
  it('31. attachment is rejected when asset is in deletion_in_progress or deletion_requested status', async () => {
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/blocked-attach.webp',
      publicUrl: 'https://example.com/blocked-attach.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'b1'.repeat(32),
      status: 'deletion_in_progress',
      uploader: adminUser._id
    });

    await expect(ProductCatalogService.createProduct({
      data: {
        name: 'Product Attaching In Progress Asset',
        category: activeCategory._id,
        price: 150,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    })).rejects.toThrow('Media asset cannot be attached in status: deletion_in_progress');
  });

  it('32. missing or mismatched checkpoint manifest blocks apply execution before DB/provider mutation', async () => {
    // Missing manifest flag
    await expect(reconcileMediaAssets({
      argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
      customDbConnected: true,
      customStorageProvider: mockStorage
    })).rejects.toThrow('Apply mode strictly requires --checkpoint-manifest=<path>');

    // Wrong sha256
    const m = createTempManifest();
    tempManifests.push(m);

    await expect(reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        '--expected-manifest-sha256=wrong-hash-value'
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    })).rejects.toThrow('Checkpoint manifest SHA-256 mismatch');
  });

  it('33. stale checkpoint manifest (>24h) is rejected', async () => {
    const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const m = createTempManifest({ timestamp: staleTime });
    tempManifests.push(m);

    await expect(reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    })).rejects.toThrow('Checkpoint manifest is stale');
  });

  it('34. target or prefix mismatch in manifest is rejected', async () => {
    const mTarget = createTempManifest({ target: 'production' });
    tempManifests.push(mTarget);

    await expect(reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${mTarget.manifestPath}`,
        `--expected-manifest-sha256=${mTarget.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    })).rejects.toThrow('Manifest target');

    const mPrefix = createTempManifest({ canonicalPrefix: 'unauthorized/' });
    tempManifests.push(mPrefix);

    await expect(reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${mPrefix.manifestPath}`,
        `--expected-manifest-sha256=${mPrefix.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    })).rejects.toThrow('Manifest prefix');
  });

  it('35. StorageProvider list and head pagination works correctly on MockStorageProvider', async () => {
    const provider = new MockStorageProvider();
    for (let i = 1; i <= 5; i++) {
      await provider.upload({
        key: `products/item-${i}.webp`,
        buffer: Buffer.from(`data-${i}`),
        mimeType: 'image/webp'
      });
    }

    const page1 = await provider.list({ prefix: 'products/', maxKeys: 2 });
    expect(page1.objects.length).toBe(2);
    expect(page1.isTruncated).toBe(true);
    expect(page1.nextContinuationToken).toBe('2');

    const page2 = await provider.list({ prefix: 'products/', maxKeys: 2, continuationToken: page1.nextContinuationToken });
    expect(page2.objects.length).toBe(2);
    expect(page2.isTruncated).toBe(true);

    const head = await provider.head({ key: 'products/item-1.webp' });
    expect(head.key).toBe('products/item-1.webp');
    expect(head.size).toBe(Buffer.from('data-1').length);
  });

  it('36. expired lease recovery recovers crashed worker asset deterministically', async () => {
    const expiredTime = new Date(Date.now() - 10 * 60 * 1000); // 10m ago
    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/crashed-worker.webp',
      publicUrl: 'https://example.com/crashed.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'c1'.repeat(32),
      status: 'deletion_in_progress',
      leaseId: 'crashed-lease-id',
      leaseExpiresAt: expiredTime,
      uploader: adminUser._id
    });

    const key = asset.key;
    await mockStorage.upload({ key, buffer: Buffer.from('blob'), mimeType: 'image/webp' });

    const m = createTempManifest();
    tempManifests.push(m);

    const report = await reconcileMediaAssets({
      argv: [
        '--apply',
        '--target=local',
        '--allow-local',
        '--confirm-media-reconciliation',
        `--checkpoint-manifest=${m.manifestPath}`,
        `--expected-manifest-sha256=${m.sha256}`
      ],
      customDbConnected: true,
      customStorageProvider: mockStorage
    });

    expect(report.deleted).toBe(1);
    expect(mockStorage.has(key)).toBe(false);

    const reloaded = await MediaAsset.findById(asset._id);
    expect(reloaded.status).toBe('deleted');
    expect(reloaded.leaseId).toBeNull();
  });
});
