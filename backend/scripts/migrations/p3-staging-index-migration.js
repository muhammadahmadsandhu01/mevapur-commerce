#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const EXPECTED = Object.freeze({
  project: 'MevaPur-Staging',
  cluster: 'mevapur-staging',
  database: 'mevapur_staging',
  restoreDatabase: 'mevapur_staging_restore_test_p3',
  markerCollection: 'environment_markers',
  markerId: 'MEVAPUR_STAGING_ONLY',
  environment: 'staging',
  application: 'MevaPur',
  allowlistVersion: 'P3-STAGING-INDEX-V1'
});

const ALLOWLIST = Object.freeze([
  {
    collection: 'users',
    name: 'email_1',
    keys: { email: 1 },
    options: { unique: true }
  },
  {
    collection: 'sessions',
    name: 'expiresAt_1',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 }
  },
  {
    collection: 'orders',
    name: 'orderId_1',
    keys: { orderId: 1 },
    options: { unique: true }
  },
  {
    collection: 'orders',
    name: 'unique_user_order_idempotency',
    keys: { user: 1, idempotencyKey: 1 },
    options: { unique: true }
  },
  {
    collection: 'inventorytransactions',
    name: 'operationKey_1',
    keys: { operationKey: 1 },
    options: { unique: true, sparse: true }
  },
  {
    collection: 'payments',
    name: 'unique_user_payment_idempotency',
    keys: { user: 1, idempotencyKey: 1 },
    options: { unique: true }
  },
  {
    collection: 'payments',
    name: 'unique_provider_payment_reference',
    keys: { provider: 1, providerPaymentId: 1 },
    options: { unique: true, sparse: true }
  },
  {
    collection: 'payments',
    name: 'order_1_createdAt_-1',
    keys: { order: 1, createdAt: -1 },
    options: {}
  },
  {
    collection: 'payments',
    name: 'unique_manual_customer_reference',
    keys: { customerReferenceHash: 1 },
    options: { unique: true, sparse: true }
  },
  {
    collection: 'paymentwebhookevents',
    name: 'unique_provider_webhook_event',
    keys: { provider: 1, providerEventId: 1 },
    options: { unique: true }
  },
  {
    collection: 'refunds',
    name: 'refundNumber_1',
    keys: { refundNumber: 1 },
    options: { unique: true }
  },
  {
    collection: 'refunds',
    name: 'unique_payment_refund_idempotency',
    keys: { payment: 1, idempotencyKey: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        payment: { $type: 'objectId' },
        idempotencyKey: { $type: 'string' }
      }
    }
  },
  {
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
    collection: 'refunds',
    name: 'status_1_createdAt_-1',
    keys: { status: 1, createdAt: -1 },
    options: {}
  }
]);

const PAYMENT_PROVIDERS = Object.freeze([
  'cod',
  'bank_transfer',
  'raast',
  'stripe',
  'jazzcash',
  'easypaisa'
]);

const PAYMENT_STATUSES = Object.freeze([
  'Pending',
  'AwaitingCustomerPayment',
  'AwaitingVerification',
  'Processing',
  'Completed',
  'Rejected',
  'Failed',
  'Expired',
  'Cancelled',
  'PartiallyRefunded',
  'Refunded'
]);

class MigrationRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'MigrationRefusal';
    this.code = code;
  }
}

function parseArguments(argv) {
  const result = { mode: 'dry-run', config: null, backup: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') {
      result.mode = argv[++index];
    } else if (argument === '--config') {
      result.config = argv[++index];
    } else if (argument === '--backup') {
      result.backup = argv[++index];
    } else {
      throw new MigrationRefusal('UNSUPPORTED_ARGUMENT');
    }
  }

  if (!['dry-run', 'apply'].includes(result.mode)) {
    throw new MigrationRefusal('UNSUPPORTED_MODE');
  }
  if (!result.config || !result.backup) {
    throw new MigrationRefusal('CONFIG_AND_BACKUP_REQUIRED');
  }

  return result;
}

