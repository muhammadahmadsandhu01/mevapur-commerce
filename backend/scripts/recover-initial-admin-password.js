#!/usr/bin/env node
'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const BootstrapState = require('../models/BootstrapState');
const passwordSchema = require('../validators/passwordValidator');
const { loginSchema } = require('../validators/authValidator');
const {
  BOOTSTRAP_MARKER_ID,
  INITIAL_ADMIN_ROLE,
  MONGOOSE_OPTIONS,
  TRANSACTION_OPTIONS,
  InitialAdminBootstrapRefusal,
  parseMongoTarget,
  verifyConnectedDatabase
} = require('./create-admin');

const PRODUCTION_CONFIRMATION_PHRASE =
  'RESET INITIAL SUPER ADMIN PASSWORD IN PRODUCTION';
const RECOVERY_MARKER_ID = 'initial-super-admin-password-recovery-v1';
const SESSION_REVOCATION_REASON = 'INITIAL_ADMIN_PASSWORD_RECOVERY';

class InitialAdminPasswordRecoveryRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'InitialAdminPasswordRecoveryRefusal';
    this.code = code;
  }
}

const refuse = (code) => {
  throw new InitialAdminPasswordRecoveryRefusal(code);
};

const requireEnvironmentValue = (environment, name) => {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    refuse(`RECOVERY_${name}_REQUIRED`);
  }
  return value;
};

const mapBootstrapRefusal = (error) => {
  if (error instanceof InitialAdminBootstrapRefusal) {
    refuse(error.code.replace(/^BOOTSTRAP_/, 'RECOVERY_'));
  }
  throw error;
};

function validateRecoveryEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== 'production') {
    refuse('RECOVERY_NODE_ENV_PRODUCTION_REQUIRED');
  }
  if (environment.APP_ENV !== 'production') {
    refuse('RECOVERY_APP_ENV_PRODUCTION_REQUIRED');
  }

  const uri = requireEnvironmentValue(environment, 'MONGODB_URI');
  const expectedDatabase = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_RESET_EXPECTED_DATABASE'
  );
  const expectedHost = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_RESET_EXPECTED_HOST'
  );
  const expectedReplicaSet = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_RESET_EXPECTED_REPLICA_SET'
  );
  const email = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_RESET_EMAIL'
  );
  const password = requireEnvironmentValue(
    environment,
    'INITIAL_ADMIN_RESET_PASSWORD'
  );

  if (
    environment.INITIAL_ADMIN_RESET_CONFIRMATION !==
      PRODUCTION_CONFIRMATION_PHRASE
  ) {
    refuse('RECOVERY_PRODUCTION_CONFIRMATION_REQUIRED');
  }
  if (
    expectedDatabase.trim() !== expectedDatabase ||
    expectedHost.trim() !== expectedHost ||
    expectedReplicaSet.trim() !== expectedReplicaSet ||
    !/^[A-Za-z0-9._-]+$/.test(expectedDatabase) ||
    !/^[A-Za-z0-9._,:\[\]-]+$/.test(expectedHost) ||
    !/^[A-Za-z0-9._-]+$/.test(expectedReplicaSet)
  ) {
    refuse('RECOVERY_DATABASE_IDENTITY_INVALID');
  }

  const emailResult = loginSchema.shape.email.safeParse(email);
  if (!emailResult.success || emailResult.data !== email) {
    refuse('RECOVERY_ACCOUNT_EMAIL_INVALID');
  }

  const passwordResult = passwordSchema.safeParse(password);
  if (!passwordResult.success) {
    refuse('RECOVERY_PASSWORD_POLICY_REJECTED');
  }

  let target;
  try {
    target = parseMongoTarget(uri, {
      expectedDatabase,
      expectedHost,
      expectedReplicaSet
    });
  } catch (error) {
    mapBootstrapRefusal(error);
  }

  return Object.freeze({
    uri,
    target,
    email,
    password: passwordResult.data
  });
}

async function verifyRecoveryDatabase(connection, target) {
  try {
    await verifyConnectedDatabase(connection, target);
  } catch (error) {
    mapBootstrapRefusal(error);
  }
}

function createMongoStore({
  UserModel = User,
  SessionModel = Session,
  BootstrapStateModel = BootstrapState
} = {}) {
  return {
    findMarker: (session) => BootstrapStateModel.findById(
      BOOTSTRAP_MARKER_ID
    ).session(session).lean(),
    findRecoveryMarker: (session) => BootstrapStateModel.findById(
      RECOVERY_MARKER_ID
    ).session(session).lean(),
    findMarkedUser: (userId, session) => UserModel.findById(userId)
      .select(
        '+password +loginAttempts +lockUntil +tokenVersion ' +
        '+resetPasswordTokenHash +resetPasswordExpiresAt'
      )
      .session(session),
    saveUser: (user, session) => user.save({ session }),
    createRecoveryMarker: async (userId, session) => {
      const marker = new BootstrapStateModel({
        _id: RECOVERY_MARKER_ID,
        user: userId,
        version: 1
      });
      await marker.save({ session });
      return marker;
    },
    revokeActiveSessions: (userId, session) => SessionModel.updateMany(
      { user: userId, isActive: true },
      {
        $set: {
          isActive: false,
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: SESSION_REVOCATION_REASON
        }
      },
      { session }
    )
  };
}

