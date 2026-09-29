const path = require('path');
const fs = require('fs');
const os = require('os');
const { MockStorageProvider } = require('../../../services/media/StorageProvider');
const { AppError } = require('../../../common/errors/AppError');

describe('StorageProvider Path Traversal Defense Unit Tests', () => {
  let tempUploadsDir;
  let provider;

  beforeEach(() => {
    tempUploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-provider-test-'));
    provider = new MockStorageProvider({
      uploadsDir: tempUploadsDir
    });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempUploadsDir)) {
        fs.rmSync(tempUploadsDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe('upload() Path Traversal Defense', () => {
    it('allows valid nested file uploads within the uploads directory', async () => {
      const sampleBuffer = Buffer.from('safe file content');
      const result = await provider.upload({
        key: 'products/2026/09/sample.webp',
        buffer: sampleBuffer,
        mimeType: 'image/webp'
      });

      expect(result).toHaveProperty('key', 'products/2026/09/sample.webp');
      expect(result).toHaveProperty('size', sampleBuffer.length);
      expect(provider.has('products/2026/09/sample.webp')).toBe(true);

      const writtenPath = path.join(tempUploadsDir, 'products/2026/09/sample.webp');
      expect(fs.existsSync(writtenPath)).toBe(true);
      expect(fs.readFileSync(writtenPath)).toEqual(sampleBuffer);
    });

    it('blocks directory traversal attempts using ../ sequences', async () => {
      const payloadBuffer = Buffer.from('malicious payload');

      await expect(provider.upload({
        key: '../../../../etc/passwd',
        buffer: payloadBuffer,
        mimeType: 'text/plain'
      })).rejects.toThrow(AppError);

      try {
        await provider.upload({
          key: '../../../../etc/passwd',
          buffer: payloadBuffer,
          mimeType: 'text/plain'
        });
      } catch (err) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('SECURITY_ERROR');
        expect(err.message).toBe('Path traversal detected');
      }
    });

    it('blocks relative traversal escaping to parent config/secrets.env', async () => {
      const payloadBuffer = Buffer.from('tampered secret');

      await expect(provider.upload({
        key: '../config/secrets.env',
        buffer: payloadBuffer,
        mimeType: 'text/plain'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR',
        message: 'Path traversal detected'
      });
    });

    it('blocks sibling folder prefix traversal attacks', async () => {
      // e.g. /uploads-malicious vs /uploads
      const payloadBuffer = Buffer.from('sibling directory escape');

      await expect(provider.upload({
        key: '../' + path.basename(tempUploadsDir) + '-evil/file.txt',
        buffer: payloadBuffer,
        mimeType: 'text/plain'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR',
        message: 'Path traversal detected'
      });
    });

    it('blocks root directory or dot traversal keys', async () => {
      const payloadBuffer = Buffer.from('dot root escape');

      await expect(provider.upload({
        key: '.',
        buffer: payloadBuffer,
        mimeType: 'application/octet-stream'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });

      await expect(provider.upload({
        key: '..',
        buffer: payloadBuffer,
        mimeType: 'application/octet-stream'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });
    });

    it('blocks null, empty, or non-string keys', async () => {
      const payloadBuffer = Buffer.from('data');

      await expect(provider.upload({
        key: '',
        buffer: payloadBuffer,
        mimeType: 'image/webp'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });

      await expect(provider.upload({
        key: null,
        buffer: payloadBuffer,
        mimeType: 'image/webp'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });

      await expect(provider.upload({
        key: undefined,
        buffer: payloadBuffer,
        mimeType: 'image/webp'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });
    });
  });

  describe('delete() Path Traversal Defense', () => {
    it('successfully deletes a legitimate file inside uploads directory', async () => {
      const sampleBuffer = Buffer.from('deletable file');
      await provider.upload({
        key: 'products/deletable.webp',
        buffer: sampleBuffer,
        mimeType: 'image/webp'
      });

      const writtenPath = path.join(tempUploadsDir, 'products/deletable.webp');
      expect(fs.existsSync(writtenPath)).toBe(true);

      const deleteRes = await provider.delete({ key: 'products/deletable.webp' });
      expect(deleteRes).toEqual({ success: true, key: 'products/deletable.webp' });
      expect(fs.existsSync(writtenPath)).toBe(false);
      expect(provider.has('products/deletable.webp')).toBe(false);
    });

    it('blocks directory traversal attempts in delete() using ../ sequences', async () => {
      await expect(provider.delete({
        key: '../../../../etc/passwd'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR',
        message: 'Path traversal detected'
      });
    });

    it('blocks relative traversal escaping to parent files in delete()', async () => {
      await expect(provider.delete({
        key: '../config/secrets.env'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR',
        message: 'Path traversal detected'
      });
    });

    it('blocks sibling folder prefix traversal attacks in delete()', async () => {
      await expect(provider.delete({
        key: '../' + path.basename(tempUploadsDir) + '-evil/file.txt'
      })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR',
        message: 'Path traversal detected'
      });
    });

    it('blocks null, empty, or non-string keys in delete()', async () => {
      await expect(provider.delete({ key: '' })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });

      await expect(provider.delete({ key: null })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });

      await expect(provider.delete({ key: undefined })).rejects.toMatchObject({
        statusCode: 403,
        code: 'SECURITY_ERROR'
      });
    });
  });
});
