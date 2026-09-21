const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createBackup } = require('../../../scripts/ops/backup-database');
const { restoreDatabase } = require('../../../scripts/ops/restore-database');

describe('Phase 9 Backup and Safe Restore Integration Tests', () => {
  let mongoServer;
  let mongoUri;
  let tempBackupDir;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    tempBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase9-backup-test-'));
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
    if (fs.existsSync(tempBackupDir)) {
      try {
        fs.rmSync(tempBackupDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('1. Safety Barriers & Validation', () => {
    test('rejects restore if confirmation token is missing or incorrect', async () => {
      await expect(
        restoreDatabase({
          backupDir: tempBackupDir,
          targetDbName: 'disposable_test_db',
          applyToken: 'WRONG_TOKEN'
        })
      ).rejects.toThrow(/Invalid or missing applyToken/);
    });

    test('rejects restore into protected database names', async () => {
      const protectedNames = ['production', 'staging', 'mevapur-commerce', 'admin', 'local'];
      for (const name of protectedNames) {
        await expect(
          restoreDatabase({
            backupDir: tempBackupDir,
            targetDbName: name,
            applyToken: 'PHASE9_RESTORE_CONFIRMED'
          })
        ).rejects.toThrow(/is protected/);
      }
    });

    test('rejects restore if checksum is corrupted', async () => {
      const fakeDir = path.join(tempBackupDir, 'corrupted-backup');
      fs.mkdirSync(fakeDir, { recursive: true });

      const archiveContent = Buffer.from('fake-archive-bytes');
      fs.writeFileSync(path.join(fakeDir, 'database.archive.gz'), archiveContent);
      fs.writeFileSync(
        path.join(fakeDir, 'manifest.json'),
        JSON.stringify({ sha256: 'expected-different-sha256-hash' })
      );

      await expect(
        restoreDatabase({
          backupDir: fakeDir,
          targetDbName: 'disposable_test_db',
          applyToken: 'PHASE9_RESTORE_CONFIRMED'
        })
      ).rejects.toThrow(/Checksum mismatch/);
    });
  });

  describe('2. End-to-End Backup and Restore into Disposable Database', () => {
    let backupResult;

    test('creates backup with manifest, checksum, and archive from source database', async () => {
      // Seed source database
      const sourceUri = `${mongoUri}source_app_db`;
      const conn = await mongoose.createConnection(sourceUri).asPromise();
      const testCol = conn.db.collection('test_items');
      await testCol.insertMany([
        { sku: 'SKU-001', name: 'Almond Honey 500g', price: 1500 },
        { sku: 'SKU-002', name: 'Walnut Raw 250g', price: 900 }
      ]);
      await testCol.createIndex({ sku: 1 }, { unique: true });
      await conn.close();

      // Execute backup
      backupResult = await createBackup({
        outputDir: tempBackupDir,
        mongoUri: sourceUri,
        releaseTag: 'phase9-test-v1.0.0'
      });

      expect(fs.existsSync(backupResult.archivePath)).toBe(true);
      expect(fs.existsSync(backupResult.manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(backupResult.manifestPath, 'utf8'));
      expect(manifest.releaseTag).toBe('phase9-test-v1.0.0');
      expect(manifest.totalDocuments).toBeGreaterThanOrEqual(2);
      expect(manifest.sha256).toBe(backupResult.sha256);
    });

    test('safely restores into separate disposable target database', async () => {
      const targetDb = 'disposable_restored_target_db';
      const host = mongoUri.replace('mongodb://', '').replace(/\/$/, '');

      const restoreResult = await restoreDatabase({
        backupDir: backupResult.backupDir,
        targetDbName: targetDb,
        applyToken: 'PHASE9_RESTORE_CONFIRMED',
        mongoHost: host
      });

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.targetDb).toBe(targetDb);

      // Verify restored content in target database
      const targetUri = `${mongoUri}${targetDb}`;
      const conn = await mongoose.createConnection(targetUri).asPromise();
      const restoredDocs = await conn.db.collection('test_items').find({}).toArray();
      expect(restoredDocs).toHaveLength(2);
      expect(restoredDocs.map((d) => d.sku).sort()).toEqual(['SKU-001', 'SKU-002']);

      const indexes = await conn.db.collection('test_items').indexes();
      const skuIndex = indexes.find((i) => i.name === 'sku_1');
      expect(skuIndex).toBeDefined();
      expect(skuIndex.unique).toBe(true);

      await conn.close();
    });
  });
});