function parseEnvironmentFile(filePath) {
  const values = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) throw new MigrationRefusal('PRIVATE_CONFIG_PARSE_ERROR');

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || Object.hasOwn(values, key)) {
      throw new MigrationRefusal('PRIVATE_CONFIG_PARSE_ERROR');
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function parseStandardMongoUri(uri) {
  if (!uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://')) {
    throw new MigrationRefusal('NON_SRV_URI_REQUIRED');
  }

  const body = uri.slice('mongodb://'.length);
  const slash = body.indexOf('/');
  if (slash < 1) throw new MigrationRefusal('PRIVATE_URI_FORMAT_INVALID');

  const authority = body.slice(0, slash);
  const at = authority.lastIndexOf('@');
  if (at < 1) throw new MigrationRefusal('PRIVATE_URI_FORMAT_INVALID');

  const userInfo = authority.slice(0, at);
  const userSeparator = userInfo.indexOf(':');
  if (userSeparator < 1) throw new MigrationRefusal('PRIVATE_URI_FORMAT_INVALID');

  const remainder = body.slice(slash + 1);
  const querySeparator = remainder.indexOf('?');
  const database = decodeURIComponent(
    querySeparator < 0 ? remainder : remainder.slice(0, querySeparator)
  );
  const parameters = new URLSearchParams(
    querySeparator < 0 ? '' : remainder.slice(querySeparator + 1)
  );
  const hosts = authority.slice(at + 1).split(',').filter(Boolean);

  return {
    user: decodeURIComponent(userInfo.slice(0, userSeparator)),
    database,
    hosts,
    parameters
  };
}

function validatePrivateConfiguration(configPath) {
  const resolvedConfig = path.resolve(configPath);
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const relativeToProject = path.relative(projectRoot, resolvedConfig);

  if (
    !relativeToProject.startsWith('..') ||
    path.basename(resolvedConfig).toLowerCase() !== 'p3-staging.env'
  ) {
    throw new MigrationRefusal('GENERIC_OR_PROJECT_ENVIRONMENT_REFUSED');
  }

  const config = parseEnvironmentFile(resolvedConfig);
  const required = [
    'P3_STAGING_APP_URI',
    'P3_STAGING_MIGRATION_URI',
    'P3_STAGING_APP_USER',
    'P3_STAGING_MIGRATION_USER',
    'P3_STAGING_ATLAS_PROJECT',
    'P3_STAGING_ATLAS_PROJECT_ID',
    'P3_STAGING_ATLAS_CLUSTER',
    'P3_STAGING_DATABASE',
    'P3_STAGING_RESTORE_DATABASE',
    'P3_STAGING_MARKER_COLLECTION',
    'P3_STAGING_MARKER_ID',
    'P3_STAGING_EXPECTED_ENVIRONMENT',
    'P3_STAGING_SYNTHETIC_ONLY',
    'P3_STAGING_PRODUCTION_DATA_ALLOWED'
  ];

  if (required.some((key) => !config[key])) {
    throw new MigrationRefusal('PRIVATE_CONFIG_VALUE_MISSING');
  }

  const app = parseStandardMongoUri(config.P3_STAGING_APP_URI);
  const migration = parseStandardMongoUri(config.P3_STAGING_MIGRATION_URI);
  const hasTls = (parts) =>
    parts.parameters.get('tls') === 'true' ||
    parts.parameters.get('ssl') === 'true';
  const isApproved = (parts, user) =>
    parts.user === user &&
    parts.database === EXPECTED.database &&
    parts.hosts.length >= 2 &&
    hasTls(parts) &&
    Boolean(parts.parameters.get('replicaSet')) &&
    parts.parameters.get('authSource') === 'admin';

  if (
    config.P3_STAGING_ATLAS_PROJECT !== EXPECTED.project ||
    !/^[0-9a-fA-F]{24}$/.test(config.P3_STAGING_ATLAS_PROJECT_ID) ||
    config.P3_STAGING_ATLAS_CLUSTER !== EXPECTED.cluster ||
    config.P3_STAGING_DATABASE !== EXPECTED.database ||
    config.P3_STAGING_RESTORE_DATABASE !== EXPECTED.restoreDatabase ||
    config.P3_STAGING_MARKER_COLLECTION !== EXPECTED.markerCollection ||
    config.P3_STAGING_MARKER_ID !== EXPECTED.markerId ||
    config.P3_STAGING_EXPECTED_ENVIRONMENT !== EXPECTED.environment ||
    config.P3_STAGING_SYNTHETIC_ONLY !== 'true' ||
    config.P3_STAGING_PRODUCTION_DATA_ALLOWED !== 'false' ||
    config.P3_STAGING_APP_USER === config.P3_STAGING_MIGRATION_USER ||
    config.P3_STAGING_APP_URI === config.P3_STAGING_MIGRATION_URI ||
    !isApproved(app, config.P3_STAGING_APP_USER) ||
    !isApproved(migration, config.P3_STAGING_MIGRATION_USER)
  ) {
    throw new MigrationRefusal('PRIVATE_STAGING_IDENTITY_MISMATCH');
  }

  return config;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toUpperCase();
}

function validateBackup(backupPath) {
  const resolvedBackup = path.resolve(backupPath);
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const relativeToProject = path.relative(projectRoot, resolvedBackup);

  if (
    !relativeToProject.startsWith('..') ||
    !/^mongodb-staging-post-schema-init-\d{8}-\d{6}$/.test(
      path.basename(resolvedBackup)
    )
  ) {
    throw new MigrationRefusal('BACKUP_PATH_REFUSED');
  }

  const manifestPath = path.join(resolvedBackup, 'SHA256SUMS.txt');
  const dumpDatabasePath = path.join(resolvedBackup, EXPECTED.database);
  if (
    !fs.existsSync(manifestPath) ||
    !fs.existsSync(dumpDatabasePath)
  ) {
    throw new MigrationRefusal('BACKUP_EVIDENCE_MISSING');
  }

  const expectedCollections = [
    'environment_markers',
    'inventorytransactions',
    'orders',
    'payments',
    'paymentwebhookevents',
    'refunds',
    'sessions',
    'users'
  ];
  const dumpFiles = fs.readdirSync(dumpDatabasePath);
  const dumpedCollections = dumpFiles
    .filter((name) => name.endsWith('.bson.gz'))
    .map((name) => name.slice(0, -'.bson.gz'.length))
    .sort();
  const allMetadataPresent = expectedCollections.every((collection) =>
    dumpFiles.includes(`${collection}.metadata.json.gz`)
  );
  if (
    JSON.stringify(dumpedCollections) !== JSON.stringify(expectedCollections) ||
    !allMetadataPresent
  ) {
    throw new MigrationRefusal('BACKUP_COLLECTION_SET_MISMATCH');
  }

  const lines = fs.readFileSync(manifestPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean);
  if (!lines.length) throw new MigrationRefusal('BACKUP_MANIFEST_EMPTY');

  for (const line of lines) {
    const match = line.match(/^([0-9A-Fa-f]{64})  (.+)$/);
    if (!match) throw new MigrationRefusal('BACKUP_MANIFEST_INVALID');

    const filePath = path.resolve(resolvedBackup, match[2]);
    const relative = path.relative(resolvedBackup, filePath);
    if (relative.startsWith('..') || !fs.existsSync(filePath)) {
      throw new MigrationRefusal('BACKUP_MANIFEST_INVALID');
    }
    if (sha256(filePath) !== match[1].toUpperCase()) {
      throw new MigrationRefusal('BACKUP_HASH_MISMATCH');
    }
  }

  return {
    path: resolvedBackup,
    manifestEntries: lines.length
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function comparableIndex(index) {
  const result = {
    name: index.name,
    key: index.key
  };

  for (const option of [
    'unique',
    'sparse',
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation'
  ]) {
    if (index[option] !== undefined) result[option] = index[option];
  }

  return canonicalize(result);
}

function expectedIndex(definition) {
  return comparableIndex({
    name: definition.name,
    key: definition.keys,
    ...definition.options
  });
}

function sameIndex(actual, expected) {
  return JSON.stringify(comparableIndex(actual)) === JSON.stringify(expectedIndex(expected));
}

async function duplicateGroupCount(collection, match, groupId) {
  const pipeline = [];
  if (match) pipeline.push({ $match: match });
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'groups' }
  );
  const result = await collection.aggregate(pipeline, { allowDiskUse: false }).toArray();
  return result[0]?.groups || 0;
}

async function runDataChecks(database) {
  const users = database.collection('users');
  const orders = database.collection('orders');
  const payments = database.collection('payments');
  const webhookEvents = database.collection('paymentwebhookevents');
  const refunds = database.collection('refunds');
  const inventory = database.collection('inventorytransactions');

  const checks = {
    duplicateUserEmails: await duplicateGroupCount(
      users,
      { email: { $type: 'string' } },
      '$email'
    ),
    duplicateOrderIds: await duplicateGroupCount(
      orders,
      { orderId: { $type: 'string' } },
      '$orderId'
    ),
    duplicateOrderUserIdempotency: await duplicateGroupCount(
      orders,
      { user: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } },
      { user: '$user', key: '$idempotencyKey' }
    ),
    duplicatePaymentUserIdempotency: await duplicateGroupCount(
      payments,
      { user: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } },
      { user: '$user', key: '$idempotencyKey' }
    ),
    duplicateProviderPaymentReferences: await duplicateGroupCount(
      payments,
      { provider: { $type: 'string' }, providerPaymentId: { $type: 'string' } },
      { provider: '$provider', reference: '$providerPaymentId' }
    ),
    duplicateManualReferenceHashes: await duplicateGroupCount(
      payments,
      { customerReferenceHash: { $type: 'string' } },
      '$customerReferenceHash'
    ),
    duplicateWebhookProviderEvents: await duplicateGroupCount(
      webhookEvents,
      { provider: { $type: 'string' }, providerEventId: { $type: 'string' } },
      { provider: '$provider', event: '$providerEventId' }
    ),
    duplicateRefundNumbers: await duplicateGroupCount(
      refunds,
      { refundNumber: { $type: 'string' } },
      '$refundNumber'
    ),
    duplicateRefundIdempotency: await duplicateGroupCount(
      refunds,
      { payment: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } },
      { payment: '$payment', key: '$idempotencyKey' }
    ),
    duplicateProviderRefundReferences: await duplicateGroupCount(
      refunds,
      {
        provider: { $type: 'string' },
        providerRefundId: { $type: 'string', $gt: '' }
      },
      { provider: '$provider', reference: '$providerRefundId' }
    ),
    nullProviderRefundReferences: await refunds.countDocuments({
      providerRefundId: { $exists: true, $eq: null }
    }),
    emptyProviderRefundReferences: await refunds.countDocuments({
      providerRefundId: { $type: 'string', $eq: '' }
    }),
    duplicateInventoryOperationKeys: await duplicateGroupCount(
      inventory,
      { operationKey: { $type: 'string' } },
      '$operationKey'
    ),
    malformedPaymentProviders: await payments.countDocuments({
      $or: [
        { provider: { $exists: false } },
        { provider: null },
        { provider: { $not: { $type: 'string' } } },
        { provider: { $nin: PAYMENT_PROVIDERS } }
      ]
    }),
    unexpectedPaymentStatuses: await payments.countDocuments({
      $or: [
        { status: { $exists: false } },
        { status: null },
        { status: { $not: { $type: 'string' } } },
        { status: { $nin: PAYMENT_STATUSES } }
      ]
    }),
    legacyTtlAffectedDocuments: await payments.countDocuments({
      expiresAt: { $type: 'date' }
    }),
    paymentProviderReferenceTypeIncompatibilities: await payments.countDocuments({
      providerPaymentId: { $exists: true },
      $or: [
        { providerPaymentId: null },
        { providerPaymentId: { $not: { $type: 'string' } } },
        { provider: { $not: { $type: 'string' } } }
      ]
    }),
    manualReferenceTypeIncompatibilities: await payments.countDocuments({
      customerReferenceHash: { $exists: true },
      $or: [
        { customerReferenceHash: null },
        { customerReferenceHash: { $not: { $type: 'string' } } }
      ]
    }),
    refundIdempotencyTypeIncompatibilities: await refunds.countDocuments({
      $or: [
        { payment: { $exists: true, $not: { $type: 'objectId' } } },
        { idempotencyKey: { $exists: true, $not: { $type: 'string' } } }
      ]
    }),
    refundProviderReferenceTypeIncompatibilities: await refunds.countDocuments({
      providerRefundId: { $exists: true },
      $or: [
        {
          providerRefundId: {
            $ne: null,
            $not: { $type: 'string' }
          }
        },
        { provider: { $not: { $type: 'string' } } }
      ]
    }),
    inventoryOperationKeyTypeIncompatibilities: await inventory.countDocuments({
      operationKey: { $exists: true },
      $or: [
        { operationKey: null },
        { operationKey: { $not: { $type: 'string' } } }
      ]
    })
  };

  return checks;
}

