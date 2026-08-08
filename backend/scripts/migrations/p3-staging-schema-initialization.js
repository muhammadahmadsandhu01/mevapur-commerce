#!/usr/bin/env node
'use strict';

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
  application: 'MevaPur'
});

const COLLECTION_ALLOWLIST = Object.freeze([
  'users',
  'sessions',
  'orders',
  'inventorytransactions',
  'payments',
  'paymentwebhookevents',
  'refunds'
]);

class InitializationRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'InitializationRefusal';
    this.code = code;
  }
}

function parseArguments(argv) {
  const result = { mode: 'dry-run', config: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') {
      result.mode = argv[++index];
    } else if (argument === '--config') {
      result.config = argv[++index];
    } else {
      throw new InitializationRefusal('UNSUPPORTED_ARGUMENT');
    }
  }

  if (!['dry-run', 'apply'].includes(result.mode)) {
    throw new InitializationRefusal('UNSUPPORTED_MODE');
  }
  if (!result.config) {
    throw new InitializationRefusal('PRIVATE_CONFIG_REQUIRED');
  }

  return result;
}

function parseEnvironmentFile(filePath) {
  const values = {};

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) {
      throw new InitializationRefusal('PRIVATE_CONFIG_PARSE_ERROR');
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || Object.hasOwn(values, key)) {
      throw new InitializationRefusal('PRIVATE_CONFIG_PARSE_ERROR');
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
    throw new InitializationRefusal('NON_SRV_URI_REQUIRED');
  }

  const body = uri.slice('mongodb://'.length);
  const slash = body.indexOf('/');
  if (slash < 1) throw new InitializationRefusal('PRIVATE_URI_FORMAT_INVALID');

  const authority = body.slice(0, slash);
  const at = authority.lastIndexOf('@');
  if (at < 1) throw new InitializationRefusal('PRIVATE_URI_FORMAT_INVALID');

  const userInfo = authority.slice(0, at);
  const userSeparator = userInfo.indexOf(':');
  if (userSeparator < 1) {
    throw new InitializationRefusal('PRIVATE_URI_FORMAT_INVALID');
  }

  const remainder = body.slice(slash + 1);
  const querySeparator = remainder.indexOf('?');
  const database = decodeURIComponent(
    querySeparator < 0 ? remainder : remainder.slice(0, querySeparator)
  );
  const parameters = new URLSearchParams(
    querySeparator < 0 ? '' : remainder.slice(querySeparator + 1)
  );

  return {
    user: decodeURIComponent(userInfo.slice(0, userSeparator)),
    database,
    hosts: authority.slice(at + 1).split(',').filter(Boolean),
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
    throw new InitializationRefusal('GENERIC_OR_PROJECT_ENVIRONMENT_REFUSED');
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
    throw new InitializationRefusal('PRIVATE_CONFIG_VALUE_MISSING');
  }

  const migration = parseStandardMongoUri(config.P3_STAGING_MIGRATION_URI);
  const tlsEnabled =
    migration.parameters.get('tls') === 'true' ||
    migration.parameters.get('ssl') === 'true';

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
    migration.user !== config.P3_STAGING_MIGRATION_USER ||
    migration.database !== EXPECTED.database ||
    migration.hosts.length < 2 ||
    !tlsEnabled ||
    !migration.parameters.get('replicaSet') ||
    migration.parameters.get('authSource') !== 'admin'
  ) {
    throw new InitializationRefusal('PRIVATE_STAGING_IDENTITY_MISMATCH');
  }

  return config;
}

