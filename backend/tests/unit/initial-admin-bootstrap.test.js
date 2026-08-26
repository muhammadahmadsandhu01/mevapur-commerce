const path = require('path');

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/create-admin.js');
const CONFIRMATION = 'CREATE INITIAL SUPER ADMIN IN PRODUCTION';
const SENSITIVE_VALUES = [
  'Bootstrap Operator',
  'initial-admin@example.test',
  'Quartz!7Meadow',
  'bootstrap-user',
  'bootstrap-pass',
  'cluster-a.invalid:27017,cluster-b.invalid:27017',
  'mevapur_production',
  'production-rs',
  CONFIRMATION
];

const validEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  APP_ENV: 'production',
  MONGODB_URI:
    'mongodb://bootstrap-user:bootstrap-pass@' +
    'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
    'mevapur_production?tls=true&replicaSet=production-rs&retryWrites=true',
  INITIAL_ADMIN_EXPECTED_DATABASE: 'mevapur_production',
  INITIAL_ADMIN_EXPECTED_HOST:
    'cluster-a.invalid:27017,cluster-b.invalid:27017',
  INITIAL_ADMIN_EXPECTED_REPLICA_SET: 'production-rs',
  INITIAL_ADMIN_NAME: 'Bootstrap Operator',
  INITIAL_ADMIN_EMAIL: 'initial-admin@example.test',
  INITIAL_ADMIN_PASSWORD: 'Quartz!7Meadow',
  INITIAL_ADMIN_CONFIRMATION: CONFIRMATION,
  ...overrides
});

