const Return = require('../../models/Return');
const Refund = require('../../models/Refund');
const {
  ALLOWLIST,
  REQUIRED_BACKUP_COLLECTIONS,
  classifyIndexes
} = require('../../scripts/migrations/p3-staging-index-migration');

const canonical = (value) => JSON.stringify(value);

const controlledIndexes = [
  {
    model: Refund,
    collection: 'refunds',
    name: 'unique_provider_refund_reference',
    keys: { provider: 1, providerRefundId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        providerRefundId: { $type: 'string', $gt: '' }
      }
    }
  },
  {
    model: Refund,
    collection: 'refunds',
    name: 'unique_refund_return',
    keys: { returnId: 1 },
    options: { unique: true, sparse: true }
  },
  {
    model: Return,
    collection: 'returns',
    name: 'returnNumber_1',
    keys: { returnNumber: 1 },
    options: { unique: true }
  },
  {
    model: Return,
    collection: 'returns',
    name: 'unique_return_refund',
    keys: { refund: 1 },
    options: {
      unique: true,
      partialFilterExpression: { refund: { $type: 'objectId' } }
    }
  }
];

describe('controlled Return/Refund index migration metadata', () => {
  test.each(controlledIndexes)('$collection.$name exactly matches its schema contract', ({
    model,
    collection,
    name,
    keys,
    options
  }) => {
    const allowlistMatches = ALLOWLIST.filter((entry) => (
      entry.collection === collection && canonical(entry.keys) === canonical(keys)
    ));
    expect(allowlistMatches).toEqual([{ collection, name, keys, options }]);

    const schemaMatch = model.schema.indexes().find(
      ([schemaKeys]) => canonical(schemaKeys) === canonical(keys)
    );
    expect(schemaMatch).toBeDefined();

    const schemaOptions = schemaMatch[1];
    expect(schemaOptions.unique).toBe(options.unique);
    expect(schemaOptions.sparse).toBe(options.sparse);
    expect(schemaOptions.partialFilterExpression).toEqual(
      options.partialFilterExpression
    );
    if (schemaOptions.name !== undefined) {
      expect(schemaOptions.name).toBe(name);
    }
  });

  test('includes returns in the exact backup evidence contract', () => {
    expect(REQUIRED_BACKUP_COLLECTIONS).toContain('returns');
    expect([...REQUIRED_BACKUP_COLLECTIONS]).toEqual(
      [...REQUIRED_BACKUP_COLLECTIONS].sort()
    );
  });

  test('proposes the controlled indexes without importing or executing the CLI', () => {
    const collections = [...new Set(ALLOWLIST.map((entry) => entry.collection))];
    const indexes = Object.fromEntries(collections.map((collection) => [
      collection,
      [{ name: '_id_', key: { _id: 1 }, v: 2 }]
    ]));

    const classification = classifyIndexes({ collections, indexes });
    for (const { collection, name } of controlledIndexes) {
      expect(classification.creates).toContainEqual({ collection, name });
    }
    expect(classification.blocked).toEqual([]);
    expect(classification.conflicts).toEqual([]);
  });
});
