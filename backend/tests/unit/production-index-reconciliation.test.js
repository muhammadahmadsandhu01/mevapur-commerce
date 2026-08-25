const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharedPlan = require('../../scripts/migrations/p3-index-plan');
const runner = require('../../scripts/migrations/p3-production-index-reconciliation');

const productionUri = (
  'mongodb://cluster-a.invalid:27017,cluster-b.invalid:27017/' +
  'mevapur_staging?tls=true&replicaSet=production-rs&authSource=admin'
);

const toActualIndex = (definition) => ({
  v: 2,
  name: definition.name,
  key: definition.keys,
  ...definition.options
});

const baselineMissing = new Set([
  'refunds.unique_refund_return',
  'returns.returnNumber_1',
  'returns.status_1_createdAt_-1',
  'returns.customer_1_createdAt_-1',
  'returns.order_1',
  'returns.unique_return_refund'
]);

const createBaselineSnapshot = (providerReferenceIndex = toActualIndex(
  sharedPlan.KNOWN_LEGACY_INDEX_DEFINITIONS[0]
)) => {
  const collections = [...new Set(sharedPlan.ALLOWLIST.map((entry) => entry.collection))];
  const indexes = Object.fromEntries(collections.map((collection) => [
    collection,
    [{ v: 2, name: '_id_', key: { _id: 1 } }]
  ]));
  for (const definition of sharedPlan.ALLOWLIST) {
    const identity = `${definition.collection}.${definition.name}`;
    if (baselineMissing.has(identity)) continue;
    if (identity === 'refunds.unique_provider_refund_reference') {
      indexes[definition.collection].push(providerReferenceIndex);
    } else {
      indexes[definition.collection].push(toActualIndex(definition));
    }
  }
  return { collections, indexes };
};