async function snapshot(database) {
  const collections = (await database.listCollections({}, { nameOnly: true }).toArray())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
  const counts = {};
  const indexes = {};
  let aggregateDocuments = 0;

  for (const collection of collections) {
    counts[collection] = await database.collection(collection).countDocuments({});
    aggregateDocuments += counts[collection];
    indexes[collection] = await database.collection(collection).listIndexes().toArray();
  }

  return { collections, counts, indexes, aggregateDocuments };
}

async function verifyIdentity(database, config) {
  if (database.databaseName !== EXPECTED.database) {
    throw new MigrationRefusal('CONNECTED_DATABASE_MISMATCH');
  }

  const connectionStatus = await database.command({
    connectionStatus: 1,
    showPrivileges: false
  });
  const authenticatedUsers = connectionStatus?.authInfo?.authenticatedUsers || [];
  if (
    !authenticatedUsers.some(
      (entry) => entry.user === config.P3_STAGING_MIGRATION_USER
    )
  ) {
    throw new MigrationRefusal('AUTHENTICATED_MIGRATION_IDENTITY_MISMATCH');
  }

  const marker = await database.collection(EXPECTED.markerCollection).findOne(
    { _id: EXPECTED.markerId },
    {
      projection: {
        _id: 1,
        environment: 1,
        application: 1,
        syntheticDataOnly: 1,
        productionDataAllowed: 1
      }
    }
  );
  if (
    !marker ||
    marker.environment !== EXPECTED.environment ||
    marker.application !== EXPECTED.application ||
    marker.syntheticDataOnly !== true ||
    marker.productionDataAllowed !== false ||
    config.P3_STAGING_DATABASE !== EXPECTED.database
  ) {
    throw new MigrationRefusal('STAGING_MARKER_MISMATCH');
  }
}

