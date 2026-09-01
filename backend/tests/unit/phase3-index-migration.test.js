const mongoose = require('mongoose');
const InventoryTransaction = require('../../models/InventoryTransaction');
const { managePhase3Indexes, INDEX_SPEC } = require('../../scripts/migrations/phase3-create-indexes');

describe('Phase 3 Index Migration Script (phase3-create-indexes.js)', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce-test';
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    await InventoryTransaction.deleteMany({});
    try {
      await InventoryTransaction.collection.dropIndex(INDEX_SPEC.name);
    } catch {
      // ignore
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('runs safely in dry-run mode without performing writes', async () => {
    const result = await managePhase3Indexes({
      apply: false,
      rollback: false,
      skipDisconnect: true
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe('DRY-RUN');
    expect(result.duplicateCount).toBe(0);
  });

  it('detects duplicate operationKeys and aborts index creation', async () => {
    const duplicateKey = '00000000-0000-0000-0000-000000000099';
    const dummyId = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    // Create two documents with duplicate operationKey bypassing unique index
    await InventoryTransaction.collection.insertMany([
      {
        product: dummyId,
        operationKey: duplicateKey,
        type: 'in',
        quantity: 5,
        previousStock: 10,
        newStock: 15,
        reason: 'Duplicate 1',
        performedBy: dummyUser,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        product: dummyId,
        operationKey: duplicateKey,
        type: 'in',
        quantity: 5,
        previousStock: 15,
        newStock: 20,
        reason: 'Duplicate 2',
        performedBy: dummyUser,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    await expect(
      managePhase3Indexes({ apply: true, skipDisconnect: true })
    ).rejects.toThrow(/duplicate operationKey/i);
  });

  it('applies index and reruns idempotently', async () => {
    const applyResult1 = await managePhase3Indexes({
      apply: true,
      skipDisconnect: true
    });
    expect(applyResult1.success).toBe(true);
    expect(applyResult1.mode).toBe('APPLY');

    // Verify index exists
    const indexes = await InventoryTransaction.collection.indexes();
    const targetIdx = indexes.find((i) => i.name === INDEX_SPEC.name);
    expect(targetIdx).toBeDefined();
    expect(targetIdx.unique).toBe(true);
    expect(targetIdx.sparse).toBe(true);

    // Second run (idempotent)
    const applyResult2 = await managePhase3Indexes({
      apply: true,
      skipDisconnect: true
    });
    expect(applyResult2.success).toBe(true);
  });

  it('rolls back index cleanly', async () => {
    await managePhase3Indexes({ apply: true, skipDisconnect: true });

    const rollbackResult = await managePhase3Indexes({
      rollback: true,
      skipDisconnect: true
    });
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.mode).toBe('ROLLBACK');

    const indexes = await InventoryTransaction.collection.indexes();
    const targetIdx = indexes.find((i) => i.name === INDEX_SPEC.name);
    expect(targetIdx).toBeUndefined();
  });
});