describe('production controlled index reconciliation runner', () => {
  let tempDirectory;
  let backupPath;
  let backupHash;

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mevapur-index-test-'));
    backupPath = path.join(tempDirectory, 'verified.archive.gz');
    fs.writeFileSync(backupPath, Buffer.alloc(2048, 7));
    backupHash = crypto.createHash('sha256')
      .update(fs.readFileSync(backupPath))
      .digest('hex')
      .toUpperCase();
  });

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  test('is inert when imported', () => {
    jest.resetModules();
    const MongoClient = jest.fn();
    jest.doMock('mongodb', () => ({ MongoClient }));
    jest.isolateModules(() => {
      require('../../scripts/migrations/p3-production-index-reconciliation');
    });
    expect(MongoClient).not.toHaveBeenCalled();
    jest.dontMock('mongodb');
  });

  test('defaults to dry-run and requires complete backup evidence arguments', () => {
    const options = runner.parseArguments([
      '--backup', backupPath,
      '--backup-size', '2048',
      '--backup-sha256', backupHash
    ]);
    expect(options.mode).toBe('dry-run');
    expect(options.backupAcknowledged).toBe(false);
  });

  test('requires the exact production runtime identity', () => {
    expect(() => runner.validateRuntimeEnvironment({
      NODE_ENV: 'staging', APP_ENV: 'production', MONGODB_URI: productionUri
    })).toThrow('NODE_ENV_PRODUCTION_REQUIRED');
    expect(() => runner.validateRuntimeEnvironment({
      NODE_ENV: 'production', APP_ENV: 'staging', MONGODB_URI: productionUri
    })).toThrow('APP_ENV_PRODUCTION_REQUIRED');
    expect(() => runner.validateRuntimeEnvironment({
      NODE_ENV: 'production', APP_ENV: 'production', MONGODB_URI: productionUri
    })).not.toThrow();
  });

  test('requires exact database, TLS, and replica-set URI gates', () => {
    expect(runner.parseMongoTarget(productionUri)).toEqual({
      database: 'mevapur_staging',
      replicaSet: 'production-rs',
      tlsEnabled: true
    });
    expect(() => runner.parseMongoTarget(
      'mongodb://cluster.invalid:27017/?tls=true&replicaSet=production-rs'
    )).toThrow('EXPLICIT_DATABASE_REQUIRED');
    expect(() => runner.parseMongoTarget(
      'mongodb://cluster.invalid:27017/other?tls=true&replicaSet=production-rs'
    )).toThrow('PRODUCTION_DATABASE_MISMATCH');
    expect(() => runner.parseMongoTarget(
      'mongodb://cluster.invalid:27017/mevapur_staging?replicaSet=production-rs'
    )).toThrow('TLS_REQUIRED');
    expect(() => runner.parseMongoTarget(
      'mongodb://cluster.invalid:27017/mevapur_staging?tls=true'
    )).toThrow('REPLICA_SET_REQUIRED');
  });

  test('requires a primary, matching replica set, sessions, and transaction wire version', async () => {
    const hello = {
      ok: 1,
      isWritablePrimary: true,
      setName: 'production-rs',
      logicalSessionTimeoutMinutes: 30,
      maxWireVersion: 25
    };
    const database = {
      databaseName: 'mevapur_staging',
      command: jest.fn(async (command) => (
        command.ping ? { ok: 1 } : hello
      ))
    };
    const client = {
      db: jest.fn(() => database),
      topology: { description: { type: 'ReplicaSetWithPrimary' } }
    };
    await expect(runner.verifyTopology(client, {
      replicaSet: 'production-rs'
    })).resolves.toMatchObject({ transactionCapable: true });

    hello.setName = 'unexpected-rs';
    await expect(runner.verifyTopology(client, {
      replicaSet: 'production-rs'
    })).rejects.toThrow('TRANSACTION_CAPABLE_REPLICA_SET_REQUIRED');
  });

  test('keeps the reviewed MongoClient options bounded and immutable', () => {
    expect(runner.MONGO_CLIENT_OPTIONS).toEqual({
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 20000,
      maxPoolSize: 2,
      appName: 'MevaPur-Production-Controlled-Index-Reconciliation'
    });
    expect(Object.isFrozen(runner.MONGO_CLIENT_OPTIONS)).toBe(true);
  });

  test.each([
    {
      error: Object.assign(new Error('sensitive endpoint text'), {
        name: 'MongoServerSelectionError',
        cause: Object.assign(new Error('sensitive endpoint text'), {
          name: 'MongoNetworkError',
          code: 'ECONNRESET'
        })
      }),
      expected: {
        errorClass: 'MongoServerSelectionError',
        safeErrorCode: 'SERVER_SELECTION_FAILED',
        serverSelectionFailure: true,
        networkFailure: true
      }
    },
    {
      error: Object.assign(new Error('sensitive certificate text'), {
        name: 'MongoServerSelectionError',
        cause: Object.assign(new Error('sensitive certificate text'), {
          name: 'MongoNetworkError',
          code: 'ERR_TLS_CERT_ALTNAME_INVALID'
        })
      }),
      expected: {
        errorClass: 'MongoServerSelectionError',
        safeErrorCode: 'TLS_CERTIFICATE_FAILED',
        tlsFailure: true
      }
    },
    {
      error: Object.assign(new Error('sensitive authentication text'), {
        name: 'MongoServerError',
        code: 18,
        codeName: 'AuthenticationFailed'
      }),
      expected: {
        errorClass: 'MongoServerError',
        safeErrorCode: 'AUTHENTICATION_FAILED',
        authenticationFailure: true
      }
    }
  ])('classifies connectivity failures without retaining private messages', ({
    error,
    expected
  }) => {
    const result = runner.classifyConnectivityError(error, {
      elapsedMs: 10123,
      connected: false
    });
    expect(result).toMatchObject({
      failurePhase: 'client-connect',
      elapsedMs: 10123,
      connected: false,
      ...expected
    });
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });

  test('attaches sanitized diagnostics when client connection fails', async () => {
    const connectionError = Object.assign(new Error('private endpoint text'), {
      name: 'MongoServerSelectionError',
      cause: Object.assign(new Error('private endpoint text'), {
        name: 'MongoNetworkError',
        code: 'ECONNRESET'
      })
    });
    const client = {
      connect: jest.fn(async () => { throw connectionError; }),
      close: jest.fn(async () => {})
    };
    const clockValues = [1000, 1105];

    await expect(runner.runProductionMigration({
      argv: [
        '--backup', backupPath,
        '--backup-size', '2048',
        '--backup-sha256', backupHash
      ],
      environment: {
        NODE_ENV: 'production',
        APP_ENV: 'production',
        MONGODB_URI: productionUri
      },
      clock: () => clockValues.shift(),
      createClient: jest.fn(() => client)
    })).rejects.toMatchObject({
      code: 'PRODUCTION_CONNECTIVITY_FAILED',
      connectivityDiagnostic: {
        failurePhase: 'client-connect',
        errorClass: 'MongoServerSelectionError',
        safeErrorCode: 'SERVER_SELECTION_FAILED',
        serverSelectionFailure: true,
        networkFailure: true,
        elapsedMs: 105,
        connected: false
      }
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  test('validates backup path, size, hash, and bounded apply age', async () => {
    const options = {
      mode: 'dry-run',
      backup: backupPath,
      backupSize: 2048,
      backupSha256: backupHash
    };
    await expect(runner.validateBackupEvidence(options)).resolves.toMatchObject({
      path: fs.realpathSync.native(backupPath),
      size: 2048,
      sha256: backupHash
    });
    await expect(runner.validateBackupEvidence({
      ...options, backupSize: 2049
    })).rejects.toThrow('BACKUP_SIZE_MISMATCH');
    await expect(runner.validateBackupEvidence({
      ...options, backupSha256: 'A'.repeat(64)
    })).rejects.toThrow('BACKUP_HASH_MISMATCH');
    await expect(runner.validateBackupEvidence({
      ...options, backup: 'relative.archive.gz'
    })).rejects.toThrow('BACKUP_PATH_REFUSED');
    await expect(runner.validateBackupEvidence(options, {
      projectRoot: tempDirectory
    })).rejects.toThrow('BACKUP_PATH_REFUSED');

    const staleNow = Date.now();
    fs.utimesSync(
      backupPath,
      new Date(staleNow - runner.APPLY_BACKUP_MAX_AGE_MS - 1000),
      new Date(staleNow - runner.APPLY_BACKUP_MAX_AGE_MS - 1000)
    );
    await expect(runner.validateBackupEvidence({
      ...options, mode: 'apply'
    }, { nowMs: staleNow })).rejects.toThrow('APPLY_BACKUP_TOO_OLD');
    await expect(runner.validateBackupEvidence(options, {
      nowMs: staleNow
    })).resolves.toMatchObject({ applyAgeEligible: false });
  });

  test('rejects the known invalid ten-byte backup shape', async () => {
    const invalidPath = path.join(tempDirectory, 'invalid.archive.gz');
    fs.writeFileSync(invalidPath, Buffer.alloc(10));
    const invalidHash = crypto.createHash('sha256')
      .update(fs.readFileSync(invalidPath))
      .digest('hex')
      .toUpperCase();
    await expect(runner.validateBackupEvidence({
      mode: 'dry-run',
      backup: invalidPath,
      backupSize: 10,
      backupSha256: invalidHash
    })).rejects.toThrow('BACKUP_TOO_SMALL');
  });

  test('requires phrase-level confirmation and backup acknowledgment for apply', () => {
    const base = {
      mode: 'apply',
      productionConfirmation: null,
      backupAcknowledged: false
    };
    expect(() => runner.validateApplyAuthorization(base))
      .toThrow('PRODUCTION_CONFIRMATION_REQUIRED');
    expect(() => runner.validateApplyAuthorization({
      ...base,
      productionConfirmation: runner.PRODUCTION_CONFIRMATION_PHRASE
    })).toThrow('BACKUP_ACKNOWLEDGMENT_REQUIRED');
    expect(() => runner.validateApplyAuthorization({
      ...base,
      productionConfirmation: runner.PRODUCTION_CONFIRMATION_PHRASE,
      backupAcknowledged: true
    })).not.toThrow();
  });

  test('plans 13 retains, 6 creates, and the exact reviewed reconciliation', () => {
    const plan = runner.buildProductionPlan(createBaselineSnapshot());
    expect(plan.retained).toHaveLength(13);
    expect(plan.creates).toHaveLength(6);
    expect(plan.reconciles).toEqual([{
      collection: 'refunds',
      name: 'unique_provider_refund_reference',
      reason: 'KNOWN_REVIEWED_LEGACY_DEFINITION'
    }]);
    expect(plan.blocked).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  test('fails closed for an unknown conflicting index definition', () => {
    const unknown = {
      v: 2,
      name: 'unique_provider_refund_reference',
      key: { provider: 1, providerRefundId: 1 },
      unique: true
    };
    const plan = runner.buildProductionPlan(createBaselineSnapshot(unknown));
    expect(plan.reconciles).toEqual([]);
    expect(plan.conflicts).toEqual([{
      collection: 'refunds',
      name: 'unique_provider_refund_reference',
      reason: 'NAME_COLLISION_WITH_DIFFERENT_DEFINITION'
    }]);
  });

  test.each([
    {
      v: 2,
      name: 'unique_provider_refund_reference',
      key: { providerRefundId: 1, provider: 1 },
      unique: true,
      sparse: true
    },
    {
      v: 2,
      name: 'unique_provider_refund_reference',
      key: { provider: 1, providerRefundId: 1 },
      unique: true,
      sparse: true,
      hidden: true
    }
  ])('refuses legacy reconciliation when key order or options differ', (actual) => {
    const plan = runner.buildProductionPlan(createBaselineSnapshot(actual));
    expect(plan.reconciles).toEqual([]);
    expect(plan.conflicts).toEqual([{
      collection: 'refunds',
      name: 'unique_provider_refund_reference',
      reason: 'NAME_COLLISION_WITH_DIFFERENT_DEFINITION'
    }]);
  });

  test('re-checks the exact legacy definition before drop and creates the reviewed final index', async () => {
    const legacy = toActualIndex(sharedPlan.KNOWN_LEGACY_INDEX_DEFINITIONS[0]);
    const finalDefinition = sharedPlan.ALLOWLIST.find(
      (entry) => entry.name === 'unique_provider_refund_reference'
    );
    let currentIndexes = [legacy];
    const collection = {
      listIndexes: jest.fn(() => ({
        toArray: jest.fn(async () => currentIndexes)
      })),
      dropIndex: jest.fn(async () => {
        currentIndexes = [];
      }),
      createIndex: jest.fn(async (keys, options) => {
        currentIndexes = [{
          v: 2,
          name: options.name,
          key: keys,
          ...options
        }];
      })
    };
    const database = { collection: jest.fn(() => collection) };
    const state = { mutationStarted: false, completedOperations: [] };
    await expect(runner.applyControlledOperations(database, {
      retained: [], creates: [], blocked: [], conflicts: [],
      reconciles: [{
        collection: 'refunds',
        name: 'unique_provider_refund_reference'
      }]
    }, {}, state)).resolves.toBe(state);
    expect(collection.dropIndex)
      .toHaveBeenCalledWith('unique_provider_refund_reference');
    expect(collection.createIndex).toHaveBeenCalledWith(
      finalDefinition.keys,
      { ...finalDefinition.options, name: finalDefinition.name }
    );
    expect(state).toEqual({
      mutationStarted: true,
      completedOperations: [
        {
          operation: 'drop-known-legacy',
          collection: 'refunds',
          name: 'unique_provider_refund_reference'
        },
        {
          operation: 'create-reviewed-final',
          collection: 'refunds',
          name: 'unique_provider_refund_reference'
        }
      ]
    });
  });

  test('never drops an index whose legacy definition changed after planning', async () => {
    const collection = {
      listIndexes: jest.fn(() => ({
        toArray: jest.fn(async () => [{
          v: 2,
          name: 'unique_provider_refund_reference',
          key: { provider: 1, providerRefundId: 1 },
          unique: true
        }])
      })),
      dropIndex: jest.fn(),
      createIndex: jest.fn()
    };
    const database = { collection: jest.fn(() => collection) };
    await expect(runner.applyControlledOperations(database, {
      retained: [], creates: [], blocked: [], conflicts: [],
      reconciles: [{
        collection: 'refunds',
        name: 'unique_provider_refund_reference'
      }]
    }, {})).rejects.toThrow('LEGACY_INDEX_CHANGED_BEFORE_RECONCILIATION');
    expect(collection.dropIndex).not.toHaveBeenCalled();
    expect(collection.createIndex).not.toHaveBeenCalled();
  });

  test('precondition failure prevents every mutation call', async () => {
    const database = { collection: jest.fn() };
    const state = { mutationStarted: false, completedOperations: [] };
    await expect(runner.applyControlledOperations(
      database,
      runner.buildProductionPlan(createBaselineSnapshot()),
      { duplicateProviderRefundReferences: 1 },
      state
    )).rejects.toThrow('PREFLIGHT_BLOCKED');
    expect(database.collection).not.toHaveBeenCalled();
    expect(state).toEqual({ mutationStarted: false, completedOperations: [] });
  });
});