function classifyIndexes(preSnapshot) {
  const existingCollections = new Set(preSnapshot.collections);
  const result = {
    retained: [],
    creates: [],
    blocked: [],
    conflicts: [],
    legacyRemoval: null
  };

  for (const definition of ALLOWLIST) {
    const safeIdentity = {
      collection: definition.collection,
      name: definition.name
    };
    if (!existingCollections.has(definition.collection)) {
      result.blocked.push({
        ...safeIdentity,
        reason: 'COLLECTION_ABSENT'
      });
      continue;
    }

    const actualIndexes = preSnapshot.indexes[definition.collection] || [];
    const sameName = actualIndexes.find((index) => index.name === definition.name);
    if (sameName) {
      if (sameIndex(sameName, definition)) {
        result.retained.push(safeIdentity);
      } else {
        result.conflicts.push({
          ...safeIdentity,
          reason: 'NAME_COLLISION_WITH_DIFFERENT_DEFINITION'
        });
      }
      continue;
    }

    const sameKeys = actualIndexes.find(
      (index) =>
        JSON.stringify(canonicalize(index.key)) ===
        JSON.stringify(canonicalize(definition.keys))
    );
    if (sameKeys) {
      result.conflicts.push({
        ...safeIdentity,
        reason: 'KEYS_EXIST_UNDER_DIFFERENT_DEFINITION'
      });
      continue;
    }

    result.creates.push(safeIdentity);
  }

  if (existingCollections.has('payments')) {
    const ttlCandidates = (preSnapshot.indexes.payments || []).filter(
      (index) =>
        JSON.stringify(index.key) === JSON.stringify({ expiresAt: 1 }) &&
        index.expireAfterSeconds !== undefined
    );
    if (ttlCandidates.length > 1) {
      result.conflicts.push({
        collection: 'payments',
        name: 'legacy-expiresAt-ttl',
        reason: 'MULTIPLE_LEGACY_TTL_CANDIDATES'
      });
    } else if (ttlCandidates.length === 1) {
      const candidate = ttlCandidates[0];
      const exact =
        candidate.expireAfterSeconds === 1800 &&
        candidate.unique === undefined &&
        candidate.sparse === undefined &&
        candidate.partialFilterExpression === undefined &&
        candidate.collation === undefined;
      if (!exact) {
        result.conflicts.push({
          collection: 'payments',
          name: candidate.name,
          reason: 'LEGACY_TTL_DEFINITION_MISMATCH'
        });
      } else {
        result.legacyRemoval = {
          collection: 'payments',
          name: candidate.name,
          keys: candidate.key,
          expireAfterSeconds: candidate.expireAfterSeconds
        };
      }
    }
  }

  return result;
}