const createMemoryStore = ({ users = [], marker = null } = {}) => {
  const state = {
    users: users.map((user) => ({ ...user })),
    marker: marker ? { ...marker } : null,
    createUserCalls: 0,
    createMarkerCalls: 0
  };
  return {
    state,
    async findMarker() {
      return state.marker;
    },
    async findUserById(id) {
      return state.users.find((user) => String(user._id) === String(id)) || null;
    },
    async findPrivilegedUser() {
      return state.users.find(
        (user) => ['admin', 'super_admin'].includes(user.role)
      ) || null;
    },
    async findUserByEmail(email) {
      return state.users.find((user) => user.email === email) || null;
    },
    async createUser(data) {
      state.createUserCalls += 1;
      const user = { _id: `user-${state.createUserCalls}`, ...data };
      state.users.push(user);
      return user;
    },
    async createMarker(userId) {
      state.createMarkerCalls += 1;
      state.marker = {
        _id: 'initial-super-admin-v1',
        user: userId,
        version: 1
      };
      return state.marker;
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

describe('initial Super Admin bootstrap', () => {
  test('is inert when imported', () => {
    const mongoose = require('mongoose');
    const connect = jest.spyOn(mongoose, 'connect');

    require(SCRIPT_PATH);

    expect(connect).not.toHaveBeenCalled();
  });

  test('missing required variables fail closed', () => {
    const { validateBootstrapEnvironment } = require(SCRIPT_PATH);
    expect(() => validateBootstrapEnvironment({
      NODE_ENV: 'production',
      APP_ENV: 'production'
    })).toThrow(expect.objectContaining({
      code: 'BOOTSTRAP_MONGODB_URI_REQUIRED'
    }));
  });

  test('a weak password is rejected by the active authentication policy', () => {
    const { validateBootstrapEnvironment } = require(SCRIPT_PATH);
    expect(() => validateBootstrapEnvironment(validEnvironment({
      INITIAL_ADMIN_PASSWORD: 'weak-password'
    }))).toThrow(expect.objectContaining({
      code: 'BOOTSTRAP_PASSWORD_POLICY_REJECTED'
    }));
  });

  test('the wrong database is rejected', () => {
    const { validateBootstrapEnvironment } = require(SCRIPT_PATH);
    expect(() => validateBootstrapEnvironment(validEnvironment({
      MONGODB_URI:
        'mongodb://bootstrap-user:bootstrap-pass@' +
        'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
        'wrong_database?tls=true&replicaSet=production-rs'
    }))).toThrow(expect.objectContaining({
      code: 'BOOTSTRAP_DATABASE_NAME_MISMATCH'
    }));
  });

  test('missing exact production confirmation is rejected', () => {
    const { validateBootstrapEnvironment } = require(SCRIPT_PATH);
    expect(() => validateBootstrapEnvironment(validEnvironment({
      INITIAL_ADMIN_CONFIRMATION: ''
    }))).toThrow(expect.objectContaining({
      code: 'BOOTSTRAP_PRODUCTION_CONFIRMATION_REQUIRED'
    }));
  });

  test.each([
    {
      label: 'TLS',
      uri:
        'mongodb://bootstrap-user:bootstrap-pass@' +
        'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
        'mevapur_production?replicaSet=production-rs',
      code: 'BOOTSTRAP_DATABASE_TLS_REQUIRED'
    },
    {
      label: 'replica set',
      uri:
        'mongodb://bootstrap-user:bootstrap-pass@' +
        'cluster-a.invalid:27017,cluster-b.invalid:27017/' +
        'mevapur_production?tls=true',
      code: 'BOOTSTRAP_REPLICA_SET_MISMATCH'
    }
  ])('missing $label requirements are rejected', ({ uri, code }) => {
    const { validateBootstrapEnvironment } = require(SCRIPT_PATH);
    expect(() => validateBootstrapEnvironment(validEnvironment({
      MONGODB_URI: uri
    }))).toThrow(expect.objectContaining({ code }));
  });

  test('an existing Admin prevents creation', async () => {
    const {
      provisionInitialAdmin,
      validateBootstrapEnvironment
    } = require(SCRIPT_PATH);
    const store = createMemoryStore({
      users: [{
        _id: 'existing-admin',
        email: 'other-admin@example.test',
        role: 'admin'
      }]
    });

    await expect(provisionInitialAdmin({
      config: validateBootstrapEnvironment(validEnvironment()),
      store,
      session: {}
    })).rejects.toMatchObject({
      code: 'BOOTSTRAP_PRIVILEGED_ACCOUNT_EXISTS'
    });
    expect(store.state.createUserCalls).toBe(0);
  });

  test('an existing customer is never promoted', async () => {
    const {
      provisionInitialAdmin,
      validateBootstrapEnvironment
    } = require(SCRIPT_PATH);
    const customer = {
      _id: 'existing-customer',
      email: 'initial-admin@example.test',
      role: 'customer'
    };
    const store = createMemoryStore({ users: [customer] });

    await expect(provisionInitialAdmin({
      config: validateBootstrapEnvironment(validEnvironment()),
      store,
      session: {}
    })).rejects.toMatchObject({
      code: 'BOOTSTRAP_ACCOUNT_EMAIL_EXISTS'
    });
    expect(store.state.users).toEqual([customer]);
    expect(store.state.createUserCalls).toBe(0);
  });

  test('creates exactly one verified user with the active Super Admin role', async () => {
    const {
      provisionInitialAdmin,
      validateBootstrapEnvironment
    } = require(SCRIPT_PATH);
    const store = createMemoryStore();

    await expect(provisionInitialAdmin({
      config: validateBootstrapEnvironment(validEnvironment()),
      store,
      session: {}
    })).resolves.toEqual({ status: 'CREATED', created: true });
    expect(store.state.users).toHaveLength(1);
    expect(store.state.users[0]).toMatchObject({
      role: 'super_admin',
      isVerified: true,
      isBlocked: false,
      isDeleted: false
    });
    expect(store.state.createMarkerCalls).toBe(1);
  });

  test('a retry is an exact idempotent no-op', async () => {
    const {
      provisionInitialAdmin,
      validateBootstrapEnvironment
    } = require(SCRIPT_PATH);
    const config = validateBootstrapEnvironment(validEnvironment());
    const store = createMemoryStore();

    await provisionInitialAdmin({ config, store, session: {} });
    await expect(provisionInitialAdmin({
      config,
      store,
      session: {}
    })).resolves.toEqual({
      status: 'ALREADY_PROVISIONED',
      created: false
    });
    expect(store.state.users).toHaveLength(1);
    expect(store.state.createUserCalls).toBe(1);
    expect(store.state.createMarkerCalls).toBe(1);
  });

  test('the real models hash the password and persist the role atomically', async () => {
    const mongoose = require('mongoose');
    const User = require('../../models/User');
    const {
      createMongoStore,
      provisionInitialAdmin,
      validateBootstrapEnvironment
    } = require(SCRIPT_PATH);
    const config = validateBootstrapEnvironment(validEnvironment());
    const store = createMongoStore();
    let result;

    await mongoose.connection.transaction(async (session) => {
      result = await provisionInitialAdmin({ config, store, session });
    });

    const saved = await User.findOne({ email: config.email })
      .select('+password');
    expect(result).toEqual({ status: 'CREATED', created: true });
    expect(saved).toMatchObject({
      fullName: 'Bootstrap Operator',
      role: 'super_admin',
      isVerified: true,
      isBlocked: false,
      isDeleted: false
    });
    expect(saved.password).not.toBe(config.password);
    await expect(saved.matchPassword(config.password)).resolves.toBe(true);
    await expect(User.countDocuments()).resolves.toBe(1);
  });

  test('logs no supplied values and always disconnects after connecting', async () => {
    const { runInitialAdminBootstrap } = require(SCRIPT_PATH);
    const store = createMemoryStore();
    const logger = { info: jest.fn() };
    const disconnectDatabase = jest.fn().mockResolvedValue(undefined);
    const connection = createVerifiedConnection();

    await expect(runInitialAdminBootstrap({
      environment: validEnvironment(),
      dependencies: {
        connectDatabase: jest.fn().mockResolvedValue({ connection }),
        disconnectDatabase,
        createStore: () => store,
        logger
      }
    })).resolves.toEqual({ status: 'CREATED', created: true });

    const logged = JSON.stringify(logger.info.mock.calls);
    for (const value of SENSITIVE_VALUES) {
      expect(logged).not.toContain(value);
    }
    expect(disconnectDatabase).toHaveBeenCalledTimes(1);
  });
});
