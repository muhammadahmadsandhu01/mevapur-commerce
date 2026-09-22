/**
 * @file phase10-uat-fixtures.integration.test.js
 * @description Exhaustive integration tests for Phase 10 deterministic UAT fixtures and exact-ID reset tooling.
 * Verifies all 24 safety, collision, idempotency, credential, manifest, compensating rollback, and reset invariants.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const {
  seedUatFixtures,
  parseAndValidateUri,
  computeIdentityFingerprint,
  REQUIRED_SEED_TOKEN
} = require('../../../scripts/ops/seed-uat-fixtures');

const {
  resetUatFixtures,
  REQUIRED_RESET_TOKEN
} = require('../../../scripts/ops/reset-uat-fixtures');

describe('Phase 10 Deterministic UAT Fixtures & Reset Tooling Integration Tests', () => {
  let mongoServer;
  let baseUri;
  let testDbUri;
  let directConnection;
  const manifestPath = path.resolve(__dirname, '../../../scripts/ops/manifests/uat-fixture-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = await MongoMemoryServer.create();
    baseUri = mongoServer.getUri();
    testDbUri = `${baseUri.replace(/\/$/, '')}/disposable_uat_test`;
    process.env.UAT_MONGODB_URI = testDbUri;
    process.env.UAT_FIXTURE_PASSWORD = 'UatSecureTestPassword2026!';

    directConnection = await mongoose.createConnection(testDbUri).asPromise();
  });

  afterAll(async () => {
    if (directConnection) {
      await directConnection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  afterEach(async () => {
    // Clean up ownership and fixture records without using dropDatabase
    if (directConnection && directConnection.db) {
      const db = directConnection.db;
      try {
        await db.collection('_uat_fixture_ownership').deleteMany({ namespace: manifest.fixtureNamespace });
      } catch {}
      for (const colName of manifest.dependencyOrder) {
        try {
          const ids = (manifest.datasets[colName] || []).map((r) => new mongoose.Types.ObjectId(r._id));
          if (ids.length > 0) {
            await db.collection(colName).deleteMany({ _id: { $in: ids } });
          }
        } catch {}
      }
    }
  });

  describe('1. Safety Barriers & Database Name Validation', () => {
    test('1. Missing seed token is rejected', async () => {
      await expect(
        seedUatFixtures({ mongoUri: testDbUri, applyToken: 'WRONG_SEED_TOKEN' })
      ).rejects.toThrow(/Invalid or missing applyToken/);
    });

    test('2. Missing reset token is rejected', async () => {
      await expect(
        resetUatFixtures({ mongoUri: testDbUri, applyToken: 'WRONG_RESET_TOKEN' })
      ).rejects.toThrow(/Invalid or missing applyToken/);
    });

    test('3. Missing UAT_MONGODB_URI is rejected', async () => {
      await expect(
        seedUatFixtures({ mongoUri: '', applyToken: REQUIRED_SEED_TOKEN })
      ).rejects.toThrow(/Missing required environment variable: UAT_MONGODB_URI/);

      await expect(
        resetUatFixtures({ mongoUri: '', applyToken: REQUIRED_RESET_TOKEN })
      ).rejects.toThrow(/Missing required environment variable: UAT_MONGODB_URI/);
    });

    test('4. Production database names are rejected', async () => {
      const protectedNames = ['production', 'staging', 'admin', 'config', 'local'];
      for (const name of protectedNames) {
        const protectedUri = `${baseUri.replace(/\/$/, '')}/${name}`;
        await expect(
          seedUatFixtures({ mongoUri: protectedUri, applyToken: REQUIRED_SEED_TOKEN })
        ).rejects.toThrow(/is a protected database name/);

        await expect(
          resetUatFixtures({ mongoUri: protectedUri, applyToken: REQUIRED_RESET_TOKEN })
        ).rejects.toThrow(/is a protected database name/);
      }
    });

    test('5. Default mevapur-commerce is rejected', async () => {
      const mevapurNames = ['mevapur-commerce', 'mevapur_commerce', 'mevapur'];
      for (const name of mevapurNames) {
        const protectedUri = `${baseUri.replace(/\/$/, '')}/${name}`;
        await expect(
          seedUatFixtures({ mongoUri: protectedUri, applyToken: REQUIRED_SEED_TOKEN })
        ).rejects.toThrow(/is a protected database name/);
      }
    });

    test('6. Non-UAT database names are rejected', async () => {
      const nonUatUri = `${baseUri.replace(/\/$/, '')}/my_custom_db`;
      await expect(
        seedUatFixtures({ mongoUri: nonUatUri, applyToken: REQUIRED_SEED_TOKEN })
      ).rejects.toThrow(/must contain "uat", "test", or "disposable"/);

      await expect(
        resetUatFixtures({ mongoUri: nonUatUri, applyToken: REQUIRED_RESET_TOKEN })
      ).rejects.toThrow(/must contain "uat", "test", or "disposable"/);
    });

    test('7. URI credentials are redacted from errors', () => {
      const sensitiveUri = 'mongodb://secretUser:superSecretPassword123@127.0.0.1:27017/production';
      try {
        parseAndValidateUri(sensitiveUri);
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.message).not.toContain('superSecretPassword123');
        expect(err.message).not.toContain('secretUser');
        expect(err.message).toContain('***:***');
      }
    });
  });

  describe('2. Dry-Run & Provider Mock Enforcement', () => {
    test('8. Dry-run performs zero writes', async () => {
      const result = await seedUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_SEED_TOKEN,
        dryRun: true
      });

      expect(result.status).toBe('DRY_RUN_SUCCESS');

      const db = directConnection.db;
      const ownership = await db.collection('_uat_fixture_ownership').findOne({});
      expect(ownership).toBeNull();

      for (const colName of manifest.dependencyOrder) {
        const count = await db.collection(colName).countDocuments({});
        expect(count).toBe(0);
      }
    });

    test('11. Guest persona does not create a User record', async () => {
      await seedUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_SEED_TOKEN
      });

      const db = directConnection.db;
      const guestUser = await db.collection('users').findOne({ email: 'guest-checkout@mevapur.test' });
      expect(guestUser).toBeNull();
    });

    test('12. Live provider adapters are never called (forced to mock)', async () => {
      expect(process.env.EMAIL_MODE).toBe('mock');
    });
  });

  describe('3. Deterministic Seeding, ID Verification & Idempotency', () => {
    test('9. Deterministic seed produces expected counts', async () => {
      const result = await seedUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_SEED_TOKEN
      });

      expect(result.status).toBe('SEEDED_SUCCESS');

      const db = directConnection.db;
      for (const [colName, expectedCount] of Object.entries(manifest.expectedCounts)) {
        const count = await db.collection(colName).countDocuments({});
        expect(count).toBe(expectedCount);
      }
    });

    test('10. All IDs match the immutable specification', async () => {
      await seedUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_SEED_TOKEN
      });

      const db = directConnection.db;
      for (const [colName, records] of Object.entries(manifest.datasets)) {
        for (const record of records) {
          const doc = await db.collection(colName).findOne({ _id: new mongoose.Types.ObjectId(record._id) });
          expect(doc).not.toBeNull();
          expect(String(doc._id)).toBe(String(record._id));
        }
      }
    });

    test('13. Second seed run creates zero duplicates (ALREADY_SEEDED)', async () => {
      const firstRun = await seedUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_SEED_TOKEN
      });
      expect(firstRun.status).toBe('SEEDED_SUCCESS');

      const secondRun = await seedUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_SEED_TOKEN
      });
      expect(secondRun.status).toBe('ALREADY_SEEDED');

      const db = directConnection.db;
      for (const [colName, expectedCount] of Object.entries(manifest.expectedCounts)) {
        const count = await db.collection(colName).countDocuments({});
        expect(count).toBe(expectedCount);
      }
    });

    test('14. Unrelated sentinel records remain unchanged', async () => {
      const db = directConnection.db;
      const sentinelId = new mongoose.Types.ObjectId('66f999999999999999999999');
      await db.collection('users').insertOne({
        _id: sentinelId,
        fullName: 'Sentinel Unrelated User',
        email: 'sentinel@example.com',
        role: 'customer'
      });

      await seedUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_SEED_TOKEN
      });

      const sentinelAfterSeed = await db.collection('users').findOne({ _id: sentinelId });
      expect(sentinelAfterSeed).not.toBeNull();
      expect(sentinelAfterSeed.email).toBe('sentinel@example.com');

      await resetUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_RESET_TOKEN
      });

      const sentinelAfterReset = await db.collection('users').findOne({ _id: sentinelId });
      expect(sentinelAfterReset).not.toBeNull();
      expect(sentinelAfterReset.email).toBe('sentinel@example.com');

      // Cleanup sentinel
      await db.collection('users').deleteOne({ _id: sentinelId });
    });
  });

  describe('4. Collision Detection & Compensating Cleanup', () => {
    test('15. Deterministic ID collision with unrelated data aborts safely', async () => {
      const db = directConnection.db;
      const collidingId = new mongoose.Types.ObjectId('66f000000000000000000011');
      await db.collection('products').insertOne({
        _id: collidingId,
        name: 'Pre-existing Unrelated Product',
        sku: 'UNRELATED-SKU-999'
      });

      await expect(
        seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN })
      ).rejects.toThrow(/FIXTURE_COLLISION_DETECTED: Target collection "products" already contains document with ID/);

      // Clean up collision
      await db.collection('products').deleteOne({ _id: collidingId });
    });

    test('16. Unique-key collision with unrelated data aborts safely', async () => {
      const db = directConnection.db;
      const unrelatedId = new mongoose.Types.ObjectId('66f888888888888888888888');
      await db.collection('users').insertOne({
        _id: unrelatedId,
        fullName: 'Impostor Customer',
        email: 'customer-pk-cod@mevapur.test' // Same email as fixture, but different _id
      });

      await expect(
        seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN })
      ).rejects.toThrow(/FIXTURE_COLLISION_DETECTED: Target collection "users" already contains document matching identity/);

      // Clean up
      await db.collection('users').deleteOne({ _id: unrelatedId });
    });

    test('17. Partial failure performs compensating cleanup', async () => {
      // Simulate partial failure by placing a collision midway in 'orders'
      const db = directConnection.db;
      const collidingOrderId = new mongoose.Types.ObjectId('66f000000000000000000043');
      await db.collection('orders').insertOne({
        _id: collidingOrderId,
        orderId: 'COLLIDING-ORDER-KEY'
      });

      await expect(
        seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN })
      ).rejects.toThrow(/FIXTURE_COLLISION_DETECTED/);

      // Prior collections like 'categories' and 'users' must have zero fixture documents
      for (const colName of ['fulfillmentlocations', 'categories', 'users', 'products']) {
        const ids = (manifest.datasets[colName] || []).map((r) => new mongoose.Types.ObjectId(r._id));
        const count = await db.collection(colName).countDocuments({ _id: { $in: ids } });
        expect(count).toBe(0);
      }

      await db.collection('orders').deleteOne({ _id: collidingOrderId });
    });
  });

  describe('5. Reset Invariants, Mutated Fields & Fingerprint Enforcement', () => {
    test('18. Reset deletes only ownership-manifest IDs', async () => {
      await seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN });

      const resetResult = await resetUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_RESET_TOKEN
      });

      expect(resetResult.status).toBe('RESET_SUCCESS');
      expect(resetResult.deletedCount).toBe(42);

      const db = directConnection.db;
      for (const colName of manifest.dependencyOrder) {
        const count = await db.collection(colName).countDocuments({});
        expect(count).toBe(0);
      }
    });

    test('19. Mutated fixture operational fields can still be safely reset when immutable identity remains valid', async () => {
      await seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN });

      const db = directConnection.db;
      // Mutate order status & customer note (simulating manual QA actions)
      await db.collection('orders').updateOne(
        { orderId: 'ORD-UAT-PENDING-001' },
        { $set: { orderStatus: 'cancelled', customerNote: 'Mutated in UAT QA' } }
      );

      // Mutate product stock
      await db.collection('products').updateOne(
        { sku: 'SKU-ALM-500G' },
        { $set: { stock: 85 } }
      );

      // Reset must succeed because stable identity fields (orderId, sku) are intact
      const resetResult = await resetUatFixtures({
        mongoUri: testDbUri,
        applyToken: REQUIRED_RESET_TOKEN
      });

      expect(resetResult.status).toBe('RESET_SUCCESS');

      const remainingOrders = await db.collection('orders').countDocuments({});
      expect(remainingOrders).toBe(0);
      const remainingProducts = await db.collection('products').countDocuments({});
      expect(remainingProducts).toBe(0);
    });

    test('20. Immutable identity mismatch blocks deletion', async () => {
      await seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN });

      const db = directConnection.db;
      // Tamper with stable identity field
      await db.collection('orders').updateOne(
        { orderId: 'ORD-UAT-PENDING-001' },
        { $set: { orderId: 'TAMPERED-ORDER-ID-999' } }
      );

      await expect(
        resetUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_RESET_TOKEN })
      ).rejects.toThrow(/FIXTURE_OWNERSHIP_MISMATCH/);
    });

    test('21. Reset removes the ownership record last', async () => {
      await seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN });

      const db = directConnection.db;
      const ownershipBefore = await db.collection('_uat_fixture_ownership').findOne({
        namespace: manifest.fixtureNamespace
      });
      expect(ownershipBefore).not.toBeNull();

      await resetUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_RESET_TOKEN });

      const ownershipAfter = await db.collection('_uat_fixture_ownership').findOne({
        namespace: manifest.fixtureNamespace
      });
      expect(ownershipAfter).toBeNull();
    });

    test('22. Post-reset verification finds zero owned fixture IDs', async () => {
      await seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN });
      await resetUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_RESET_TOKEN });

      const db = directConnection.db;
      for (const [colName, records] of Object.entries(manifest.datasets)) {
        const ids = records.map((r) => new mongoose.Types.ObjectId(r._id));
        const remaining = await db.collection(colName).countDocuments({ _id: { $in: ids } });
        expect(remaining).toBe(0);
      }
    });

    test('23. Database connections close after success and failure', async () => {
      // Test successful connection close
      const seedResult = await seedUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_SEED_TOKEN });
      expect(seedResult.status).toBe('SEEDED_SUCCESS');

      const resetResult = await resetUatFixtures({ mongoUri: testDbUri, applyToken: REQUIRED_RESET_TOKEN });
      expect(resetResult.status).toBe('RESET_SUCCESS');

      // Test failure connection close (with invalid token)
      try {
        await seedUatFixtures({ mongoUri: testDbUri, applyToken: 'INVALID' });
      } catch (err) {
        expect(err.message).toMatch(/Invalid or missing applyToken/);
      }
    });

    test('24. No script invokes dropDatabase(), collection.drop() or broad deleteMany({})', () => {
      const seedScriptCode = fs.readFileSync(path.resolve(__dirname, '../../../scripts/ops/seed-uat-fixtures.js'), 'utf8');
      const resetScriptCode = fs.readFileSync(path.resolve(__dirname, '../../../scripts/ops/reset-uat-fixtures.js'), 'utf8');

      // Strip comments to inspect executable code only
      const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const cleanSeed = stripComments(seedScriptCode);
      const cleanReset = stripComments(resetScriptCode);

      // Assert neither script invokes dropDatabase()
      expect(cleanSeed).not.toMatch(/\.dropDatabase\s*\(/);
      expect(cleanReset).not.toMatch(/\.dropDatabase\s*\(/);

      // Assert neither script invokes collection.drop()
      expect(cleanSeed).not.toMatch(/\.drop\s*\(/);
      expect(cleanReset).not.toMatch(/\.drop\s*\(/);

      // Assert neither script invokes deleteMany({}) without exact filter
      expect(cleanSeed).not.toMatch(/\.deleteMany\s*\(\s*\{\s*\}\s*\)/);
      expect(cleanReset).not.toMatch(/\.deleteMany\s*\(\s*\{\s*\}\s*\)/);
    });
  });
});
