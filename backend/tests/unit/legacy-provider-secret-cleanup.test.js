const {
  APPLY_FLAG,
  BACKUP_ACKNOWLEDGMENT_FLAG,
  CONFIRMATION_FLAG,
  LEGACY_PROVIDER_SECRET_PATHS,
  createCleanupPlan,
  executeCleanup,
  parseCleanupArguments,
  runCleanup
} = require('../../scripts/cleanup/remove-legacy-provider-secrets');

const EXPECTED_LEGACY_PROVIDER_SECRET_PATHS = Object.freeze([
  'payment.jazzcash_password',
  'payment.visa_api_key',
  'payment.visa_secret_key',
  'payment.mastercard_api_key',
  'payment.mastercard_secret_key'
]);

const applyUnsetToObject = (source, update) => {
  const result = structuredClone(source);
  for (const path of Object.keys(update.$unset)) {
    const segments = path.split('.');
    const final = segments.pop();
    const parent = segments.reduce((current, segment) => current[segment], result);
    delete parent[final];
  }
  return result;
};

describe('Legacy provider secret cleanup', () => {
  test('is inert on import and defaults to an exact dry-run plan', () => {
    const options = parseCleanupArguments([]);
    const plan = createCleanupPlan(options);

    expect(options.mode).toBe('dry-run');
    expect(plan.collection).toBe('settings');
    expect(LEGACY_PROVIDER_SECRET_PATHS).toEqual(
      EXPECTED_LEGACY_PROVIDER_SECRET_PATHS
    );
    expect(plan.fields).toEqual(EXPECTED_LEGACY_PROVIDER_SECRET_PATHS);
    expect(Object.keys(plan.update.$unset).sort()).toEqual(
      [...LEGACY_PROVIDER_SECRET_PATHS].sort()
    );
  });

  test('requires both explicit confirmation and backup acknowledgment for apply', () => {
    expect(() => parseCleanupArguments([APPLY_FLAG])).toThrow(
      expect.objectContaining({
        code: 'LEGACY_SECRET_CLEANUP_CONFIRMATION_REQUIRED'
      })
    );
    expect(() => parseCleanupArguments([
      APPLY_FLAG,
      CONFIRMATION_FLAG
    ])).toThrow(expect.objectContaining({
      code: 'LEGACY_SECRET_CLEANUP_BACKUP_ACK_REQUIRED'
    }));

    expect(parseCleanupArguments([
      APPLY_FLAG,
      CONFIRMATION_FLAG,
      BACKUP_ACKNOWLEDGMENT_FLAG
    ]).mode).toBe('apply');
  });

  test('dry-run counts documents without writing or logging values', async () => {
    const collection = {
      countDocuments: jest.fn().mockResolvedValue(3),
      updateMany: jest.fn()
    };
    const logger = { info: jest.fn() };
    const plan = createCleanupPlan();

    const result = await executeCleanup({ collection, plan, logger });

    expect(result).toMatchObject({
      mode: 'dry-run',
      matchedDocuments: 3,
      modifiedDocuments: 0
    });
    expect(collection.updateMany).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Legacy provider secret cleanup dry run completed',
      {
        mode: 'dry-run',
        matchedDocuments: 3,
        fieldNames: LEGACY_PROVIDER_SECRET_PATHS
      }
    );
  });

  test('apply uses only the exact unset plan and preserves non-secret fields', async () => {
    const options = parseCleanupArguments([
      APPLY_FLAG,
      CONFIRMATION_FLAG,
      BACKUP_ACKNOWLEDGMENT_FLAG
    ]);
    const plan = createCleanupPlan(options);
    const collection = {
      countDocuments: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 })
    };
    const logger = { info: jest.fn() };
    const document = {
      store: { store_name: 'Synthetic Store' },
      payment: {
        cod_enabled: true,
        jazzcash_merchant_id: 'SYNTHETIC-MERCHANT',
        jazzcash_password: 'synthetic-value',
        visa_api_key: 'synthetic-value',
        visa_secret_key: 'synthetic-value',
        mastercard_api_key: 'synthetic-value',
        mastercard_secret_key: 'synthetic-value'
      }
    };

    await executeCleanup({ collection, plan, logger });
    const cleaned = applyUnsetToObject(document, plan.update);

    expect(collection.updateMany).toHaveBeenCalledWith(plan.filter, {
      $unset: Object.fromEntries(
        LEGACY_PROVIDER_SECRET_PATHS.map((path) => [path, ''])
      )
    });
    expect(cleaned).toEqual({
      store: { store_name: 'Synthetic Store' },
      payment: {
        cod_enabled: true,
        jazzcash_merchant_id: 'SYNTHETIC-MERCHANT'
      }
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('synthetic-value');
  });

  test('disconnects cleanly after a dependency-injected dry run', async () => {
    const disconnectDatabase = jest.fn().mockResolvedValue(undefined);
    const dependencies = {
      connectDatabase: jest.fn().mockResolvedValue(undefined),
      disconnectDatabase,
      getCollection: () => ({
        countDocuments: jest.fn().mockResolvedValue(0)
      }),
      logger: { info: jest.fn() }
    };

    await runCleanup({
      argv: [],
      environment: { MONGODB_URI: 'mongodb://127.0.0.1/synthetic-test' },
      dependencies
    });

    expect(dependencies.connectDatabase).toHaveBeenCalledTimes(1);
    expect(disconnectDatabase).toHaveBeenCalledTimes(1);
  });
});
