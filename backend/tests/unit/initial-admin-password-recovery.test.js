const path = require('path');

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../scripts/recover-initial-admin-password.js'
);
const CONFIRMATION = 'RESET INITIAL SUPER ADMIN PASSWORD IN PRODUCTION';
const NEW_PASSWORD = 'Quartz!7Meadow';
const INITIAL_PASSWORD = 'Violet!9Mountain';
const MARKED_EMAIL = 'initial-admin@example.test';
const SENSITIVE_VALUES = [
  MARKED_EMAIL,
  NEW_PASSWORD,
  'recovery-user',
  'recovery-pass',
  'cluster-a.invalid:27017,cluster-b.invalid:27017',
  'mevapur_production',
  'production-rs',
  CONFIRMATION
];

const validEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  APP_ENV: 'production',
  MONGODB_URI:
    'mongodb://recovery-user:recovery-pass@' +
    'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
    'mevapur_production?tls=true&replicaSet=production-rs&retryWrites=true',
  INITIAL_ADMIN_RESET_EXPECTED_DATABASE: 'mevapur_production',
  INITIAL_ADMIN_RESET_EXPECTED_HOST:
    'cluster-a.invalid:27017,cluster-b.invalid:27017',
  INITIAL_ADMIN_RESET_EXPECTED_REPLICA_SET: 'production-rs',
  INITIAL_ADMIN_RESET_EMAIL: MARKED_EMAIL,
  INITIAL_ADMIN_RESET_PASSWORD: NEW_PASSWORD,
  INITIAL_ADMIN_RESET_CONFIRMATION: CONFIRMATION,
  ...overrides
});

const createMemoryStore = ({ marker, recoveryMarker = null, user } = {}) => {
  const state = {
    marker: marker === undefined
      ? { _id: 'initial-super-admin-v1', user: 'marked-user', version: 1 }
      : marker,
    user: user === undefined
      ? {
          _id: 'marked-user',
          email: MARKED_EMAIL,
          role: 'super_admin',
          isVerified: true,
          isBlocked: false,
          isDeleted: false,
          loginAttempts: 4,
          lockUntil: new Date(Date.now() + 60000),
          tokenVersion: 0,
          resetPasswordTokenHash: 'reset-hash',
          resetPasswordExpiresAt: new Date(Date.now() + 60000),
          matchPassword: jest.fn().mockResolvedValue(false)
        }
      : user,
    recoveryMarker,
    saveCalls: 0,
    revokeCalls: 0,
    createRecoveryMarkerCalls: 0
  };

  return {
    state,
    async findMarker() {
      return state.marker;
    },
    async findMarkedUser() {
      return state.user;
    },
    async findRecoveryMarker() {
      return state.recoveryMarker;
    },
    async saveUser() {
      state.saveCalls += 1;
      return state.user;
    },
    async createRecoveryMarker(userId) {
      state.createRecoveryMarkerCalls += 1;
      state.recoveryMarker = {
        _id: 'initial-super-admin-password-recovery-v1',
        user: userId,
        version: 1
      };
      return state.recoveryMarker;
    },
    async revokeActiveSessions() {
      state.revokeCalls += 1;
      return { modifiedCount: 2 };
    }
  };
};

const createVerifiedConnection = () => ({
  name: 'mevapur_production',
  db: {
    command: jest.fn(async (command) => command.ping
      ? { ok: 1 }
      : {
          ok: 1,
          isWritablePrimary: true,
          setName: 'production-rs',
          logicalSessionTimeoutMinutes: 30,
          maxWireVersion: 25
        })
  },
  getClient: () => ({
    topology: { description: { type: 'ReplicaSetWithPrimary' } }
  }),
  transaction: jest.fn(async (callback) => callback({ id: 'test-session' }))
});

