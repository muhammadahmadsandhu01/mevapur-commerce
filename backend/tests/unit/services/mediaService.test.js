const crypto = require('crypto');
const sharp = require('sharp');
const mongoose = require('mongoose');
const MediaAsset = require('../../../models/MediaAsset');
const MediaService = require('../../../services/media/MediaService');
const { MockStorageProvider } = require('../../../services/media/StorageProvider');
const ProductCatalogService = require('../../../services/product/ProductCatalogService');
const Category = require('../../../models/Category');

describe('MediaService Safety-Critical Unit Tests', () => {
  let mockStorage;
  let userId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();
    mockStorage = new MockStorageProvider();
    MediaService.storageProvider = mockStorage;
  });

  it('persists MediaAsset in uploading state before provider upload invocation', async () => {
    const jpegBuffer = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 50, g: 150, b: 250 } }
    }).jpeg().toBuffer();

    let assetStateDuringUpload = null;
    const inspectingStorage = {
      getUrl: (key) => `https://example.com/${key}`,
      upload: async ({ key }) => {
        // Inspect database state while upload is executing
        const asset = await MediaAsset.findOne({ key });
        assetStateDuringUpload = asset ? asset.status : null;
        return { key, url: `https://example.com/${key}` };
      }
    };
    MediaService.storageProvider = inspectingStorage;

    const file = {
      buffer: jpegBuffer,
      mimetype: 'image/jpeg',
      originalname: 'uploading-state-test.jpg'
    };

    const result = await MediaService.processAndUpload({ file, userId });
    expect(assetStateDuringUpload).toBe('uploading'); // Proves pre-upload persistence!

    const finalAsset = await MediaAsset.findById(result.mediaAssetId);
    expect(finalAsset.status).toBe('pending');
  });

  it('successfully processes, encodes to WebP, strips EXIF, and calculates accurate SHA-256 checksum', async () => {
    const jpegBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } }
    }).withMetadata({ exif: { IFD0: { Copyright: 'MevaPur Private Data' } } }).jpeg().toBuffer();

    const file = {
      buffer: jpegBuffer,
      mimetype: 'image/jpeg',
      originalname: 'test-photo.jpg'
    };

    const result = await MediaService.processAndUpload({ file, userId });

    expect(result).toHaveProperty('mediaAssetId');
    expect(result).toHaveProperty('url');
    expect(result.url).toMatch(/\.webp$/);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);

    // Verify persisted MediaAsset document
    const asset = await MediaAsset.findById(result.mediaAssetId);
    expect(asset).not.toBeNull();
    expect(asset.status).toBe('pending');
    expect(asset.mimeType).toBe('image/webp');
    expect(asset.uploader.toString()).toBe(userId.toString());

    // Verify stored object in MockStorageProvider
    const storedObject = mockStorage.storage.get(asset.key);
    expect(storedObject).toBeDefined();

    // Verify EXIF metadata absence from output WebP
    const outputMeta = await sharp(storedObject.buffer).metadata();
    expect(outputMeta.exif).toBeUndefined();

    // Verify exact checksum match
    const computedHash = crypto.createHash('sha256').update(storedObject.buffer).digest('hex');
    expect(asset.checksumSha256).toBe(computedHash);
    expect(result.checksum).toBe(computedHash);
  });

  it('rejects animated and multi-page images with MEDIA_ANIMATED_PROHIBITED', async () => {
    const jpegBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 10, g: 20, b: 30 } }
    }).jpeg().toBuffer();

    // Mock metadata with pages > 1 on a valid image
    jest.spyOn(sharp.prototype, 'metadata').mockResolvedValueOnce({
      format: 'jpeg',
      width: 50,
      height: 50,
      pages: 3 // Animated/multi-page
    });

    const file = {
      buffer: jpegBuffer,
      mimetype: 'image/jpeg',
      originalname: 'animated.jpg'
    };

    await expect(MediaService.processAndUpload({ file, userId }))
      .rejects.toThrow('Animated and multi-page images are prohibited');
  });

  it('committed asset cannot be reassigned/attached to a different product', async () => {
    const adminUser = await global.createTestUser({
      email: `adm-${Date.now()}@example.test`,
      role: 'admin'
    });

    const testCat = await Category.create({
      name: `Cat-${Date.now()}`,
      slug: `cat-${Date.now()}`
    });

    const asset = await MediaAsset.create({
      provider: 'mock',
      bucket: 'test-bucket',
      key: 'products/2026/09/attached-asset.webp',
      publicUrl: 'https://example.com/attached.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      checksumSha256: 'a'.repeat(64),
      status: 'pending',
      uploader: adminUser._id
    });

    // Attach to Product 1
    const p1 = await ProductCatalogService.createProduct({
      data: {
        name: 'Product 1',
        description: 'First product',
        category: testCat._id,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    });

    const committedAsset = await MediaAsset.findById(asset._id);
    expect(committedAsset.status).toBe('committed');
    expect(committedAsset.attachedTo.id.toString()).toBe(p1._id.toString());

    // Attempt to attach the same committed asset to Product 2
    await expect(ProductCatalogService.createProduct({
      data: {
        name: 'Product 2',
        description: 'Second product',
        category: testCat._id,
        status: 'published',
        mediaAssetIds: [asset._id.toString()]
      },
      userId: adminUser._id
    })).rejects.toThrow('Media asset is already committed to another product');
  });

  it('MockStorageProvider makes zero network calls and stores objects in-memory', async () => {
    const testProvider = new MockStorageProvider();
    const uploadRes = await testProvider.upload({
      key: 'test/key.webp',
      buffer: Buffer.from('mock data'),
      mimeType: 'image/webp'
    });

    expect(uploadRes.key).toBe('test/key.webp');
    expect(uploadRes.url).toContain('test/key.webp');
    expect(testProvider.has('test/key.webp')).toBe(true);

    await testProvider.delete({ key: 'test/key.webp' });
    expect(testProvider.has('test/key.webp')).toBe(false);
  });

  it('rejects spoofed image MIME type when binary signature does not match', async () => {
    const textBuffer = Buffer.from('This is fake image text content');
    const file = {
      buffer: textBuffer,
      mimetype: 'image/jpeg',
      originalname: 'fake.jpg'
    };

    await expect(MediaService.processAndUpload({ file, userId }))
      .rejects.toThrow('Unsupported or spoofed image binary signature');
  });

  it('strictly rejects SVG files for security', async () => {
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const file = {
      buffer: svgBuffer,
      mimetype: 'image/svg+xml',
      originalname: 'vector.svg'
    };

    await expect(MediaService.processAndUpload({ file, userId }))
      .rejects.toThrow('Only JPEG, PNG, and static WebP images are allowed');
  });

  it('rejects files exceeding 5MB max size limit', async () => {
    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024);
    const file = {
      buffer: hugeBuffer,
      mimetype: 'image/jpeg',
      originalname: 'large.jpg'
    };

    await expect(MediaService.processAndUpload({ file, userId }))
      .rejects.toThrow('Image exceeds maximum size of 5 MB');
  });

  it('rejects images exceeding maximum dimensions (4096px)', async () => {
    const hugeDimensionBuffer = await sharp({
      create: { width: 4100, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } }
    }).jpeg().toBuffer();

    const file = {
      buffer: hugeDimensionBuffer,
      mimetype: 'image/jpeg',
      originalname: 'wide.jpg'
    };

    await expect(MediaService.processAndUpload({ file, userId }))
      .rejects.toThrow('Image dimensions exceed maximum 4096x4096px');
  });

  it('sets status to upload_failed if storage provider upload fails', async () => {
    const jpegBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 10, g: 20, b: 30 } }
    }).jpeg().toBuffer();

    // Mock failing storage provider
    const failingStorage = {
      getUrl: () => 'https://example.com/fake.webp',
      upload: async () => { throw new Error('Simulated S3 network failure'); }
    };
    MediaService.storageProvider = failingStorage;

    const file = {
      buffer: jpegBuffer,
      mimetype: 'image/jpeg',
      originalname: 'fail.jpg'
    };

    await expect(MediaService.processAndUpload({ file, userId }))
      .rejects.toThrow('Failed to store image in object storage');

    // Verify asset recorded with upload_failed state
    const failedAsset = await MediaAsset.findOne({ status: 'upload_failed' });
    expect(failedAsset).not.toBeNull();
    expect(failedAsset.lastError).toBe('STORAGE_UPLOAD_FAILED');
  });
});
