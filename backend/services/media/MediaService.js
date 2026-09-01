const crypto = require('crypto');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const MediaAsset = require('../../models/MediaAsset');
const { createStorageProvider } = require('./StorageProvider');
const { getRuntimeConfig } = require('../../config/runtime.config');
const { AppError } = require('../../common/errors/AppError');
const logger = require('../../utils/logger');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION = 4096;
const MAX_INPUT_PIXELS = 16777216; // 16 MP

function validateStoragePrefix(prefix) {
  if (!prefix || typeof prefix !== 'string' || prefix.trim() === '') {
    throw new AppError('Storage prefix cannot be empty', 400, 'MEDIA_INVALID_STORAGE_PREFIX');
  }
  const clean = prefix.trim().replace(/^\/+/, '');
  if (clean === '' || clean === '.' || clean.includes('..') || clean.includes('\\') || clean.includes('*')) {
    throw new AppError('Storage prefix contains invalid or unsafe traversal characters', 400, 'MEDIA_UNSAFE_STORAGE_PREFIX');
  }
  return clean.endsWith('/') ? clean : `${clean}/`;
}

class MediaService {
  constructor(storageProvider = null) {
    const runtimeConfig = getRuntimeConfig();
    this.storageProvider = storageProvider || createStorageProvider(runtimeConfig);
    this.bucket = runtimeConfig.storage?.s3?.bucket || 'mevapur-products';
    this.keyPrefix = validateStoragePrefix(runtimeConfig.storage?.s3?.keyPrefix || 'products/');
    this.providerType = runtimeConfig.storage?.provider || 'mock';
  }

  verifyMagicBytes(buffer) {
    if (!buffer || buffer.length < 12) {
      throw new AppError('File content is truncated or empty', 400, 'MEDIA_INVALID_FORMAT');
    }

    // JPEG: FF D8 FF
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
      && buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
    // WebP: RIFF (0-3) + WEBP (8-11)
    const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

    // Explicit rejection of SVG (starts with <svg or <?xml)
    const headerString = buffer.toString('utf8', 0, Math.min(100, buffer.length)).trim().toLowerCase();
    if (headerString.includes('<svg') || headerString.includes('<?xml')) {
      throw new AppError('SVG files are prohibited for security', 400, 'MEDIA_SVG_PROHIBITED');
    }

    if (!isJpeg && !isPng && !isWebp) {
      throw new AppError('Unsupported or spoofed image binary signature', 400, 'MEDIA_INVALID_SIGNATURE');
    }

    return isJpeg ? 'image/jpeg' : (isPng ? 'image/png' : 'image/webp');
  }

  async processAndUpload({ file, userId }) {
    if (!file || !file.buffer) {
      throw new AppError('No image buffer received', 400, 'MEDIA_FILE_REQUIRED');
    }

    if (file.buffer.length > MAX_FILE_SIZE) {
      throw new AppError('Image exceeds maximum size of 5 MB', 400, 'MEDIA_FILE_TOO_LARGE');
    }

    // 1. Verify MIME declaration & Magic Bytes
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new AppError('Only JPEG, PNG, and static WebP images are allowed', 400, 'MEDIA_UNSUPPORTED_MIME');
    }

    const verifiedMime = this.verifyMagicBytes(file.buffer);

    // 2. Decode metadata with Sharp
    let metadata;
    try {
      metadata = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS
      }).metadata();
    } catch (err) {
      logger.warn('Sharp metadata extraction failed', { error: err.message });
      throw new AppError('Malformed or corrupted image content', 400, 'MEDIA_DECODE_FAILED');
    }

    // 3. Reject animated/multi-page images
    if (metadata.pages && metadata.pages > 1) {
      throw new AppError('Animated and multi-page images are prohibited', 400, 'MEDIA_ANIMATED_PROHIBITED');
    }

    // 4. Reject oversized dimensions
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      throw new AppError(`Image dimensions exceed maximum ${MAX_DIMENSION}x${MAX_DIMENSION}px`, 400, 'MEDIA_DIMENSIONS_EXCEEDED');
    }

    // 5. Process image: auto-rotate, resize inside 2048x2048, encode to canonical WebP (EXIF stripped by default)
    let processedBuffer;
    let info;
    try {
      const result = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS
      })
        .rotate() // Safe auto-rotation based on EXIF orientation
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toBuffer({ resolveWithObject: true });

      processedBuffer = result.data;
      info = result.info;
    } catch (err) {
      logger.warn('Sharp image transformation failed', { error: err.message });
      throw new AppError('Image processing and encoding failed', 400, 'MEDIA_ENCODING_FAILED');
    }

    // 6. Calculate checksum from final encoded bytes
    const checksumSha256 = crypto.createHash('sha256').update(processedBuffer).digest('hex');

    // 7. Generate random key
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const filename = `${uuidv4()}.webp`;
    const key = `${this.keyPrefix}${yyyy}/${mm}/${filename}`.replace(/\/+/g, '/');

    // 8. Create MediaAsset in 'uploading' state FIRST
    const mediaAsset = await MediaAsset.create({
      provider: this.providerType,
      bucket: this.bucket,
      key,
      publicUrl: this.storageProvider.getUrl(key),
      mimeType: 'image/webp',
      sizeBytes: processedBuffer.length,
      width: info.width,
      height: info.height,
      checksumSha256,
      status: 'uploading',
      uploader: userId
    });

    // 9. Upload to Storage Provider
    try {
      const uploadResult = await this.storageProvider.upload({
        key,
        buffer: processedBuffer,
        mimeType: 'image/webp'
      });

      mediaAsset.status = 'pending';
      mediaAsset.publicUrl = uploadResult.url;
      await mediaAsset.save();

      return {
        mediaAssetId: mediaAsset._id,
        url: mediaAsset.publicUrl,
        width: info.width,
        height: info.height,
        size: processedBuffer.length,
        checksum: checksumSha256
      };
    } catch (uploadError) {
      logger.error('Storage upload failed', {
        assetId: mediaAsset._id,
        key,
        error: uploadError.name || 'STORAGE_ERROR'
      });

      mediaAsset.status = 'upload_failed';
      mediaAsset.lastError = 'STORAGE_UPLOAD_FAILED';
      await mediaAsset.save();

      throw new AppError('Failed to store image in object storage', 502, 'MEDIA_STORAGE_FAILED');
    }
  }

  async markDeletionRequested(mediaAssetIds, session = null) {
    if (!Array.isArray(mediaAssetIds) || mediaAssetIds.length === 0) return;

    let query = MediaAsset.updateMany(
      { _id: { $in: mediaAssetIds } },
      { $set: { status: 'deletion_requested', nextRetryAt: new Date() } }
    );
    if (session) query = query.session(session);
    await query;
  }
}

const defaultInstance = new MediaService();
defaultInstance.validateStoragePrefix = validateStoragePrefix;
defaultInstance.MediaService = MediaService;

module.exports = defaultInstance;
