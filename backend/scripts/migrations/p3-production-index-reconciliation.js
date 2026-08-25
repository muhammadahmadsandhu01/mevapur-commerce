#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const {
  ALLOWLIST,
  INDEX_PLAN_VERSION,
  KNOWN_LEGACY_INDEX_DEFINITIONS,
  classifyIndexes,
  runDataChecks,
  sameIndex
} = require('./p3-index-plan');

const EXPECTED_DATABASE = 'mevapur_staging';
const PRODUCTION_CONFIRMATION_PHRASE = 'I_ACKNOWLEDGE_MEVAPUR_STAGING_IS_PRODUCTION';
const APPLY_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BACKUP_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MIN_BACKUP_SIZE_BYTES = 1024;

class ProductionMigrationRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionMigrationRefusal';
    this.code = code;
  }
}

function requireArgumentValue(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new ProductionMigrationRefusal('ARGUMENT_VALUE_REQUIRED');
  }
  return value;
}

function parseArguments(argv = []) {
  const result = {
    mode: 'dry-run',
    backup: null,
    backupSize: null,
    backupSha256: null,
    backupAcknowledged: false,
    productionConfirmation: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--backup') {
      result.backup = requireArgumentValue(argv, index);
      index += 1;
    } else if (argument === '--backup-size') {
      result.backupSize = Number(requireArgumentValue(argv, index));
      index += 1;
    } else if (argument === '--backup-sha256') {
      result.backupSha256 = requireArgumentValue(argv, index).toUpperCase();
      index += 1;
    } else if (argument === '--apply') {
      result.mode = 'apply';
    } else if (argument === '--backup-acknowledged') {
      result.backupAcknowledged = true;
    } else if (argument === '--confirm-production') {
      result.productionConfirmation = requireArgumentValue(argv, index);
      index += 1;
    } else {
      throw new ProductionMigrationRefusal('UNSUPPORTED_ARGUMENT');
    }
  }

  if (
    !result.backup ||
    !Number.isSafeInteger(result.backupSize) ||
    result.backupSize <= 0 ||
    !/^[0-9A-F]{64}$/.test(result.backupSha256 || '')
  ) {
    throw new ProductionMigrationRefusal('BACKUP_EVIDENCE_ARGUMENTS_REQUIRED');
  }
  if (
    result.mode === 'dry-run' &&
    (result.backupAcknowledged || result.productionConfirmation)
  ) {
    throw new ProductionMigrationRefusal('APPLY_FLAG_REQUIRED_FOR_APPLY_ACKNOWLEDGMENTS');
  }

  return Object.freeze(result);
}

function validateApplyAuthorization(options) {
  if (options.mode !== 'apply') return;
  if (options.productionConfirmation !== PRODUCTION_CONFIRMATION_PHRASE) {
    throw new ProductionMigrationRefusal('PRODUCTION_CONFIRMATION_REQUIRED');
  }
  if (!options.backupAcknowledged) {
    throw new ProductionMigrationRefusal('BACKUP_ACKNOWLEDGMENT_REQUIRED');
  }
}

function validateRuntimeEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== 'production') {
    throw new ProductionMigrationRefusal('NODE_ENV_PRODUCTION_REQUIRED');
  }
  if (environment.APP_ENV !== 'production') {
    throw new ProductionMigrationRefusal('APP_ENV_PRODUCTION_REQUIRED');
  }
  if (
    typeof environment.MONGODB_URI !== 'string' ||
    environment.MONGODB_URI.trim() === ''
  ) {
    throw new ProductionMigrationRefusal('MONGODB_URI_REQUIRED');
  }
}

