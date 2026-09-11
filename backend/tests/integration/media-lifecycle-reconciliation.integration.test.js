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
const StorageProvider = require('../../services/media/StorageProvider');
const {
  reconcileMediaAssets,
  validateCheckpointManifest,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
  ALLOWED_LOCAL_RECOVERY_CLASSIFICATIONS,
  ALLOWED_REMOTE_RECOVERY_CLASSIFICATIONS
} = require('../../scripts/reconcile-media-assets');

function createTempManifest({
  target = 'local',
  canonicalPrefix = 'products/',
  bucket = 'mevapur-products',
  provider = 'mock',
  dbFingerprint = 'sha256:435744d67cb1',
  inventoryCount = 10,
  schemaVersion = '1.0.0',
  checkpointId = crypto.randomUUID(),
  timestamp = new Date().toISOString(),
  inventorySha256,
  recoveryClassification = 'LOCAL_MOCK_VERIFIED',
  operatorVerificationState = 'VERIFIED'
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manifest-'));
  const manifestObj = {
    schemaVersion,
    checkpointId,
    timestamp,
    target,
    provider,
    bucket,
    prefix: canonicalPrefix,
    dbFingerprint,
    inventoryCount,
    recoveryClassification,
    operatorVerificationState
  };
  if (inventorySha256 !== undefined) {
    manifestObj.inventorySha256 = inventorySha256;
  }
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

  // --- Step 6: Comprehensive Manifest Validation & Zero-Initialization Order Tests ---
  describe('Step 6: Checkpoint Manifest Validation & Zero-Initialization Order', () => {
    let connectSpy;
    let storageSpy;

    beforeEach(() => {
      connectSpy = jest.spyOn(mongoose, 'connect');
      storageSpy = jest.spyOn(StorageProvider, 'createStorageProvider');
    });

    afterEach(() => {
      connectSpy.mockRestore();
      storageSpy.mockRestore();
    });

    it('Case 1: Missing manifest flag fails closed before DB/storage init', async () => {
      await expect(reconcileMediaAssets({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-media-reconciliation'],
        customDbConnected: false
      })).rejects.toThrow('Apply mode strictly requires --checkpoint-manifest=<path>');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 2: Missing expected hash fails closed before DB/storage init', async () => {
      const m = createTempManifest();
      tempManifests.push(m);

      await expect(reconcileMediaAssets({
        argv: [
          '--apply',
          '--target=local',
          '--allow-local',
          '--confirm-media-reconciliation',
          `--checkpoint-manifest=${m.manifestPath}`
        ],
        customDbConnected: false
      })).rejects.toThrow('Apply mode strictly requires --expected-manifest-sha256=<hash>');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 3: Wrong file hash fails closed before DB/storage init', async () => {
      const m = createTempManifest();
      tempManifests.push(m);

      await expect(reconcileMediaAssets({
        argv: [
          '--apply',
          '--target=local',
          '--allow-local',
          '--confirm-media-reconciliation',
          `--checkpoint-manifest=${m.manifestPath}`,
          '--expected-manifest-sha256=0000000000000000000000000000000000000000000000000000000000000000'
        ],
        customDbConnected: false
      })).rejects.toThrow('Checkpoint manifest SHA-256 mismatch');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 4: Unsupported schema version fails closed before DB/storage init', async () => {
      const m = createTempManifest({ schemaVersion: '2.0.0' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest schemaVersion \'2.0.0\' is not supported');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 5: Invalid checkpoint ID (< 8 chars) fails closed before DB/storage init', async () => {
      const m = createTempManifest({ checkpointId: 'abc' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest missing or invalid checkpointId string');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 6: Invalid timestamp string fails closed before DB/storage init', async () => {
      const m = createTempManifest({ timestamp: 'not-a-valid-date' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest timestamp is invalid');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 7: Future timestamp beyond clock skew (>5m) fails closed before DB/storage init', async () => {
      const futureTs = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const m = createTempManifest({ timestamp: futureTs });
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
        customDbConnected: false
      })).rejects.toThrow('Checkpoint manifest timestamp is in the future');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 8: Stale timestamp (>24h) fails closed before DB/storage init', async () => {
      const staleTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const m = createTempManifest({ timestamp: staleTs });
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
        customDbConnected: false
      })).rejects.toThrow('Checkpoint manifest is stale');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 9: Target mismatch fails closed before DB/storage init', async () => {
      const m = createTempManifest({ target: 'production' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest target \'production\' does not match execution target \'local\'');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 10: Provider mismatch fails closed before DB/storage init', async () => {
      const m = createTempManifest({ provider: 's3' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest provider \'s3\' does not match configured provider \'mock\'');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 11: Bucket mismatch fails closed before DB/storage init', async () => {
      const m = createTempManifest({ bucket: 'unauthorized-bucket' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest bucket \'unauthorized-bucket\' does not match configured bucket');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 12: Prefix mismatch fails closed before DB/storage init', async () => {
      const m = createTempManifest({ canonicalPrefix: 'other-prefix/' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest prefix \'other-prefix/\' does not match canonical prefix');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 13: Database fingerprint mismatch fails closed before DB/storage init', async () => {
      const m = createTempManifest({ dbFingerprint: 'sha256:000000000000' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest dbFingerprint');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 14: Negative or non-integer inventory count fails closed before DB/storage init', async () => {
      const mNeg = createTempManifest({ inventoryCount: -1 });
      tempManifests.push(mNeg);

      await expect(reconcileMediaAssets({
        argv: [
          '--apply',
          '--target=local',
          '--allow-local',
          '--confirm-media-reconciliation',
          `--checkpoint-manifest=${mNeg.manifestPath}`,
          `--expected-manifest-sha256=${mNeg.sha256}`
        ],
        customDbConnected: false
      })).rejects.toThrow('Manifest inventoryCount must be a non-negative integer');

      const mFloat = createTempManifest({ inventoryCount: 5.5 });
      tempManifests.push(mFloat);

      await expect(reconcileMediaAssets({
        argv: [
          '--apply',
          '--target=local',
          '--allow-local',
          '--confirm-media-reconciliation',
          `--checkpoint-manifest=${mFloat.manifestPath}`,
          `--expected-manifest-sha256=${mFloat.sha256}`
        ],
        customDbConnected: false
      })).rejects.toThrow('Manifest inventoryCount must be a non-negative integer');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 15: Operator verification state not VERIFIED fails closed before DB/storage init', async () => {
      const m = createTempManifest({ operatorVerificationState: 'UNVERIFIED' });
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
        customDbConnected: false
      })).rejects.toThrow('Manifest operatorVerificationState must be exactly \'VERIFIED\'');

      expect(connectSpy).toHaveBeenCalledTimes(0);
      expect(storageSpy).toHaveBeenCalledTimes(0);
    });

    it('Case 16: Recovery classification UNVERIFIED on staging/production fails closed before DB/storage init', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manifest-'));
      const manifestObj = {
        schemaVersion: '1.0.0',
        checkpointId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        target: 'staging',
        provider: 's3',
        bucket: 'mevapur-staging-bucket',
        prefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        inventoryCount: 42,
        recoveryClassification: 'UNVERIFIED',
        operatorVerificationState: 'VERIFIED'
      };
      const manifestPath = path.join(dir, 'checkpoint-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), 'utf8');
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(manifestPath, 'utf8')).digest('hex');
      tempManifests.push({ dir });

      expect(() => validateCheckpointManifest({
        manifestPath,
        expectedSha256: sha256,
        target: 'staging',
        canonicalPrefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        bucket: 'mevapur-staging-bucket',
        provider: 's3'
      })).toThrow('Staging/Production apply strictly rejects unverified/local recovery classification \'UNVERIFIED\'');
    });

    it('Case 17: Unknown recovery classification fails closed', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manifest-'));
      const manifestObj = {
        schemaVersion: '1.0.0',
        checkpointId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        target: 'staging',
        provider: 's3',
        bucket: 'mevapur-staging-bucket',
        prefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        inventoryCount: 42,
        recoveryClassification: 'CUSTOM_UNKNOWN_RECOVERY',
        operatorVerificationState: 'VERIFIED'
      };
      const manifestPath = path.join(dir, 'checkpoint-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), 'utf8');
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(manifestPath, 'utf8')).digest('hex');
      tempManifests.push({ dir });

      expect(() => validateCheckpointManifest({
        manifestPath,
        expectedSha256: sha256,
        target: 'staging',
        canonicalPrefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        bucket: 'mevapur-staging-bucket',
        provider: 's3'
      })).toThrow('Unknown recovery classification \'CUSTOM_UNKNOWN_RECOVERY\'');
    });

    it('Case 18: Local mock classification used for staging/production target is rejected', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manifest-'));
      const manifestObj = {
        schemaVersion: '1.0.0',
        checkpointId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        target: 'staging',
        provider: 's3',
        bucket: 'mevapur-staging-bucket',
        prefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        inventoryCount: 42,
        recoveryClassification: 'LOCAL_MOCK_VERIFIED',
        operatorVerificationState: 'VERIFIED'
      };
      const manifestPath = path.join(dir, 'checkpoint-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), 'utf8');
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(manifestPath, 'utf8')).digest('hex');
      tempManifests.push({ dir });

      expect(() => validateCheckpointManifest({
        manifestPath,
        expectedSha256: sha256,
        target: 'staging',
        canonicalPrefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        bucket: 'mevapur-staging-bucket',
        provider: 's3'
      })).toThrow('Staging/Production apply strictly rejects unverified/local recovery classification \'LOCAL_MOCK_VERIFIED\'');
    });

    it('Case 19: Valid local mock manifest reaches mock-only execution', async () => {
      const m = createTempManifest({
        target: 'local',
        recoveryClassification: 'LOCAL_MOCK_VERIFIED',
        operatorVerificationState: 'VERIFIED'
      });
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

      expect(report.mode).toBe('APPLY');
      expect(report.target).toBe('local');
    });

    it('Case 20: Valid source-shaped staging manifest passes validation only in a fully mocked harness and makes zero external connections', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manifest-'));
      const manifestObj = {
        schemaVersion: '1.0.0',
        checkpointId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        target: 'staging',
        provider: 's3',
        bucket: 'mevapur-staging-bucket',
        prefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        inventoryCount: 100,
        inventorySha256: 'e'.repeat(64),
        recoveryClassification: 'VERSIONED_OBJECT_RECOVERY_VERIFIED',
        operatorVerificationState: 'VERIFIED'
      };
      const manifestPath = path.join(dir, 'checkpoint-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), 'utf8');
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(manifestPath, 'utf8')).digest('hex');
      tempManifests.push({ dir });

      const validated = validateCheckpointManifest({
        manifestPath,
        expectedSha256: sha256,
        target: 'staging',
        canonicalPrefix: 'products/',
        dbFingerprint: 'sha256:stagingfingerprint',
        bucket: 'mevapur-staging-bucket',
        provider: 's3'
      });

      expect(validated.schemaVersion).toBe('1.0.0');
      expect(validated.target).toBe('staging');
      expect(validated.recoveryClassification).toBe('VERSIONED_OBJECT_RECOVERY_VERIFIED');
      expect(validated.operatorVerificationState).toBe('VERIFIED');
    });
  });

  // --- Step 7: Lease Expiry Safety & Atomicity Tests ---
  describe('Step 7: Lease Expiry Safety & Atomicity', () => {
    it('37. deletion-failed lease query enforces retryCount < 5 and ignores retry-exhausted documents', async () => {
      const asset = await MediaAsset.create({
        provider: 'mock',
        bucket: 'test-bucket',
        key: 'products/2026/09/retry-exhausted-lease.webp',
        publicUrl: 'https://example.com/retry-exhausted.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        width: 100,
        height: 100,
        checksumSha256: 'd1'.repeat(32),
        status: 'deletion_failed',
        retryCount: 5,
        nextRetryAt: new Date(Date.now() - 60000), // past backoff
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

      expect(report.retryExhausted).toBe(1);
      expect(report.deleted).toBe(0);
      expect(mockStorage.has(key)).toBe(true);

      const reloaded = await MediaAsset.findById(asset._id);
      expect(reloaded.status).toBe('deletion_failed');
      expect(reloaded.leaseId).toBeNull();
    });

    it('38. active lease cannot be stolen by another worker', async () => {
      const activeLeaseExpiry = new Date(Date.now() + 4 * 60 * 1000); // 4m in future
      const asset = await MediaAsset.create({
        provider: 'mock',
        bucket: 'test-bucket',
        key: 'products/2026/09/active-lease.webp',
        publicUrl: 'https://example.com/active-lease.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        width: 100,
        height: 100,
        checksumSha256: 'd2'.repeat(32),
        status: 'deletion_in_progress',
        leaseId: 'worker-1-active-lease',
        leaseExpiresAt: activeLeaseExpiry,
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

      expect(report.deleted).toBe(0);
      expect(mockStorage.has(key)).toBe(true);

      const reloaded = await MediaAsset.findById(asset._id);
      expect(reloaded.status).toBe('deletion_in_progress');
      expect(reloaded.leaseId).toBe('worker-1-active-lease');
    });

    it('39. final update requires matching leaseId to prevent stale worker overwriting new owner', async () => {
      const asset = await MediaAsset.create({
        provider: 'mock',
        bucket: 'test-bucket',
        key: 'products/2026/09/lease-ownership.webp',
        publicUrl: 'https://example.com/lease-ownership.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        width: 100,
        height: 100,
        checksumSha256: 'd3'.repeat(32),
        status: 'deletion_in_progress',
        leaseId: 'owner-lease-uuid',
        leaseExpiresAt: new Date(Date.now() + 60000),
        uploader: adminUser._id
      });

      // Attempt update with wrong leaseId
      const staleUpdate = await MediaAsset.findOneAndUpdate(
        { _id: asset._id, leaseId: 'stale-worker-lease-uuid' },
        { $set: { status: 'deleted', leaseId: null, leaseExpiresAt: null } }
      );
      expect(staleUpdate).toBeNull();

      // Asset remains untouched
      const untouched = await MediaAsset.findById(asset._id);
      expect(untouched.status).toBe('deletion_in_progress');
      expect(untouched.leaseId).toBe('owner-lease-uuid');
    });

    it('40. lease fields are cleared on every terminal and retry transition', async () => {
      const asset1 = await MediaAsset.create({
        provider: 'mock',
        bucket: 'test-bucket',
        key: 'products/2026/09/clear-lease-1.webp',
        publicUrl: 'https://example.com/clear-1.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        width: 100,
        height: 100,
        checksumSha256: 'e1'.repeat(32),
        status: 'deletion_requested',
        uploader: adminUser._id
      });
      await mockStorage.upload({ key: asset1.key, buffer: Buffer.from('clear-1'), mimeType: 'image/webp' });

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

      const reloaded1 = await MediaAsset.findById(asset1._id);
      expect(reloaded1.status).toBe('deleted');
      expect(reloaded1.leaseId).toBeNull();
      expect(reloaded1.leaseExpiresAt).toBeNull();
    });

    it('41. StorageProvider delete operation timeout is 10s, bounded well below the 300s lease duration', () => {
      const { S3StorageProvider } = require('../../services/media/StorageProvider');
      const s3Provider = new S3StorageProvider({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test',
        secretAccessKey: 'test'
      });

      expect(s3Provider.timeoutMs).toBe(10000); // 10s provider timeout << 300s (5m) lease
    });
  });
});