async function recoverInitialAdminPassword({ config, store, session }) {
  const marker = await store.findMarker(session);
  if (!marker) refuse('RECOVERY_MARKER_REQUIRED');
  if (marker.version !== 1 || !marker.user) {
    refuse('RECOVERY_MARKER_INCONSISTENT');
  }

  const user = await store.findMarkedUser(marker.user, session);
  if (!user || String(user._id) !== String(marker.user)) {
    refuse('RECOVERY_MARKER_INCONSISTENT');
  }
  if (user.email !== config.email) {
    refuse('RECOVERY_MARKED_EMAIL_MISMATCH');
  }
  if (user.role !== INITIAL_ADMIN_ROLE) {
    refuse('RECOVERY_MARKED_ROLE_MISMATCH');
  }
  if (user.isBlocked === true) {
    refuse('RECOVERY_MARKED_ACCOUNT_BLOCKED');
  }
  if (user.isDeleted === true) {
    refuse('RECOVERY_MARKED_ACCOUNT_DELETED');
  }
  if (user.isVerified !== true) {
    refuse('RECOVERY_MARKED_ACCOUNT_UNVERIFIED');
  }

  const tokenVersion = Number(user.tokenVersion || 0);
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    refuse('RECOVERY_MARKED_ACCOUNT_STATE_INVALID');
  }

  const recoveryMarker = await store.findRecoveryMarker(session);
  const passwordAlreadyActive = await user.matchPassword(config.password);
  if (recoveryMarker) {
    if (
      recoveryMarker.version !== 1 ||
      String(recoveryMarker.user) !== String(user._id)
    ) {
      refuse('RECOVERY_COMPLETION_MARKER_INCONSISTENT');
    }
    if (!passwordAlreadyActive) {
      refuse('RECOVERY_ALREADY_COMPLETED');
    }

    const revocation = await store.revokeActiveSessions(user._id, session);
    return Object.freeze({
      status: 'ALREADY_RESET',
      changed: false,
      sessionsRevoked: Number(revocation?.modifiedCount || 0)
    });
  }

  user.password = config.password;
  user.loginAttempts = 0;
  user.lockUntil = null;
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  user.tokenVersion = tokenVersion + 1;
  await store.saveUser(user, session);
  const revocation = await store.revokeActiveSessions(user._id, session);
  await store.createRecoveryMarker(user._id, session);
  return Object.freeze({
    status: 'RESET',
    changed: true,
    sessionsRevoked: Number(revocation?.modifiedCount || 0)
  });
}

const defaultDependencies = Object.freeze({
  connectDatabase: (uri) => mongoose.connect(uri, {
    ...MONGOOSE_OPTIONS,
    appName: 'MevaPur-Initial-Admin-Password-Recovery'
  }),
  disconnectDatabase: () => mongoose.disconnect(),
  createStore: () => createMongoStore(),
  logger: Object.freeze({
    info: (message, metadata) => {
      process.stdout.write(`${JSON.stringify({ message, ...metadata })}\n`);
    }
  })
});

async function runInitialAdminPasswordRecovery({
  environment = process.env,
  dependencies = defaultDependencies
} = {}) {
  const config = validateRecoveryEnvironment(environment);
  let connectionAttempted = false;

  try {
    connectionAttempted = true;
    const connected = await dependencies.connectDatabase(config.uri);
    const connection = connected?.connection || connected;
    await verifyRecoveryDatabase(connection, config.target);
    const store = dependencies.createStore();
    let result;
    await connection.transaction(async (session) => {
      result = await recoverInitialAdminPassword({ config, store, session });
    }, TRANSACTION_OPTIONS);

    dependencies.logger.info('Initial admin password recovery completed', {
      code: result.changed
        ? 'RECOVERY_INITIAL_SUPER_ADMIN_PASSWORD_RESET'
        : 'RECOVERY_ALREADY_RESET'
    });
    return result;
  } catch (error) {
    if (error instanceof InitialAdminPasswordRecoveryRefusal) throw error;
    refuse('RECOVERY_EXECUTION_FAILED');
  } finally {
    if (connectionAttempted) {
      await dependencies.disconnectDatabase();
    }
  }
}

async function main() {
  require('dotenv').config();
  try {
    const result = await runInitialAdminPasswordRecovery();
    process.stdout.write(`${JSON.stringify({
      status: 'PASS',
      outcome: result.status,
      privateValueDisplayed: false
    })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: 'FAIL',
      errorCode: error instanceof InitialAdminPasswordRecoveryRefusal
        ? error.code
        : 'RECOVERY_UNEXPECTED_FAILURE',
      privateValueDisplayed: false
    })}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  PRODUCTION_CONFIRMATION_PHRASE,
  RECOVERY_MARKER_ID,
  SESSION_REVOCATION_REASON,
  InitialAdminPasswordRecoveryRefusal,
  createMongoStore,
  recoverInitialAdminPassword,
  runInitialAdminPasswordRecovery,
  validateRecoveryEnvironment,
  verifyRecoveryDatabase
};