function safeResult(mode, backup, preSnapshot, dataChecks, classification) {
  const blockedChecks = Object.entries(dataChecks)
    .filter(([, count]) => count !== 0)
    .map(([name, count]) => ({ name, count }));
  return {
    status:
      classification.blocked.length ||
      classification.conflicts.length ||
      blockedChecks.length
        ? 'BLOCKED'
        : 'PASS',
    mode,
    allowlistVersion: EXPECTED.allowlistVersion,
    identityGate: 'PASS',
    backupEvidence: {
      verified: true,
      manifestEntries: backup.manifestEntries
    },
    collectionCount: preSnapshot.collections.length,
    aggregateDocumentCount: preSnapshot.aggregateDocuments,
    dataChecks: {
      checks: Object.keys(dataChecks).length,
      blocked: blockedChecks
    },
    retained: classification.retained,
    proposedCreates: classification.creates,
    blocked: classification.blocked,
    conflicts: classification.conflicts,
    conditionalLegacyRemoval: classification.legacyRemoval
      ? {
          collection: classification.legacyRemoval.collection,
          name: classification.legacyRemoval.name
        }
      : null,
    zeroDocumentOperations: true,
    productionAccessed: false,
    genericRuntimeEnvironmentUsed: false
  };
}

async function applyMigration(database, preSnapshot, classification) {
  for (const proposed of classification.creates) {
    const definition = ALLOWLIST.find(
      (entry) =>
        entry.collection === proposed.collection &&
        entry.name === proposed.name
    );
    await database.collection(definition.collection).createIndex(
      definition.keys,
      {
        ...definition.options,
        name: definition.name
      }
    );
  }

  if (classification.legacyRemoval) {
    const current = (await database.collection('payments').listIndexes().toArray())
      .find((index) => index.name === classification.legacyRemoval.name);
    if (
      !current ||
      JSON.stringify(current.key) !== JSON.stringify({ expiresAt: 1 }) ||
      current.expireAfterSeconds !== 1800 ||
      current.unique !== undefined ||
      current.sparse !== undefined ||
      current.partialFilterExpression !== undefined ||
      current.collation !== undefined
    ) {
      throw new MigrationRefusal('LEGACY_TTL_CHANGED_BEFORE_REMOVAL');
    }
    await database.collection('payments').dropIndex(current.name);
  }

  const postSnapshot = await snapshot(database);
  if (
    JSON.stringify(preSnapshot.collections) !== JSON.stringify(postSnapshot.collections) ||
    JSON.stringify(preSnapshot.counts) !== JSON.stringify(postSnapshot.counts) ||
    preSnapshot.aggregateDocuments !== postSnapshot.aggregateDocuments
  ) {
    throw new MigrationRefusal('COLLECTION_OR_DOCUMENT_COUNTS_CHANGED');
  }

  const postClassification = classifyIndexes(postSnapshot);
  if (
    postClassification.creates.length ||
    postClassification.blocked.length ||
    postClassification.conflicts.length ||
    postClassification.legacyRemoval
  ) {
    throw new MigrationRefusal('POST_MIGRATION_INDEX_VERIFICATION_FAILED');
  }

  return postSnapshot;
}