function parseMongoTarget(uri) {
  if (typeof uri !== 'string' || uri.trim() !== uri) {
    throw new ProductionMigrationRefusal('MONGODB_URI_FORMAT_INVALID');
  }
  const match = /^(mongodb(?:\+srv)?):\/\/([^\/?#]+)\/([^?#]*)(?:\?([^#]*))?$/i.exec(uri);
  if (!match) {
    throw new ProductionMigrationRefusal('MONGODB_URI_FORMAT_INVALID');
  }

  let database;
  const parameters = new Map();
  try {
    database = decodeURIComponent(match[3]);
    for (const pair of (match[4] || '').split('&').filter(Boolean)) {
      const separator = pair.indexOf('=');
      const key = decodeURIComponent(
        separator < 0 ? pair : pair.slice(0, separator)
      ).toLowerCase();
      const value = decodeURIComponent(
        separator < 0 ? '' : pair.slice(separator + 1)
      );
      if (!parameters.has(key)) parameters.set(key, []);
      parameters.get(key).push(value);
    }
  } catch {
    throw new ProductionMigrationRefusal('MONGODB_URI_FORMAT_INVALID');
  }

  if (!database) {
    throw new ProductionMigrationRefusal('EXPLICIT_DATABASE_REQUIRED');
  }
  if (database !== EXPECTED_DATABASE) {
    throw new ProductionMigrationRefusal('PRODUCTION_DATABASE_MISMATCH');
  }

  const tlsValues = [
    ...(parameters.get('tls') || []),
    ...(parameters.get('ssl') || [])
  ].map((value) => value.toLowerCase());
  const tlsEnabled =
    !tlsValues.includes('false') &&
    (match[1].toLowerCase() === 'mongodb+srv' || tlsValues.includes('true'));
  if (!tlsEnabled) {
    throw new ProductionMigrationRefusal('TLS_REQUIRED');
  }

  const replicaSet = (parameters.get('replicaset') || [])
    .find((value) => value.trim());
  if (!replicaSet) {
    throw new ProductionMigrationRefusal('REPLICA_SET_REQUIRED');
  }

  return Object.freeze({ database, replicaSet, tlsEnabled: true });
}

function isInsideProject(projectRoot, candidate) {
  const relative = path.relative(projectRoot, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex').toUpperCase()));
  });
}

async function validateBackupEvidence(options, {
  projectRoot = path.resolve(__dirname, '..', '..', '..'),
  nowMs = Date.now()
} = {}) {
  if (!path.isAbsolute(options.backup)) {
    throw new ProductionMigrationRefusal('BACKUP_PATH_REFUSED');
  }
  const backupPath = path.resolve(options.backup);
  if (
    path.extname(backupPath).toLowerCase() !== '.gz' ||
    !backupPath.toLowerCase().endsWith('.archive.gz')
  ) {
    throw new ProductionMigrationRefusal('BACKUP_PATH_REFUSED');
  }

  let stat;
  let canonicalBackupPath;
  let canonicalProjectRoot;
  try {
    canonicalBackupPath = fs.realpathSync.native(backupPath);
    canonicalProjectRoot = fs.realpathSync.native(projectRoot);
    stat = fs.statSync(canonicalBackupPath);
  } catch {
    throw new ProductionMigrationRefusal('BACKUP_FILE_REQUIRED');
  }
  if (isInsideProject(canonicalProjectRoot, canonicalBackupPath)) {
    throw new ProductionMigrationRefusal('BACKUP_PATH_REFUSED');
  }
  if (!stat.isFile()) {
    throw new ProductionMigrationRefusal('BACKUP_FILE_REQUIRED');
  }
  if (stat.size < MIN_BACKUP_SIZE_BYTES) {
    throw new ProductionMigrationRefusal('BACKUP_TOO_SMALL');
  }
  if (stat.size !== options.backupSize) {
    throw new ProductionMigrationRefusal('BACKUP_SIZE_MISMATCH');
  }

  let actualHash;
  try {
    actualHash = await sha256File(canonicalBackupPath);
  } catch {
    throw new ProductionMigrationRefusal('BACKUP_HASH_UNAVAILABLE');
  }
  if (actualHash !== options.backupSha256) {
    throw new ProductionMigrationRefusal('BACKUP_HASH_MISMATCH');
  }

  const ageMs = nowMs - stat.mtimeMs;
  if (ageMs < -BACKUP_CLOCK_SKEW_MS) {
    throw new ProductionMigrationRefusal('BACKUP_TIMESTAMP_IN_FUTURE');
  }
  const applyAgeEligible = ageMs <= APPLY_BACKUP_MAX_AGE_MS;
  if (options.mode === 'apply' && !applyAgeEligible) {
    throw new ProductionMigrationRefusal('APPLY_BACKUP_TOO_OLD');
  }

  return Object.freeze({
    path: canonicalBackupPath,
    size: stat.size,
    sha256: actualHash,
    ageMs: Math.max(ageMs, 0),
    applyAgeEligible
  });
}

async function verifyTopology(client, target) {
  const database = client.db();
  if (database.databaseName !== EXPECTED_DATABASE) {
    throw new ProductionMigrationRefusal('CONNECTED_DATABASE_MISMATCH');
  }

  let ping;
  let hello;
  try {
    ping = await database.command({ ping: 1 });
    hello = await database.command({ hello: 1 });
  } catch {
    throw new ProductionMigrationRefusal('TOPOLOGY_VERIFICATION_FAILED');
  }
  const description = client.topology?.description;
  const primaryAvailable =
    description?.type === 'ReplicaSetWithPrimary' &&
    Boolean(hello.isWritablePrimary ?? hello.ismaster);
  const replicaSetMatches =
    typeof hello.setName === 'string' &&
    hello.setName === target.replicaSet;
  const logicalSessionSupport =
    Number.isInteger(hello.logicalSessionTimeoutMinutes) &&
    hello.logicalSessionTimeoutMinutes > 0;
  const transactionCapable =
    primaryAvailable &&
    replicaSetMatches &&
    logicalSessionSupport &&
    Number.isInteger(hello.maxWireVersion) &&
    hello.maxWireVersion >= 7;

  if (ping.ok !== 1 || !transactionCapable) {
    throw new ProductionMigrationRefusal('TRANSACTION_CAPABLE_REPLICA_SET_REQUIRED');
  }

  return Object.freeze({
    topologyType: description.type,
    primaryAvailable,
    replicaSetMatches,
    logicalSessionSupport,
    maximumWireVersion: hello.maxWireVersion,
    transactionCapable
  });
}

async function snapshotControlledIndexes(database) {
  const available = (await database.listCollections({}, { nameOnly: true }).toArray())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
  const controlledCollections = [...new Set(
    ALLOWLIST.map((definition) => definition.collection)
  )].sort();
  const existing = new Set(available);
  const indexes = {};
  const counts = {};

  for (const collection of controlledCollections) {
    if (!existing.has(collection)) {
      indexes[collection] = [];
      counts[collection] = null;
      continue;
    }
    indexes[collection] = await database.collection(collection).listIndexes().toArray();
    counts[collection] = await database.collection(collection).countDocuments({});
  }

  return { collections: available, indexes, counts };
}

function findDefinition(collection, name, definitions = ALLOWLIST) {
  return definitions.find(
    (definition) => definition.collection === collection && definition.name === name
  );
}

function buildProductionPlan(snapshot) {
  const classification = classifyIndexes(snapshot);
  const reconciles = [];
  const conflicts = [];

  for (const conflict of classification.conflicts) {
    const legacy = findDefinition(
      conflict.collection,
      conflict.name,
      KNOWN_LEGACY_INDEX_DEFINITIONS
    );
    const actual = (snapshot.indexes[conflict.collection] || [])
      .find((index) => index.name === conflict.name);
    if (
      conflict.reason === 'NAME_COLLISION_WITH_DIFFERENT_DEFINITION' &&
      legacy &&
      actual &&
      sameIndex(actual, legacy)
    ) {
      reconciles.push({
        collection: conflict.collection,
        name: conflict.name,
        reason: 'KNOWN_REVIEWED_LEGACY_DEFINITION'
      });
    } else {
      conflicts.push(conflict);
    }
  }

  if (classification.legacyRemoval) {
    conflicts.push({
      collection: classification.legacyRemoval.collection,
      name: classification.legacyRemoval.name,
      reason: 'LEGACY_PAYMENT_TTL_REQUIRES_SEPARATE_REVIEW'
    });
  }

  return {
    retained: classification.retained,
    creates: classification.creates,
    reconciles,
    blocked: classification.blocked,
    conflicts
  };
}

function failedDataChecks(dataChecks) {
  return Object.entries(dataChecks)
    .filter(([, count]) => count !== 0)
    .map(([name, count]) => ({ name, count }));
}

function planStatus(plan, dataChecks) {
  return (
    plan.blocked.length ||
    plan.conflicts.length ||
    failedDataChecks(dataChecks).length
  ) ? 'BLOCKED' : 'PASS';
}

function safePlanSummary({
  mode,
  backup,
  topology,
  snapshot,
  dataChecks,
  plan,
  state
}) {
  return {
    status: planStatus(plan, dataChecks),
    mode,
    database: EXPECTED_DATABASE,
    productionData: true,
    indexPlanVersion: INDEX_PLAN_VERSION,
    backupEvidence: {
      path: backup.path,
      size: backup.size,
      sha256: backup.sha256,
      ageSeconds: Math.floor(backup.ageMs / 1000),
      applyAgeEligible: backup.applyAgeEligible
    },
    topology,
    controlledCollectionCounts: snapshot.counts,
    dataChecks: {
      total: Object.keys(dataChecks).length,
      failed: failedDataChecks(dataChecks)
    },
    retained: plan.retained,
    proposedCreates: plan.creates,
    proposedReconciliations: plan.reconciles,
    blocked: plan.blocked,
    conflicts: plan.conflicts,
    mutationStarted: state.mutationStarted,
    completedOperations: [...state.completedOperations],
    zeroDocumentOperations: true,
    automaticRollback: false,
    privateValueDisplayed: false
  };
}

async function readCollectionIndexes(database, collection) {
  return database.collection(collection).listIndexes().toArray();
}

async function createAndVerify(database, definition, state, operation) {
  state.mutationStarted = true;
  try {
    await database.collection(definition.collection).createIndex(
      definition.keys,
      { ...definition.options, name: definition.name }
    );
  } catch {
    throw new ProductionMigrationRefusal('INDEX_MUTATION_FAILED');
  }
  state.completedOperations.push({
    operation,
    collection: definition.collection,
    name: definition.name
  });
  const current = (await readCollectionIndexes(database, definition.collection))
    .find((index) => index.name === definition.name);
  if (!current || !sameIndex(current, definition)) {
    throw new ProductionMigrationRefusal('POST_OPERATION_INDEX_VERIFICATION_FAILED');
  }
}

async function applyControlledOperations(database, plan, dataChecks, state = {
  mutationStarted: false,
  completedOperations: []
}) {
  if (planStatus(plan, dataChecks) !== 'PASS') {
    throw new ProductionMigrationRefusal('PREFLIGHT_BLOCKED');
  }

  for (const proposed of plan.creates) {
    const definition = findDefinition(proposed.collection, proposed.name);
    const current = await readCollectionIndexes(database, proposed.collection);
    if (
      current.some((index) => index.name === definition.name) ||
      current.some((index) => JSON.stringify(index.key) === JSON.stringify(definition.keys))
    ) {
      throw new ProductionMigrationRefusal('INDEX_STATE_CHANGED_BEFORE_CREATE');
    }
    await createAndVerify(database, definition, state, 'create-missing');
  }

  for (const proposed of plan.reconciles) {
    const finalDefinition = findDefinition(proposed.collection, proposed.name);
    const legacyDefinition = findDefinition(
      proposed.collection,
      proposed.name,
      KNOWN_LEGACY_INDEX_DEFINITIONS
    );
    const current = (await readCollectionIndexes(database, proposed.collection))
      .find((index) => index.name === proposed.name);
    if (!current || !legacyDefinition || !sameIndex(current, legacyDefinition)) {
      throw new ProductionMigrationRefusal('LEGACY_INDEX_CHANGED_BEFORE_RECONCILIATION');
    }

    state.mutationStarted = true;
    try {
      await database.collection(proposed.collection).dropIndex(proposed.name);
    } catch {
      throw new ProductionMigrationRefusal('INDEX_MUTATION_FAILED');
    }
    state.completedOperations.push({
      operation: 'drop-known-legacy',
      collection: proposed.collection,
      name: proposed.name
    });
    await createAndVerify(
      database,
      finalDefinition,
      state,
      'create-reviewed-final'
    );
  }

  return state;
}

async function runProductionMigration({
  argv = process.argv.slice(2),
  environment = process.env,
  nowMs = Date.now(),
  state = { mutationStarted: false, completedOperations: [] },
  createClient = (uri, options) => new MongoClient(uri, options)
} = {}) {
  const options = parseArguments(argv);
  validateRuntimeEnvironment(environment);
  validateApplyAuthorization(options);
  const target = parseMongoTarget(environment.MONGODB_URI);
  const backup = await validateBackupEvidence(options, { nowMs });
  const client = createClient(environment.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 20000,
    maxPoolSize: 2,
    appName: 'MevaPur-Production-Controlled-Index-Reconciliation'
  });

  try {
    try {
      await client.connect();
    } catch {
      throw new ProductionMigrationRefusal('PRODUCTION_CONNECTIVITY_FAILED');
    }
    const topology = await verifyTopology(client, target);
    const database = client.db();
    let snapshot;
    let dataChecks;
    try {
      snapshot = await snapshotControlledIndexes(database);
      dataChecks = await runDataChecks(database);
    } catch {
      throw new ProductionMigrationRefusal('READ_ONLY_PREFLIGHT_FAILED');
    }
    const plan = buildProductionPlan(snapshot);

    if (options.mode === 'apply' && planStatus(plan, dataChecks) === 'PASS') {
      await applyControlledOperations(database, plan, dataChecks, state);
      const postSnapshot = await snapshotControlledIndexes(database);
      const postPlan = buildProductionPlan(postSnapshot);
      if (
        postPlan.creates.length ||
        postPlan.reconciles.length ||
        postPlan.blocked.length ||
        postPlan.conflicts.length ||
        postPlan.retained.length !== ALLOWLIST.length
      ) {
        throw new ProductionMigrationRefusal('POST_MIGRATION_PLAN_VERIFICATION_FAILED');
      }
      snapshot = postSnapshot;
    }

    return safePlanSummary({
      mode: options.mode,
      backup,
      topology,
      snapshot,
      dataChecks,
      plan,
      state
    });
  } finally {
    await client.close().catch(() => {});
  }
}

