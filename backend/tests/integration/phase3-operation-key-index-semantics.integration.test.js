'use strict';

const mongoose = require('mongoose');
const InventoryTransaction = require('../../models/InventoryTransaction');
const {
  TARGET_INDEXES,
  INDEX_SPEC,
  inspectDuplicateData
} = require('../../scripts/migrations/phase3-create-indexes');

describe('Step 5: Real MongoDB Semantics for InventoryTransaction operationKey Partial Index', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce-test';
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    await InventoryTransaction.deleteMany({});
    try {
      await InventoryTransaction.collection.dropIndexes();
    } catch {
      // Collection may not exist yet
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('1. Multiple documents missing operationKey are accepted under the partial index', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      { product: dummyProduct, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'init 1', performedBy: dummyUser },
      { product: dummyProduct, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'init 2', performedBy: dummyUser },
      { product: dummyProduct, type: 'in', quantity: 3, previousStock: 3, newStock: 6, reason: 'init 3', performedBy: dummyUser }
    ]);

    const count = await InventoryTransaction.countDocuments({});
    expect(count).toBe(3);
  });

  it('2. Multiple documents with explicit null are accepted (outside partial filter)', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      { product: dummyProduct, operationKey: null, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'null 1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: null, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'null 2', performedBy: dummyUser }
    ]);

    const count = await InventoryTransaction.countDocuments({ operationKey: null });
    expect(count).toBe(2);
  });

  it('3. Multiple documents with empty string are accepted (outside partial filter)', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      { product: dummyProduct, operationKey: '', type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'empty 1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: '', type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'empty 2', performedBy: dummyUser }
    ]);

    const count = await InventoryTransaction.countDocuments({ operationKey: '' });
    expect(count).toBe(2);
  });

  it('4. Distinct valid non-empty keys are accepted', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      { product: dummyProduct, operationKey: 'OP-KEY-AAA', type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'A', performedBy: dummyUser },
      { product: dummyProduct, operationKey: 'OP-KEY-BBB', type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'B', performedBy: dummyUser }
    ]);

    const count = await InventoryTransaction.countDocuments({
      operationKey: { $in: ['OP-KEY-AAA', 'OP-KEY-BBB'] }
    });
    expect(count).toBe(2);
  });

  it('5. Duplicate valid non-empty keys fail with E11000 duplicate key error', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertOne({
      product: dummyProduct,
      operationKey: 'OP-KEY-DUPLICATE-TEST',
      type: 'in',
      quantity: 1,
      previousStock: 0,
      newStock: 1,
      reason: 'first',
      performedBy: dummyUser
    });

    await expect(
      InventoryTransaction.collection.insertOne({
        product: dummyProduct,
        operationKey: 'OP-KEY-DUPLICATE-TEST',
        type: 'in',
        quantity: 2,
        previousStock: 1,
        newStock: 3,
        reason: 'second duplicate',
        performedBy: dummyUser
      })
    ).rejects.toThrow(/E11000/i);
  });

  it('6. Whitespace-only values are indexed as strings > empty and enforce uniqueness', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertOne({
      product: dummyProduct,
      operationKey: '   ',
      type: 'in',
      quantity: 1,
      previousStock: 0,
      newStock: 1,
      reason: 'space 1',
      performedBy: dummyUser
    });

    // Inserting exact duplicate whitespace string fails uniqueness
    await expect(
      InventoryTransaction.collection.insertOne({
        product: dummyProduct,
        operationKey: '   ',
        type: 'in',
        quantity: 2,
        previousStock: 1,
        newStock: 3,
        reason: 'space 2',
        performedBy: dummyUser
      })
    ).rejects.toThrow(/E11000/i);
  });

  it('7. Non-string values are outside partial filter and do not conflict', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      { product: dummyProduct, operationKey: 12345, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'num 1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: 12345, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'num 2', performedBy: dummyUser }
    ]);

    const count = await InventoryTransaction.collection.countDocuments({ operationKey: 12345 });
    expect(count).toBe(2);
  });

  it('8. listIndexes reports the exact expected partialFilterExpression and absence of sparse', async () => {
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const indexes = await InventoryTransaction.collection.indexes();
    const opIndex = indexes.find(i => i.name === 'operationKey_1');

    expect(opIndex).toBeDefined();
    expect(opIndex.key).toEqual({ operationKey: 1 });
    expect(opIndex.unique).toBe(true);
    expect(opIndex.sparse).toBeUndefined();
    expect(opIndex.partialFilterExpression).toEqual({
      operationKey: { $type: 'string', $gt: '' }
    });
  });

  it('9. Duplicate preflight returns the exact duplicate population that index creation rejects', async () => {
    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      // Allowed populations:
      { product: dummyProduct, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'r1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: null, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'r2', performedBy: dummyUser },
      { product: dummyProduct, operationKey: null, type: 'in', quantity: 3, previousStock: 3, newStock: 6, reason: 'r3', performedBy: dummyUser },
      { product: dummyProduct, operationKey: '', type: 'in', quantity: 4, previousStock: 6, newStock: 10, reason: 'r4', performedBy: dummyUser },
      { product: dummyProduct, operationKey: '', type: 'in', quantity: 5, previousStock: 10, newStock: 15, reason: 'r5', performedBy: dummyUser },
      // Duplicate eligible non-empty key:
      { product: dummyProduct, operationKey: 'OP-DUP-POPULATION-1', type: 'in', quantity: 6, previousStock: 15, newStock: 21, reason: 'd1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: 'OP-DUP-POPULATION-1', type: 'in', quantity: 7, previousStock: 21, newStock: 28, reason: 'd2', performedBy: dummyUser },
      // Unique eligible non-empty key:
      { product: dummyProduct, operationKey: 'OP-UNIQUE-POPULATION-2', type: 'in', quantity: 8, previousStock: 28, newStock: 36, reason: 'u1', performedBy: dummyUser }
    ]);

    const duplicates = await inspectDuplicateData(mongoose.connection.db);
    expect(duplicates.length).toBe(1);
    expect(duplicates[0].count).toBe(1);
    expect(duplicates[0].items[0].key).toBe('OP-DUP-POPULATION-1');
  });

  it('10. Index creation succeeds on allowed missing/null/empty fixtures', async () => {
    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      { product: dummyProduct, type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'missing 1', performedBy: dummyUser },
      { product: dummyProduct, type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'missing 2', performedBy: dummyUser },
      { product: dummyProduct, operationKey: null, type: 'in', quantity: 3, previousStock: 3, newStock: 6, reason: 'null 1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: null, type: 'in', quantity: 4, previousStock: 6, newStock: 10, reason: 'null 2', performedBy: dummyUser },
      { product: dummyProduct, operationKey: '', type: 'in', quantity: 5, previousStock: 10, newStock: 15, reason: 'empty 1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: '', type: 'in', quantity: 6, previousStock: 15, newStock: 21, reason: 'empty 2', performedBy: dummyUser },
      { product: dummyProduct, operationKey: 'OP-UNIQUE-1', type: 'in', quantity: 7, previousStock: 21, newStock: 28, reason: 'unique 1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: 'OP-UNIQUE-2', type: 'in', quantity: 8, previousStock: 28, newStock: 36, reason: 'unique 2', performedBy: dummyUser }
    ]);

    // Index creation must succeed without error
    await InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options);

    const indexes = await InventoryTransaction.collection.indexes();
    expect(indexes.some(i => i.name === 'operationKey_1')).toBe(true);
  });

  it('11. Index creation fails on duplicate eligible operation keys', async () => {
    const dummyProduct = new mongoose.Types.ObjectId();
    const dummyUser = new mongoose.Types.ObjectId();

    await InventoryTransaction.collection.insertMany([
      { product: dummyProduct, operationKey: 'OP-DUP-BLOCKER-REAL', type: 'in', quantity: 1, previousStock: 0, newStock: 1, reason: 'd1', performedBy: dummyUser },
      { product: dummyProduct, operationKey: 'OP-DUP-BLOCKER-REAL', type: 'in', quantity: 2, previousStock: 1, newStock: 3, reason: 'd2', performedBy: dummyUser }
    ]);

    await expect(
      InventoryTransaction.collection.createIndex(INDEX_SPEC.keys, INDEX_SPEC.options)
    ).rejects.toThrow(/E11000/i);
  });
});
