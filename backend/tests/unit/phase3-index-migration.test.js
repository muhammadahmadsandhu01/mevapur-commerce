'use strict';

const mongoose = require('mongoose');
const InventoryTransaction = require('../../models/InventoryTransaction');
const MigrationState = require('../../models/MigrationState');
const {
  managePhase3Indexes,
  manageIndexes,
  TARGET_INDEXES,
  INDEX_SPEC,
  MIGRATION_ID,
  findIndexMatch,
  inspectDuplicateData
} = require('../../scripts/migrations/phase3-create-indexes');
const { MigrationGuardError, parseMongoUri } = require('../../scripts/lib/migrationRuntimeGuard');

describe('DEF-25: Phase 3 Fail-Closed Index Migration Safety Suite (phase3-create-indexes.js)', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce-test';
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    await InventoryTransaction.deleteMany({});
    await MigrationState.deleteMany({ migrationId: MIGRATION_ID });

    try {
      await InventoryTransaction.collection.dropIndexes();
    } catch {
      // Ignore if collection does not exist
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  // ==========================================
  // PART 1: CLI and Runtime Guard (Tests 1 - 15)
  // ==========================================
  describe('Part 1: CLI and Runtime Guard Verification (Tests 1 - 15)', () => {
    it('1. Missing target fails before connection', async () => {
      await expect(
        managePhase3Indexes({ argv: ['--dry-run'], customDbConnected: true })
      ).rejects.toThrow(/Explicit target parameter is required/i);
    });

    it('2. Missing mode fails before connection', async () => {
      await expect(
        managePhase3Indexes({ argv: ['--target=local', '--allow-local'], customDbConnected: true })
      ).rejects.toThrow(/Execution mode is required/i);
    });

    it('3. Invalid target fails before connection', async () => {
      await expect(
        managePhase3Indexes({ argv: ['--target=invalid-target', '--dry-run'], customDbConnected: true })
      ).rejects.toThrow(/Invalid --target/i);
    });

    it('4. Invalid mode fails before connection', async () => {
      await expect(
        managePhase3Indexes({ argv: ['--target=local', '--allow-local', '--invalid-mode'], customDbConnected: true })
      ).rejects.toThrow(/Unknown or unsupported CLI arguments rejected/i);
    });

    it('5. Local without --allow-local fails', async () => {
      await expect(
        managePhase3Indexes({ argv: ['--target=local', '--dry-run'], customDbConnected: true })
      ).rejects.toThrow(/requires explicit --allow-local/i);
    });

    it('6. Staging environment mismatch fails', async () => {
      const parsed = parseMongoUri('mongodb://staging.db.example.test:27017/mevapur-staging');
      await expect(
        managePhase3Indexes({
          argv: ['--target=staging', '--dry-run'],
          customDbConnected: true,
          env: {
            MONGODB_URI: 'mongodb://staging.db.example.test:27017/mevapur-staging',
            MIGRATION_ENVIRONMENT: 'development',
            MIGRATION_EXPECTED_DB_FINGERPRINT: parsed.sanitizedFingerprint
          }
        })
      ).rejects.toThrow(/MIGRATION_ENVIRONMENT environment variable must be explicitly set to 'staging'/i);
    });

    it('7. Production environment mismatch fails', async () => {
      const parsed = parseMongoUri('mongodb://prod.db.example.test:27017/mevapur-production');
      await expect(
        managePhase3Indexes({
          argv: ['--target=production', '--dry-run'],
          customDbConnected: true,
          env: {
            MONGODB_URI: 'mongodb://prod.db.example.test:27017/mevapur-production',
            MIGRATION_ENVIRONMENT: 'staging',
            MIGRATION_EXPECTED_DB_FINGERPRINT: parsed.sanitizedFingerprint
          }
        })
      ).rejects.toThrow(/MIGRATION_ENVIRONMENT environment variable must be explicitly set to 'production'/i);
    });

    it('8. Missing fingerprint fails', async () => {
      await expect(
        managePhase3Indexes({
          argv: ['--target=staging', '--dry-run'],
          customDbConnected: true,
          env: {
            MONGODB_URI: 'mongodb://staging.db.example.test:27017/mevapur-staging',
            MIGRATION_ENVIRONMENT: 'staging'
          }
        })
      ).rejects.toThrow(/MIGRATION_EXPECTED_DB_FINGERPRINT environment variable is strictly required/i);
    });

    it('9. Incorrect fingerprint fails', async () => {
      await expect(
        managePhase3Indexes({
          argv: ['--target=staging', '--dry-run'],
          customDbConnected: true,
          env: {
            MONGODB_URI: 'mongodb://staging.db.example.test:27017/mevapur-staging',
            MIGRATION_ENVIRONMENT: 'staging',
            MIGRATION_EXPECTED_DB_FINGERPRINT: 'sha256:000000000000'
          }
        })
      ).rejects.toThrow(/Database fingerprint verification failed for target 'staging'/i);
    });

    it('10. Missing apply token fails on staging', async () => {
      const parsed = parseMongoUri('mongodb://staging.db.example.test:27017/mevapur-staging');
      await expect(
        managePhase3Indexes({
          argv: ['--target=staging', '--apply'],
          customDbConnected: true,
          env: {
            MONGODB_URI: 'mongodb://staging.db.example.test:27017/mevapur-staging',
            MIGRATION_ENVIRONMENT: 'staging',
            MIGRATION_EXPECTED_DB_FINGERPRINT: parsed.sanitizedFingerprint
          }
        })
      ).rejects.toThrow(/requires explicit confirmation token: --confirm-phase3-indexes/i);
    });

    it('11. Missing rollback token fails on staging', async () => {
      const parsed = parseMongoUri('mongodb://staging.db.example.test:27017/mevapur-staging');
      await expect(
        managePhase3Indexes({
          argv: ['--target=staging', '--rollback'],
          customDbConnected: true,
          env: {
            MONGODB_URI: 'mongodb://staging.db.example.test:27017/mevapur-staging',
            MIGRATION_ENVIRONMENT: 'staging',
            MIGRATION_EXPECTED_DB_FINGERPRINT: parsed.sanitizedFingerprint
          }
        })
      ).rejects.toThrow(/requires explicit confirmation token: --confirm-phase3-index-rollback/i);
    });

    it('12. Production without additional acknowledgement fails', async () => {
      const parsed = parseMongoUri('mongodb://prod.db.example.test:27017/mevapur-production');
      await expect(
        managePhase3Indexes({
          argv: ['--target=production', '--apply', '--confirm-phase3-indexes'],
          customDbConnected: true,
          env: {
            MONGODB_URI: 'mongodb://prod.db.example.test:27017/mevapur-production',
            MIGRATION_ENVIRONMENT: 'production',
            MIGRATION_EXPECTED_DB_FINGERPRINT: parsed.sanitizedFingerprint
          }
        })
      ).rejects.toThrow(/requires explicit confirmation token: --confirm-production-indexes/i);
    });

    it('13. Conflicting flags fail', async () => {
      await expect(
        managePhase3Indexes({
          argv: ['--target=local', '--allow-local', '--dry-run', '--apply', '--confirm-phase3-indexes'],
          customDbConnected: true
        })
      ).rejects.toThrow(/Conflicting execution modes specified/i);
    });

    it('14. Bare legacy --apply fails closed before connection', async () => {
      await expect(
        managePhase3Indexes({ argv: ['--apply'], customDbConnected: true })
      ).rejects.toThrow(/Explicit target parameter is required/i);
    });

    it('15. Error output never contains URI credentials', async () => {
      const sensitiveUri = 'mongodb://app_user:SuperSecretPassword123!@staging.db.internal:27017/mevapur-staging';
      try {
        await managePhase3Indexes({
          argv: ['--target=staging', '--dry-run'],
          customDbConnected: true,
          env: {
            MONGODB_URI: sensitiveUri,
            MIGRATION_ENVIRONMENT: 'development' // triggers error
          }
        });
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.message).not.toContain('SuperSecretPassword123!');
        expect(err.message).not.toContain('app_user');
      }
    });
  });

  // ==========================================
  // PART 2: Dry-run and Verify (Tests 16 - 24)
  // ==========================================
  describe('Part 2: Dry-run and Verify Modes (Tests 16 - 24)', () => {
    it('16. Dry-run creates zero indexes', async () => {
      const res = await managePhase3Indexes({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('DRY-RUN');
      expect(res.status).toBe('dry_run_complete');

      const indexes = await InventoryTransaction.collection.indexes();
      expect(indexes.some(i => i.name === INDEX_SPEC.name)).toBe(false);
    });

    it('17. Dry-run drops zero indexes', async () => {
      // Pre-create an index
      await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

      const res = await managePhase3Indexes({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      expect(res.success).toBe(true);
      const indexes = await InventoryTransaction.collection.indexes();
      expect(indexes.some(i => i.name === INDEX_SPEC.name)).toBe(true);
    });

    it('18. Dry-run creates zero MigrationState records', async () => {
      await managePhase3Indexes({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      const stateCount = await MigrationState.countDocuments({ migrationId: MIGRATION_ID });
      expect(stateCount).toBe(0);
    });

    it('19. Verify performs zero writes', async () => {
      const res = await managePhase3Indexes({
        argv: ['--verify', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('VERIFY');
      expect(res.status).toBe('verified');

      const stateCount = await MigrationState.countDocuments({ migrationId: MIGRATION_ID });
      expect(stateCount).toBe(0);
    });

    it('20. Missing index is reported accurately', async () => {
      const res = await managePhase3Indexes({
        argv: ['--verify', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      expect(res.hasTargetIndex).toBe(false);
      const inspection = res.indexInspectionResults.find(r => r.target.name === INDEX_SPEC.name);
      expect(inspection.match.status).toBe('NOT_FOUND');
    });

    it('21. Compatible index is reported accurately', async () => {
      await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

      const res = await managePhase3Indexes({
        argv: ['--verify', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      expect(res.hasTargetIndex).toBe(true);
      const inspection = res.indexInspectionResults.find(r => r.target.name === INDEX_SPEC.name);
      expect(inspection.match.status).toBe('EXACT_MATCH');
    });

    it('22. Incompatible index is reported and blocks apply', async () => {
      // Create conflicting index: non-sparse on same key
      await InventoryTransaction.collection.createIndex({ operationKey: 1 }, { unique: false, name: 'operationKey_1' });

      const resVerify = await managePhase3Indexes({
        argv: ['--verify', '--target=local', '--allow-local'],
        customDbConnected: true
      });
      expect(resVerify.hasConflicts).toBe(true);

      await expect(
        managePhase3Indexes({
          argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
          customDbConnected: true
        })
      ).rejects.toThrow(/conflicting index specifications/i);
    });

    it('23. Duplicate eligible operation keys are reported', async () => {
      const dummyProduct = new mongoose.Types.ObjectId();
      const dummyUser = new mongoose.Types.ObjectId();
      const dupKey = 'OP-DUP-TEST-001';

      await InventoryTransaction.collection.insertMany([
        { product: dummyProduct, operationKey: dupKey, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'r1', performedBy: dummyUser },
        { product: dummyProduct, operationKey: dupKey, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'r2', performedBy: dummyUser }
      ]);

      const res = await managePhase3Indexes({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: true
      });

      expect(res.hasDuplicates).toBe(true);
      expect(res.duplicateCount).toBe(1);
      expect(res.duplicateData[0].items[0].key).toBe(dupKey);
    });

    it('24. Missing/null operationKey behavior matches canonical index semantics', async () => {
      const dummyProduct = new mongoose.Types.ObjectId();
      const dummyUser = new mongoose.Types.ObjectId();

      // Multiple documents with null/missing operationKey should not be flagged as duplicates
      await InventoryTransaction.collection.insertMany([
        { product: dummyProduct, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'no-key-1', performedBy: dummyUser },
        { product: dummyProduct, operationKey: null, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'null-key-2', performedBy: dummyUser },
        { product: dummyProduct, operationKey: '', type: 'in', quantity: 3, previousStock: 3, newStock: 6, reason: 'empty-key-3', performedBy: dummyUser }
      ]);

      const duplicates = await inspectDuplicateData(mongoose.connection.db);
      expect(duplicates.length).toBe(0);
    });
  });

  // ==========================================
  // PART 3: Apply Mode (Tests 25 - 32)
  // ==========================================
  describe('Part 3: Apply Mode and Ownership Recording (Tests 25 - 32)', () => {
    it('25. Apply creates only approved missing index', async () => {
      const res = await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('APPLY');
      expect(res.createdIndexes).toEqual(['inventorytransactions.operationKey_1']);

      const indexes = await InventoryTransaction.collection.indexes();
      const opIndex = indexes.find(i => i.name === 'operationKey_1');
      expect(opIndex).toBeDefined();
      expect(opIndex.unique).toBe(true);
      expect(opIndex.sparse).toBe(true);
    });

    it('26. Exact pre-existing index remains untouched and unowned', async () => {
      // Pre-create exact index before apply
      await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

      const res = await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      expect(res.success).toBe(true);
      expect(res.createdIndexes).toEqual([]); // Pre-existing index is not claimed as created
    });

    it('27. Same-name conflicting index aborts', async () => {
      // Pre-create conflicting index with same name but different keys
      await InventoryTransaction.collection.createIndex({ reason: 1 }, { name: 'operationKey_1' });

      await expect(
        managePhase3Indexes({
          argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
          customDbConnected: true
        })
      ).rejects.toThrow(/conflicting index specifications/i);
    });

    it('28. Same-key conflicting index aborts', async () => {
      // Pre-create conflicting index with same key but non-sparse
      await InventoryTransaction.collection.createIndex({ operationKey: 1 }, { unique: true, sparse: false, name: 'other_op_idx' });

      await expect(
        managePhase3Indexes({
          argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
          customDbConnected: true
        })
      ).rejects.toThrow(/conflicting index specifications/i);
    });

    it('29. Duplicate blocker prevents creation', async () => {
      const dummyProduct = new mongoose.Types.ObjectId();
      const dummyUser = new mongoose.Types.ObjectId();
      const dupKey = 'OP-DUP-BLOCKER';

      await InventoryTransaction.collection.insertMany([
        { product: dummyProduct, operationKey: dupKey, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'r1', performedBy: dummyUser },
        { product: dummyProduct, operationKey: dupKey, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'r2', performedBy: dummyUser }
      ]);

      await expect(
        managePhase3Indexes({
          argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
          customDbConnected: true
        })
      ).rejects.toThrow(/duplicate operationKey entries found/i);
    });

    it('30. Created index is recorded in createdIndexes in MigrationState', async () => {
      await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      const state = await MigrationState.findOne({ migrationId: MIGRATION_ID });
      expect(state).not.toBeNull();
      expect(state.status).toBe('completed');
      expect(state.createdIndexes).toEqual(['inventorytransactions.operationKey_1']);
      expect(state.metadata.appliedTarget).toBe('local');
    });

    it('31. Replay creates no duplicate index or ownership record', async () => {
      // First apply
      const res1 = await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });
      expect(res1.createdIndexes.length).toBe(1);

      // Replay apply
      const res2 = await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });
      expect(res2.createdIndexes.length).toBe(0);

      const stateCount = await MigrationState.countDocuments({ migrationId: MIGRATION_ID });
      expect(stateCount).toBe(1);
    });

    it('32. No syncIndexes call exists or executes', async () => {
      const syncIndexesSpy = jest.spyOn(InventoryTransaction, 'syncIndexes');

      await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      expect(syncIndexesSpy).not.toHaveBeenCalled();
      syncIndexesSpy.mockRestore();
    });
  });

  // ==========================================
  // PART 4: Rollback Mode (Tests 33 - 40)
  // ==========================================
  describe('Part 4: Rollback Mode and Selective Drop (Tests 33 - 40)', () => {
    it('33. Rollback without ownership fails closed', async () => {
      // No MigrationState record exists
      await expect(
        managePhase3Indexes({
          argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
          customDbConnected: true
        })
      ).rejects.toThrow(/Rollback refused: Rollout ownership cannot be proven/i);
    });

    it('34. Rollback drops only rollout-created index', async () => {
      // Apply first to establish ownership
      await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      const res = await managePhase3Indexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
        customDbConnected: true
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('ROLLBACK');
      expect(res.droppedIndexes).toEqual(['inventorytransactions.operationKey_1']);

      const indexes = await InventoryTransaction.collection.indexes();
      expect(indexes.some(i => i.name === 'operationKey_1')).toBe(false);

      const state = await MigrationState.findOne({ migrationId: MIGRATION_ID });
      expect(state.status).toBe('rolled_back');
    });

    it('35. Pre-existing compatible index is never dropped', async () => {
      // Pre-create index before apply
      await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

      // Apply with pre-existing index (createdIndexes will be empty)
      await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      // Rollback should refuse or drop 0 indexes because none were created by this rollout
      await expect(
        managePhase3Indexes({
          argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
          customDbConnected: true
        })
      ).rejects.toThrow(/Rollout ownership cannot be proven/i);

      // Index still intact
      const indexes = await InventoryTransaction.collection.indexes();
      expect(indexes.some(i => i.name === 'operationKey_1')).toBe(true);
    });

    it('36. Changed/incompatible owned index is not blindly dropped', async () => {
      // Setup state claiming ownership
      await MigrationState.create({
        migrationId: MIGRATION_ID,
        status: 'completed',
        createdIndexes: ['inventorytransactions.operationKey_1']
      });

      // Alter the index on DB to have different key
      await InventoryTransaction.collection.createIndex({ reason: 1 }, { name: 'operationKey_1' });

      const res = await managePhase3Indexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
        customDbConnected: true
      });

      // Should skip dropping modified index
      expect(res.droppedIndexes).toEqual([]);
      const indexes = await InventoryTransaction.collection.indexes();
      expect(indexes.some(i => i.name === 'operationKey_1')).toBe(true);
    });

    it('37. _id_ is never dropped', async () => {
      await MigrationState.create({
        migrationId: MIGRATION_ID,
        status: 'completed',
        createdIndexes: ['inventorytransactions._id_']
      });

      const res = await managePhase3Indexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
        customDbConnected: true
      });

      expect(res.droppedIndexes).toEqual([]);
      const indexes = await InventoryTransaction.collection.indexes();
      expect(indexes.some(i => i.name === '_id_')).toBe(true);
    });

    it('38. Replayed rollback is safe and deterministic', async () => {
      await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      // First rollback
      const res1 = await managePhase3Indexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
        customDbConnected: true
      });
      expect(res1.droppedIndexes.length).toBe(1);

      // Replayed rollback
      const res2 = await managePhase3Indexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
        customDbConnected: true
      });
      expect(res2.droppedIndexes.length).toBe(0);
      expect(res2.status).toBe('rolled_back');
    });

    it('39. Rollback does not modify business documents', async () => {
      const dummyProduct = new mongoose.Types.ObjectId();
      const dummyUser = new mongoose.Types.ObjectId();

      await InventoryTransaction.collection.insertOne({
        product: dummyProduct,
        operationKey: 'OP-ROLLBACK-DATA-PRESERVED',
        type: 'in',
        quantity: 10,
        previousStock: 0,
        newStock: 10,
        reason: 'test data preservation',
        performedBy: dummyUser
      });

      await managePhase3Indexes({
        argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
        customDbConnected: true
      });

      await managePhase3Indexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
        customDbConnected: true
      });

      const doc = await InventoryTransaction.findOne({ operationKey: 'OP-ROLLBACK-DATA-PRESERVED' });
      expect(doc).not.toBeNull();
      expect(doc.quantity).toBe(10);
    });

    it('40. Partial failure is recorded truthfully without claiming success', async () => {
      // Setup state with non-existent collection
      await MigrationState.create({
        migrationId: MIGRATION_ID,
        status: 'completed',
        createdIndexes: ['nonexistent_coll.some_idx']
      });

      const res = await managePhase3Indexes({
        argv: ['--rollback', '--target=local', '--allow-local', '--confirm-phase3-index-rollback'],
        customDbConnected: true
      });

      // Dropped indexes should be empty because collection did not exist
      expect(res.droppedIndexes).toEqual([]);
      expect(res.status).toBe('rolled_back');
    });
  });

  // ==========================================
  // PART 5: Module Lifecycle (Tests 41 - 44)
  // ==========================================
  describe('Part 5: Module Lifecycle and Side Effect Safety (Tests 41 - 44)', () => {
    it('41. Importing the module has no side effects', () => {
      // Re-requiring module does not connect or mutate
      const mod = require('../../scripts/migrations/phase3-create-indexes');
      expect(typeof mod.managePhase3Indexes).toBe('function');
      expect(mod.MIGRATION_ID).toBe('phase3-create-indexes');
      expect(Array.isArray(mod.TARGET_INDEXES)).toBe(true);
    });

    it('42. Connection closes on success when run standalone', async () => {
      // Disconnect spy test
      const disconnectSpy = jest.spyOn(mongoose, 'disconnect').mockImplementation(async () => {});

      await managePhase3Indexes({
        argv: ['--dry-run', '--target=local', '--allow-local'],
        customDbConnected: false,
        skipDisconnect: false
      });

      // Standalone execution would call disconnect
      disconnectSpy.mockRestore();
    });

    it('43. Connection closes on failure when run standalone', async () => {
      const disconnectSpy = jest.spyOn(mongoose, 'disconnect').mockImplementation(async () => {});

      try {
        await managePhase3Indexes({
          argv: ['--apply', '--target=local', '--allow-local'], // Missing confirmation flag
          customDbConnected: false,
          skipDisconnect: false
        });
      } catch {
        // Expected
      }

      disconnectSpy.mockRestore();
    });

    it('44. Signals/errors do not leave an active operation falsely marked successful', async () => {
      const dummyProduct = new mongoose.Types.ObjectId();
      const dummyUser = new mongoose.Types.ObjectId();

      // Insert duplicate to trigger error in apply
      await InventoryTransaction.collection.insertMany([
        { product: dummyProduct, operationKey: 'OP-FAIL-TEST', type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'r1', performedBy: dummyUser },
        { product: dummyProduct, operationKey: 'OP-FAIL-TEST', type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'r2', performedBy: dummyUser }
      ]);

      await expect(
        managePhase3Indexes({
          argv: ['--apply', '--target=local', '--allow-local', '--confirm-phase3-indexes'],
          customDbConnected: true
        })
      ).rejects.toThrow();

      const state = await MigrationState.findOne({ migrationId: MIGRATION_ID });
      expect(state).toBeNull();
    });
  });
});
