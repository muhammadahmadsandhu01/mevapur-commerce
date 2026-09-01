const crypto = require('crypto');
const request = require('supertest');
const sharp = require('sharp');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const MediaAsset = require('../../models/MediaAsset');
const { MockStorageProvider } = require('../../services/media/StorageProvider');
const MediaService = require('../../services/media/MediaService');

let sequence = 0;

const getAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `upload-auth-${sequence}@example.test`,
    role
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });

  return `Bearer ${TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  })}`;
};

describe('Upload and Media Workflows Integration Tests', () => {
  let adminToken;
  let customerToken;
  let mockStorage;

  beforeEach(async () => {
    adminToken = await getAuthToken('admin');
    customerToken = await getAuthToken('customer');
    mockStorage = new MockStorageProvider();
    MediaService.storageProvider = mockStorage;
  });

  it('enforces RBAC on upload endpoint', async () => {
    const unauth = await request(app).post('/api/uploads/product-image');
    expect(unauth.status).toBe(401);

    const forbidden = await request(app)
      .post('/api/uploads/product-image')
      .set('Authorization', customerToken);
    expect(forbidden.status).toBe(403);
  });

  it('processes and stores valid image upload, emitting WebP with checksum', async () => {
    const testImageBuffer = await sharp({
      create: { width: 150, height: 150, channels: 3, background: { r: 50, g: 150, b: 250 } }
    }).jpeg().toBuffer();

    const response = await request(app)
      .post('/api/uploads/product-image')
      .set('Authorization', adminToken)
      .attach('image', testImageBuffer, 'sample.jpg');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('mediaAssetId');
    expect(response.body.data.url).toMatch(/\.webp$/);
    expect(response.body.data.width).toBe(150);
    expect(response.body.data.height).toBe(150);
    expect(response.body.data.checksum).toMatch(/^[a-f0-9]{64}$/);

    const persisted = await MediaAsset.findById(response.body.data.mediaAssetId);
    expect(persisted).not.toBeNull();
    expect(persisted.status).toBe('pending');
  });

  it('rejects SVG file uploads with 400', async () => {
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>');

    const response = await request(app)
      .post('/api/uploads/product-image')
      .set('Authorization', adminToken)
      .attach('image', svgBuffer, 'icon.svg');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MEDIA_UNSUPPORTED_MIME');
  });

  it('rejects spoofed image file with 400', async () => {
    const textBuffer = Buffer.from('This is a text file renamed to fake.png');

    const response = await request(app)
      .post('/api/uploads/product-image')
      .set('Authorization', adminToken)
      .attach('image', textBuffer, 'fake.png');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MEDIA_INVALID_SIGNATURE');
  });
});