describe('initial Super Admin password recovery', () => {
  test('is inert when imported', () => {
    const mongoose = require('mongoose');
    const connect = jest.spyOn(mongoose, 'connect');

    require(SCRIPT_PATH);

    expect(connect).not.toHaveBeenCalled();
  });

  test.each([
    ['NODE_ENV', { NODE_ENV: 'test' }, 'RECOVERY_NODE_ENV_PRODUCTION_REQUIRED'],
    ['APP_ENV', { APP_ENV: 'staging' }, 'RECOVERY_APP_ENV_PRODUCTION_REQUIRED'],
    ['confirmation', { INITIAL_ADMIN_RESET_CONFIRMATION: '' }, 'RECOVERY_PRODUCTION_CONFIRMATION_REQUIRED'],
    ['database', {
      MONGODB_URI:
        'mongodb://recovery-user:recovery-pass@' +
        'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
        'wrong?tls=true&replicaSet=production-rs'
    }, 'RECOVERY_DATABASE_NAME_MISMATCH'],
    ['host', {
      MONGODB_URI:
        'mongodb://recovery-user:recovery-pass@other.invalid:27017/' +
        'mevapur_production?tls=true&replicaSet=production-rs'
    }, 'RECOVERY_DATABASE_HOST_MISMATCH'],
    ['replica set', {
      MONGODB_URI:
        'mongodb://recovery-user:recovery-pass@' +
        'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
        'mevapur_production?tls=true&replicaSet=wrong-rs'
    }, 'RECOVERY_REPLICA_SET_MISMATCH'],
    ['TLS', {
      MONGODB_URI:
        'mongodb://recovery-user:recovery-pass@' +
        'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
        'mevapur_production?replicaSet=production-rs'
    }, 'RECOVERY_DATABASE_TLS_REQUIRED'],
    ['password policy', {
      INITIAL_ADMIN_RESET_PASSWORD: 'weak-password'
    }, 'RECOVERY_PASSWORD_POLICY_REJECTED']
  ])('rejects invalid %s guards', (_label, overrides, code) => {
    const { validateRecoveryEnvironment } = require(SCRIPT_PATH);
    expect(() => validateRecoveryEnvironment(validEnvironment(overrides)))
      .toThrow(expect.objectContaining({ code }));
  });

  test.each([
    ['missing marker', { marker: null }, 'RECOVERY_MARKER_REQUIRED'],
    ['inconsistent marker', {
      marker: { _id: 'initial-super-admin-v1', user: null, version: 1 }
    }, 'RECOVERY_MARKER_INCONSISTENT'],
    ['missing marked user', { user: null }, 'RECOVERY_MARKER_INCONSISTENT'],
    ['wrong email', {
      user: {
        _id: 'marked-user',
        email: 'different@example.test',
        role: 'super_admin',
        isVerified: true,
        matchPassword: jest.fn()
      }
    }, 'RECOVERY_MARKED_EMAIL_MISMATCH'],
    ['wrong role', {
      user: {
        _id: 'marked-user',
        email: MARKED_EMAIL,
        role: 'admin',
        isVerified: true,
        matchPassword: jest.fn()
      }
    }, 'RECOVERY_MARKED_ROLE_MISMATCH'],
    ['blocked user', {
      user: {
        _id: 'marked-user',
        email: MARKED_EMAIL,
        role: 'super_admin',
        isVerified: true,
        isBlocked: true,
        matchPassword: jest.fn()
      }
    }, 'RECOVERY_MARKED_ACCOUNT_BLOCKED'],
    ['deleted user', {
      user: {
        _id: 'marked-user',
        email: MARKED_EMAIL,
        role: 'super_admin',
        isVerified: true,
        isDeleted: true,
        matchPassword: jest.fn()
      }
    }, 'RECOVERY_MARKED_ACCOUNT_DELETED'],
    ['unverified user', {
      user: {
        _id: 'marked-user',
        email: MARKED_EMAIL,
        role: 'super_admin',
        isVerified: false,
        matchPassword: jest.fn()
      }
    }, 'RECOVERY_MARKED_ACCOUNT_UNVERIFIED']
  ])('refuses a %s', async (_label, storeOptions, code) => {
    const {
      recoverInitialAdminPassword,
      validateRecoveryEnvironment
    } = require(SCRIPT_PATH);
    const store = createMemoryStore(storeOptions);

    await expect(recoverInitialAdminPassword({
      config: validateRecoveryEnvironment(validEnvironment()),
      store,
      session: {}
    })).rejects.toMatchObject({ code });
    expect(store.state.saveCalls).toBe(0);
    expect(store.state.revokeCalls).toBe(0);
    expect(store.state.createRecoveryMarkerCalls).toBe(0);
  });

  test('requires the exact email stored on the marked account', async () => {
    const {
      recoverInitialAdminPassword,
      validateRecoveryEnvironment
    } = require(SCRIPT_PATH);
    const store = createMemoryStore();

    await expect(recoverInitialAdminPassword({
      config: validateRecoveryEnvironment(validEnvironment({
        INITIAL_ADMIN_RESET_EMAIL: 'different@example.test'
      })),
      store,
      session: {}
    })).rejects.toMatchObject({ code: 'RECOVERY_MARKED_EMAIL_MISMATCH' });
    expect(store.state.saveCalls).toBe(0);
    expect(store.state.revokeCalls).toBe(0);
    expect(store.state.createRecoveryMarkerCalls).toBe(0);
  });

  test('hashes the password, unlocks the account and revokes only its active sessions', async () => {
    const mongoose = require('mongoose');
    const BootstrapState = require('../../models/BootstrapState');
    const Session = require('../../models/Session');
    const User = require('../../models/User');
    const {
      createMongoStore,
      recoverInitialAdminPassword,
      validateRecoveryEnvironment
    } = require(SCRIPT_PATH);
    const user = await User.create({
      fullName: 'Initial Administrator',
      email: MARKED_EMAIL,
      password: INITIAL_PASSWORD,
      role: 'super_admin',
      isVerified: true,
      loginAttempts: 5,
      lockUntil: new Date(Date.now() + 60000),
      tokenVersion: 3,
      resetPasswordTokenHash: 'old-reset-hash',
      resetPasswordExpiresAt: new Date(Date.now() + 60000)
    });
    const otherUser = await global.createTestUser();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          loginAttempts: 5,
          lockUntil: new Date(Date.now() + 60000)
        }
      }
    );
    await BootstrapState.create({
      _id: 'initial-super-admin-v1',
      user: user._id,
      version: 1
    });
    const sessionData = (sessionUser, family, hashCharacter) => ({
      user: sessionUser,
      refreshTokenHash: hashCharacter.repeat(64),
      tokenFamilyId: family,
      isActive: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60000)
    });
    await Session.create([
      sessionData(user._id, 'admin-family', 'a'),
      sessionData(otherUser._id, 'other-family', 'b')
    ]);

    let result;
    await mongoose.connection.transaction(async (session) => {
      result = await recoverInitialAdminPassword({
        config: validateRecoveryEnvironment(validEnvironment()),
        store: createMongoStore(),
        session
      });
    });

    const saved = await User.findById(user._id).select(
      '+password +loginAttempts +lockUntil +tokenVersion ' +
      '+resetPasswordTokenHash +resetPasswordExpiresAt'
    );
    const adminSession = await Session.findOne({ user: user._id });
    const otherSession = await Session.findOne({ user: otherUser._id });
    const recoveryMarker = await BootstrapState.findById(
      'initial-super-admin-password-recovery-v1'
    );

    expect(result).toEqual({
      status: 'RESET',
      changed: true,
      sessionsRevoked: 1
    });
    expect(saved.password).not.toBe(NEW_PASSWORD);
    await expect(saved.matchPassword(NEW_PASSWORD)).resolves.toBe(true);
    await expect(saved.matchPassword(INITIAL_PASSWORD)).resolves.toBe(false);
    expect(saved).toMatchObject({
      loginAttempts: 0,
      lockUntil: null,
      tokenVersion: 4,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null
    });
    expect(adminSession).toMatchObject({
      isActive: false,
      isRevoked: true,
      revokedReason: 'INITIAL_ADMIN_PASSWORD_RECOVERY'
    });
    expect(otherSession).toMatchObject({
      isActive: true,
      isRevoked: false
    });
    expect(String(recoveryMarker.user)).toBe(String(user._id));
    expect(recoveryMarker.version).toBe(1);
  });

  test('an exact retry is idempotent and does not rehash or increment tokenVersion', async () => {
    const mongoose = require('mongoose');
    const BootstrapState = require('../../models/BootstrapState');
    const User = require('../../models/User');
    const {
      createMongoStore,
      recoverInitialAdminPassword,
      validateRecoveryEnvironment
    } = require(SCRIPT_PATH);
    const user = await User.create({
      fullName: 'Initial Administrator',
      email: MARKED_EMAIL,
      password: INITIAL_PASSWORD,
      role: 'super_admin',
      isVerified: true
    });
    await BootstrapState.create({
      _id: 'initial-super-admin-v1',
      user: user._id,
      version: 1
    });
    const config = validateRecoveryEnvironment(validEnvironment());
    const runRecovery = async () => {
      let result;
      await mongoose.connection.transaction(async (session) => {
        result = await recoverInitialAdminPassword({
          config,
          store: createMongoStore(),
          session
        });
      });
      return result;
    };

    await expect(runRecovery()).resolves.toMatchObject({
      status: 'RESET',
      changed: true
    });
    const afterFirst = await User.findById(user._id)
      .select('+password +tokenVersion');

    await expect(runRecovery()).resolves.toEqual({
      status: 'ALREADY_RESET',
      changed: false,
      sessionsRevoked: 0
    });
    const afterRetry = await User.findById(user._id)
      .select('+password +tokenVersion');

    expect(afterRetry.password).toBe(afterFirst.password);
    expect(afterRetry.tokenVersion).toBe(afterFirst.tokenVersion);

    await expect(mongoose.connection.transaction(async (session) => (
      recoverInitialAdminPassword({
        config: validateRecoveryEnvironment(validEnvironment({
          INITIAL_ADMIN_RESET_PASSWORD: 'Cobalt!8Forest'
        })),
        store: createMongoStore(),
        session
      })
    ))).rejects.toMatchObject({ code: 'RECOVERY_ALREADY_COMPLETED' });
    const afterDifferentPassword = await User.findById(user._id)
      .select('+password +tokenVersion');
    expect(afterDifferentPassword.password).toBe(afterFirst.password);
    expect(afterDifferentPassword.tokenVersion).toBe(afterFirst.tokenVersion);
  });

  test('uses one transaction and logs no private values', async () => {
    const { runInitialAdminPasswordRecovery } = require(SCRIPT_PATH);
    const store = createMemoryStore();
    const logger = { info: jest.fn() };
    const disconnectDatabase = jest.fn().mockResolvedValue(undefined);
    const connection = createVerifiedConnection();

    await expect(runInitialAdminPasswordRecovery({
      environment: validEnvironment(),
      dependencies: {
        connectDatabase: jest.fn().mockResolvedValue({ connection }),
        disconnectDatabase,
        createStore: () => store,
        logger
      }
    })).resolves.toEqual({
      status: 'RESET',
      changed: true,
      sessionsRevoked: 2
    });

    expect(connection.transaction).toHaveBeenCalledTimes(1);
    expect(disconnectDatabase).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logger.info.mock.calls);
    for (const value of SENSITIVE_VALUES) {
      expect(logged).not.toContain(value);
    }
  });
});
