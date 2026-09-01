const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../../utils/logger');

class StorageProvider {
  async upload({ key, buffer, mimeType }) {
    throw new Error('upload() must be implemented by storage provider');
  }

  async delete({ key }) {
    throw new Error('delete() must be implemented by storage provider');
  }

  getUrl(key) {
    throw new Error('getUrl() must be implemented by storage provider');
  }
}

class MockStorageProvider extends StorageProvider {
  constructor(options = {}) {
    super();
    this.bucket = options.bucket || 'mevapur-mock-bucket';
    this.baseUrl = options.publicBaseUrl || 'https://media.mock.mevapur.test';
    this.storage = new Map();
  }

  async upload({ key, buffer, mimeType }) {
    this.storage.set(key, {
      buffer,
      mimeType,
      size: buffer.length,
      uploadedAt: new Date()
    });
    return {
      key,
      url: this.getUrl(key),
      size: buffer.length
    };
  }

  async delete({ key }) {
    this.storage.delete(key);
    return { success: true, key };
  }

  getUrl(key) {
    return `${this.baseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
  }

  has(key) {
    return this.storage.has(key);
  }

  get(key) {
    return this.storage.get(key);
  }

  clear() {
    this.storage.clear();
  }
}

class S3StorageProvider extends StorageProvider {
  constructor(config = {}) {
    super();
    this.bucket = config.bucket;
    this.baseUrl = config.publicBaseUrl;
    this.keyPrefix = config.keyPrefix || 'products/';
    this.timeoutMs = config.timeoutMs || 10000;

    const clientOptions = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        ...(config.sessionToken ? { sessionToken: config.sessionToken } : {})
      },
      forcePathStyle: Boolean(config.forcePathStyle)
    };

    if (config.endpoint) {
      clientOptions.endpoint = config.endpoint;
    }

    this.client = new S3Client(clientOptions);
  }

  async upload({ key, buffer, mimeType }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType
    });

    await this.client.send(command, { requestTimeout: this.timeoutMs });
    return {
      key,
      url: this.getUrl(key),
      size: buffer.length
    };
  }

  async delete({ key }) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    await this.client.send(command, { requestTimeout: this.timeoutMs });
    return { success: true, key };
  }

  async exists({ key }) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      await this.client.send(command, { requestTimeout: this.timeoutMs });
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  getUrl(key) {
    return `${this.baseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
  }
}

const createStorageProvider = (runtimeConfig) => {
  const storageConfig = runtimeConfig?.storage || { provider: 'mock' };
  if (storageConfig.provider === 's3' && storageConfig.s3) {
    return new S3StorageProvider(storageConfig.s3);
  }
  return new MockStorageProvider(storageConfig.s3 || {});
};

module.exports = {
  StorageProvider,
  MockStorageProvider,
  S3StorageProvider,
  createStorageProvider
};
