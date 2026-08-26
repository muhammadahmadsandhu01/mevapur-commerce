#!/usr/bin/env node
'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const BootstrapState = require('../models/BootstrapState');
const passwordSchema = require('../validators/passwordValidator');
const { registerSchema } = require('../validators/authValidator');

const INITIAL_ADMIN_ROLE = 'super_admin';
const BOOTSTRAP_MARKER_ID = 'initial-super-admin-v1';
const PRODUCTION_CONFIRMATION_PHRASE =
  'CREATE INITIAL SUPER ADMIN IN PRODUCTION';

const MONGOOSE_OPTIONS = Object.freeze({
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 20000,
  maxPoolSize: 2,
  retryWrites: true,
  autoIndex: false,
  appName: 'MevaPur-Initial-Admin-Bootstrap'
});

const TRANSACTION_OPTIONS = Object.freeze({
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  maxCommitTimeMS: 10000
});

class InitialAdminBootstrapRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'InitialAdminBootstrapRefusal';
    this.code = code;
  }
}

const refuse = (code) => {
  throw new InitialAdminBootstrapRefusal(code);
};

const requireEnvironmentValue = (environment, name) => {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    refuse(`BOOTSTRAP_${name}_REQUIRED`);
  }
  return value;
};

const parseQueryParameters = (query) => {
  const parameters = new Map();
  try {
    for (const pair of query.split('&').filter(Boolean)) {
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
    refuse('BOOTSTRAP_MONGODB_URI_FORMAT_INVALID');
  }
  return parameters;
};

function parseMongoTarget(uri, {
  expectedDatabase,
  expectedHost,
  expectedReplicaSet
}) {
  if (typeof uri !== 'string' || uri.trim() !== uri) {
    refuse('BOOTSTRAP_MONGODB_URI_FORMAT_INVALID');
  }

  const match = /^(mongodb(?:\+srv)?):\/\/([^\/?#]+)\/([^?#]*)(?:\?([^#]*))?$/i
    .exec(uri);
  if (!match) refuse('BOOTSTRAP_MONGODB_URI_FORMAT_INVALID');

  const scheme = match[1].toLowerCase();
  const authority = match[2];
  const credentialSeparator = authority.lastIndexOf('@');
  if (credentialSeparator <= 0 || credentialSeparator === authority.length - 1) {
    refuse('BOOTSTRAP_DATABASE_CREDENTIALS_REQUIRED');
  }

  const credentials = authority.slice(0, credentialSeparator);
  const passwordSeparator = credentials.indexOf(':');
  if (
    passwordSeparator <= 0 ||
    passwordSeparator === credentials.length - 1
  ) {
    refuse('BOOTSTRAP_DATABASE_CREDENTIALS_REQUIRED');
  }

  const host = authority.slice(credentialSeparator + 1).toLowerCase();
  if (host !== expectedHost.toLowerCase()) {
    refuse('BOOTSTRAP_DATABASE_HOST_MISMATCH');
  }

  let database;
  try {
    database = decodeURIComponent(match[3]);
  } catch {
    refuse('BOOTSTRAP_MONGODB_URI_FORMAT_INVALID');
  }
  if (!database || database.includes('/') || database.includes('\\')) {
    refuse('BOOTSTRAP_EXPLICIT_DATABASE_REQUIRED');
  }
  if (database !== expectedDatabase) {
    refuse('BOOTSTRAP_DATABASE_NAME_MISMATCH');
  }

  const parameters = parseQueryParameters(match[4] || '');
  const tlsValues = [
    ...(parameters.get('tls') || []),
    ...(parameters.get('ssl') || [])
  ].map((value) => value.toLowerCase());
  if (
    tlsValues.length > 1 ||
    tlsValues.some((value) => value !== 'true') ||
    (scheme === 'mongodb' && tlsValues.length !== 1)
  ) {
    refuse('BOOTSTRAP_DATABASE_TLS_REQUIRED');
  }

  const directConnectionValues = parameters.get('directconnection') || [];
  if (
    directConnectionValues.length > 1 ||
    directConnectionValues.some((value) => value.toLowerCase() === 'true')
  ) {
    refuse('BOOTSTRAP_REPLICA_SET_REQUIRED');
  }

  const replicaSetValues = parameters.get('replicaset') || [];
  if (
    replicaSetValues.length > 1 ||
    (scheme === 'mongodb' && replicaSetValues.length !== 1) ||
    (replicaSetValues.length === 1 &&
      replicaSetValues[0] !== expectedReplicaSet)
  ) {
    refuse('BOOTSTRAP_REPLICA_SET_MISMATCH');
  }

  return Object.freeze({
    database,
    expectedHost,
    replicaSet: expectedReplicaSet,
    tlsEnabled: true
  });
}

function validateBootstrapEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== 'production') {
    refuse('BOOTSTRAP_NODE_ENV_PRODUCTION_REQUIRED');
  }
  if (environment.APP_ENV !== 'production') {
    refuse('BOOTSTRAP_APP_ENV_PRODUCTION_REQUIRED');
  }

  const uri = requireEnvironmentValue(environment, 'MONGODB_URI');
  const expectedDatabase = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_EXPECTED_DATABASE'
  );
  const expectedHost = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_EXPECTED_HOST'
  );
  const expectedReplicaSet = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_EXPECTED_REPLICA_SET'
  );
  const fullName = requireEnvironmentValue(environment, 'INITIAL_ADMIN_NAME');
  const email = requireEnvironmentValue(environment, 'INITIAL_ADMIN_EMAIL');
  const password = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_PASSWORD'
  );
  const confirmation = environment.INITIAL_ADMIN_CONFIRMATION;

  if (confirmation !== PRODUCTION_CONFIRMATION_PHRASE) {
    refuse('BOOTSTRAP_PRODUCTION_CONFIRMATION_REQUIRED');
  }
  if (
    expectedDatabase.trim() !== expectedDatabase ||
    expectedHost.trim() !== expectedHost ||
    expectedReplicaSet.trim() !== expectedReplicaSet ||
    !/^[A-Za-z0-9._-]+$/.test(expectedDatabase) ||
    !/^[A-Za-z0-9._,:\[\]-]+$/.test(expectedHost) ||
    !/^[A-Za-z0-9._-]+$/.test(expectedReplicaSet)
  ) {
    refuse('BOOTSTRAP_DATABASE_IDENTITY_INVALID');
  }

  const passwordResult = passwordSchema.safeParse(password);
  if (!passwordResult.success) {
    refuse('BOOTSTRAP_PASSWORD_POLICY_REJECTED');
  }

  const registrationResult = registerSchema.safeParse({
    fullName,
    email,
    password
  });
  if (!registrationResult.success) {
    refuse('BOOTSTRAP_ACCOUNT_INPUT_INVALID');
  }

  const target = parseMongoTarget(uri, {
    expectedDatabase,
    expectedHost,
    expectedReplicaSet
  });

  return Object.freeze({
    uri,
    target,
    fullName: registrationResult.data.fullName,
    email: registrationResult.data.email,
    password: registrationResult.data.password
  });
}