async function main() {
  const state = { mutationStarted: false, completedOperations: [] };
  try {
    const result = await runProductionMigration({ state });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'PASS') process.exitCode = 3;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: 'FAIL',
      errorClass: error?.name === 'ProductionMigrationRefusal'
        ? 'ProductionMigrationRefusal'
        : 'ProductionMigrationExecutionError',
      errorCode: error?.name === 'ProductionMigrationRefusal'
        ? error.code
        : 'UNEXPECTED_FAILURE',
      database: EXPECTED_DATABASE,
      productionData: true,
      mutationStarted: state.mutationStarted,
      completedOperations: state.completedOperations,
      automaticRollback: false,
      privateValueDisplayed: false
    })}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  ALLOWLIST,
  APPLY_BACKUP_MAX_AGE_MS,
  EXPECTED_DATABASE,
  MIN_BACKUP_SIZE_BYTES,
  PRODUCTION_CONFIRMATION_PHRASE,
  ProductionMigrationRefusal,
  applyControlledOperations,
  buildProductionPlan,
  failedDataChecks,
  parseArguments,
  parseMongoTarget,
  planStatus,
  runProductionMigration,
  safePlanSummary,
  sha256File,
  snapshotControlledIndexes,
  validateApplyAuthorization,
  validateBackupEvidence,
  validateRuntimeEnvironment,
  verifyTopology
};