async function readTopology(database) {
  const collectionNames = (
    await database.listCollections({}, { nameOnly: true }).toArray()
  )
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
  const allowedNames = new Set([
    EXPECTED.markerCollection,
    ...COLLECTION_ALLOWLIST
  ]);
  const unapproved = collectionNames.filter((name) => !allowedNames.has(name));
  if (unapproved.length) {
    throw new InitializationRefusal('UNAPPROVED_COLLECTION_PRESENT');
  }
  if (!collectionNames.includes(EXPECTED.markerCollection)) {
    throw new InitializationRefusal('MARKER_COLLECTION_ABSENT');
  }

  const collectionCounts = {};
  const indexCounts = {};
  let aggregateDocumentCount = 0;
  let aggregateIndexCount = 0;

  for (const collectionName of collectionNames) {
    const collection = database.collection(collectionName);
    collectionCounts[collectionName] = await collection.countDocuments({});
    const indexes = await collection.listIndexes().toArray();
    indexCounts[collectionName] = indexes.length;
    aggregateDocumentCount += collectionCounts[collectionName];
    aggregateIndexCount += indexes.length;

    if (
      indexes.length !== 1 ||
      indexes[0].name !== '_id_' ||
      JSON.stringify(indexes[0].key) !== JSON.stringify({ _id: 1 })
    ) {
      throw new InitializationRefusal('UNEXPECTED_INDEX_PRESENT');
    }
  }

  if (
    collectionCounts[EXPECTED.markerCollection] !== 1 ||
    COLLECTION_ALLOWLIST.some(
      (name) =>
        collectionNames.includes(name) && collectionCounts[name] !== 0
    )
  ) {
    throw new InitializationRefusal('UNEXPECTED_DOCUMENT_PRESENT');
  }

  const present = COLLECTION_ALLOWLIST.filter((name) =>
    collectionNames.includes(name)
  );
  const missing = COLLECTION_ALLOWLIST.filter(
    (name) => !collectionNames.includes(name)
  );

  return {
    collectionNames,
    collectionCounts,
    indexCounts,
    aggregateDocumentCount,
    aggregateIndexCount,
    present,
    missing
  };
}

async function verifyIdentity(database, config) {
  if (database.databaseName !== EXPECTED.database) {
    throw new InitializationRefusal('CONNECTED_DATABASE_MISMATCH');
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
    throw new InitializationRefusal('AUTHENTICATED_IDENTITY_MISMATCH');
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
    marker.productionDataAllowed !== false
  ) {
    throw new InitializationRefusal('STAGING_MARKER_MISMATCH');
  }
}

function safeResult(mode, topology, created = []) {
  return {
    status: 'PASS',
    mode,
    identity: 'PASS',
    marker: 'PASS',
    currentCollectionCount: topology.collectionNames.length,
    currentDocumentCount: topology.aggregateDocumentCount,
    currentIndexCount: topology.aggregateIndexCount,
    approvedCollectionsPresent: topology.present,
    proposedCollectionCreates: topology.missing,
    createdCollections: created,
    unapprovedCollectionCreates: 0,
    blocked: [],
    conflicts: [],
    documentOperations: 0,
    indexOperations: 0,
    databaseMutations: created.length,
    productionAccessed: false,
    providerAccessed: false,
    genericRuntimeEnvironmentUsed: false
  };
}

async function main() {
  let client;
  let mutationStarted = false;

  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    const config = validatePrivateConfiguration(arguments_.config);

    client = new MongoClient(config.P3_STAGING_MIGRATION_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 30000,
      maxPoolSize: 2,
      appName: 'MevaPur-P3-Staging-Schema-Initialization'
    });
    await client.connect();

    const database = client.db();
    await verifyIdentity(database, config);
    const before = await readTopology(database);

    if (arguments_.mode === 'dry-run') {
      process.stdout.write(`${JSON.stringify(safeResult('dry-run', before))}\n`);
      return;
    }

    const created = [];
    for (const collectionName of before.missing) {
      mutationStarted = true;
      await database.createCollection(collectionName);
      created.push(collectionName);
    }

    const after = await readTopology(database);
    if (
      after.collectionNames.length !== 8 ||
      after.aggregateDocumentCount !== 1 ||
      after.aggregateIndexCount !== 8 ||
      after.missing.length !== 0 ||
      after.present.length !== COLLECTION_ALLOWLIST.length
    ) {
      throw new InitializationRefusal('POST_INITIALIZATION_TOPOLOGY_MISMATCH');
    }

    process.stdout.write(
      `${JSON.stringify(safeResult('apply', after, created))}\n`
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        status: 'FAIL',
        errorClass:
          error?.name === 'InitializationRefusal'
            ? 'InitializationRefusal'
            : 'InitializationExecutionError',
        errorCode: String(error?.code || 'UNEXPECTED_FAILURE')
          .replace(/[^A-Za-z0-9_.-]/g, ''),
        mutationStarted,
        productionAccessed: false,
        providerAccessed: false,
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