async function verifyConnectedDatabase(connection, target) {
  if (!connection || connection.name !== target.database || !connection.db) {
    refuse('BOOTSTRAP_CONNECTED_DATABASE_MISMATCH');
  }

  let ping;
  let hello;
  try {
    ping = await connection.db.command({ ping: 1 });
    hello = await connection.db.command({ hello: 1 });
  } catch {
    refuse('BOOTSTRAP_TOPOLOGY_VERIFICATION_FAILED');
  }

  const client = connection.getClient();
  const topologyType = client?.topology?.description?.type;
  const hasPrimary =
    topologyType === 'ReplicaSetWithPrimary' &&
    Boolean(hello.isWritablePrimary ?? hello.ismaster);
  const replicaSetMatches = hello.setName === target.replicaSet;
  const supportsTransactions =
    Number.isInteger(hello.logicalSessionTimeoutMinutes) &&
    hello.logicalSessionTimeoutMinutes > 0 &&
    Number.isInteger(hello.maxWireVersion) &&
    hello.maxWireVersion >= 7;

  if (
    ping.ok !== 1 ||
    !hasPrimary ||
    !replicaSetMatches ||
    !supportsTransactions
  ) {
    refuse('BOOTSTRAP_TRANSACTION_CAPABLE_REPLICA_SET_REQUIRED');
  }
}