async function main() {
  let client;
  let mutationStarted = false;
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    const config = validatePrivateConfiguration(arguments_.config);
    const backup = validateBackup(arguments_.backup);

    client = new MongoClient(config.P3_STAGING_MIGRATION_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 30000,
      maxPoolSize: 2,
      appName: 'MevaPur-P3-Allowlisted-Index-Migration'
    });
    await client.connect();

    const database = client.db();
    await verifyIdentity(database, config);
    const preSnapshot = await snapshot(database);
    const dataChecks = await runDataChecks(database);
    const classification = classifyIndexes(preSnapshot);
    const result = safeResult(
      arguments_.mode,
      backup,
      preSnapshot,
      dataChecks,
      classification
    );

    if (result.status !== 'PASS') {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 3;
      return;
    }

    if (arguments_.mode === 'dry-run') {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }

    mutationStarted = true;
    const postSnapshot = await applyMigration(database, preSnapshot, classification);
    process.stdout.write(
      `${JSON.stringify({
        ...result,
        status: 'PASS',
        mode: 'apply',
        indexesCreated: classification.creates,
        indexesRetained: classification.retained,
        legacyIndexRemoved: classification.legacyRemoval
          ? {
              collection: classification.legacyRemoval.collection,
              name: classification.legacyRemoval.name
            }
          : null,
        postCollectionCount: postSnapshot.collections.length,
        postAggregateDocumentCount: postSnapshot.aggregateDocuments,
        zeroDocumentOperations: true
      })}\n`
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        status: 'FAIL',
        errorClass: error?.name === 'MigrationRefusal'
          ? 'MigrationRefusal'
          : 'MigrationExecutionError',
        errorCode: String(error?.code || 'UNEXPECTED_FAILURE')
          .replace(/[^A-Za-z0-9_.-]/g, ''),
        mutationStarted,
        productionAccessed: false,
        genericRuntimeEnvironmentUsed: false,
        privateValueDisplayed: false
      })}\n`
    );
    process.exitCode = 2;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

main();
