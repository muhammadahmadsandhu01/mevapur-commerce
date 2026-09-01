const sharp = require('sharp');
const mongoose = require('mongoose');
const MediaAsset = require('../../../models/MediaAsset');
const MediaService = require('../../../services/media/MediaService');
const { MockStorageProvider } = require('../../../services/media/StorageProvider');

describe('MediaService Unit Tests', () => {
  let mockStorage;
  let userId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();
    mockStorage = new MockStorageProvider();
    MediaService.storageProvider = mockStorage;
  });

  it('successfully processes, encodes to WebP, and stores a valid JPEG buffer', async () => {
    // Generate valid 100x100 JPEG buffer using Sharp
    const jpegBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } }
    }).jpeg().toBuffer();

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
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify persisted MediaAsset document
    const asset = await MediaAsset.findById(result.mediaAssetId);
    expect(asset).not.toBeNull();
    expect(asset.status).toBe('pending');
    expect(asset.mimeType).toBe('image/webp');
    expect(asset.uploader.toString()).toBe(userId.toString());
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