function createMongoStore({
  UserModel = User,
  BootstrapStateModel = BootstrapState
} = {}) {
  return {
    findMarker: (session) => BootstrapStateModel.findById(
      BOOTSTRAP_MARKER_ID,
      null,
      { session }
    ).lean(),
    findUserById: (id, session) => UserModel.findById(
      id,
      null,
      { session }
    ).lean(),
    findPrivilegedUser: (session) => UserModel.findOne(
      { role: { $in: ['admin', 'super_admin'] } },
      null,
      { session }
    ).lean(),
    findUserByEmail: (email, session) => UserModel.findOne(
      { email },
      null,
      { session }
    ).lean(),
    createUser: async (data, session) => {
      const user = new UserModel(data);
      await user.save({ session });
      return user;
    },
    createMarker: async (userId, session) => {
      const marker = new BootstrapStateModel({
        _id: BOOTSTRAP_MARKER_ID,
        user: userId,
        version: 1
      });
      await marker.save({ session });
      return marker;
    }
  };
}

async function provisionInitialAdmin({ config, store, session }) {
  const marker = await store.findMarker(session);
  if (marker) {
    const markedUser = await store.findUserById(marker.user, session);
    if (
      marker.version === 1 &&
      markedUser &&
      markedUser.fullName === config.fullName &&
      markedUser.email === config.email &&
      markedUser.role === INITIAL_ADMIN_ROLE &&
      markedUser.isVerified === true &&
      markedUser.isBlocked !== true &&
      markedUser.isDeleted !== true
    ) {
      return Object.freeze({
        status: 'ALREADY_PROVISIONED',
        created: false
      });
    }
    refuse('BOOTSTRAP_MARKER_INCONSISTENT');
  }

  if (await store.findPrivilegedUser(session)) {
    refuse('BOOTSTRAP_PRIVILEGED_ACCOUNT_EXISTS');
  }
  if (await store.findUserByEmail(config.email, session)) {
    refuse('BOOTSTRAP_ACCOUNT_EMAIL_EXISTS');
  }

  const user = await store.createUser({
    fullName: config.fullName,
    email: config.email,
    password: config.password,
    role: INITIAL_ADMIN_ROLE,
    isVerified: true,
    isBlocked: false,
    isDeleted: false
  }, session);
  await store.createMarker(user._id, session);

  return Object.freeze({ status: 'CREATED', created: true });
}

const defaultDependencies = Object.freeze({
  connectDatabase: (uri) => mongoose.connect(uri, MONGOOSE_OPTIONS),
  disconnectDatabase: () => mongoose.disconnect(),
  createStore: () => createMongoStore(),
  logger: Object.freeze({
    info: (message, metadata) => {
      process.stdout.write(`${JSON.stringify({ message, ...metadata })}\n`);
    }
  })
});

async function runInitialAdminBootstrap({
  environment = process.env,
  dependencies = defaultDependencies
} = {}) {
  const config = validateBootstrapEnvironment(environment);
  let connectionAttempted = false;

  try {
    connectionAttempted = true;
    const connected = await dependencies.connectDatabase(config.uri);
    const connection = connected?.connection || connected;
    await verifyConnectedDatabase(connection, config.target);
    const store = dependencies.createStore();
    let result;
    await connection.transaction(async (session) => {
      result = await provisionInitialAdmin({ config, store, session });
    }, TRANSACTION_OPTIONS);

    dependencies.logger.info('Initial admin bootstrap completed', {
      code: result.created
        ? 'BOOTSTRAP_INITIAL_SUPER_ADMIN_CREATED'
        : 'BOOTSTRAP_ALREADY_PROVISIONED'
    });
    return result;
  } catch (error) {
    if (error instanceof InitialAdminBootstrapRefusal) throw error;
    refuse('BOOTSTRAP_EXECUTION_FAILED');
  } finally {
    if (connectionAttempted) {
      await dependencies.disconnectDatabase();
    }
  }
}

async function main() {
  require('dotenv').config();
  try {
    const result = await runInitialAdminBootstrap();
    process.stdout.write(`${JSON.stringify({
      status: 'PASS',
      outcome: result.status,
      privateValueDisplayed: false
    })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: 'FAIL',
      errorCode: error instanceof InitialAdminBootstrapRefusal
        ? error.code
        : 'BOOTSTRAP_UNEXPECTED_FAILURE',
      privateValueDisplayed: false
    })}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  BOOTSTRAP_MARKER_ID,
  INITIAL_ADMIN_ROLE,
  MONGOOSE_OPTIONS,
  PRODUCTION_CONFIRMATION_PHRASE,
  TRANSACTION_OPTIONS,
  InitialAdminBootstrapRefusal,
  createMongoStore,
  parseMongoTarget,
  provisionInitialAdmin,
  runInitialAdminBootstrap,
  validateBootstrapEnvironment,
  verifyConnectedDatabase
};
