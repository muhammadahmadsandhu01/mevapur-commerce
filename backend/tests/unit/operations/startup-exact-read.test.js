'use strict';

const { resetRuntimeConfig } = require('../../../config/runtime.config');
const MigrationState = require('../../../models/MigrationState');
const { RolloutAuthority } = require('../../../modules/commerce');
const { startServer } = require('../../../server');

describe('Startup Exact-Read Pre-Listen Boundary & Safety Tests', () => {
  const originalEnv = { ...process.env };
  let mockLogger;
  let mockApp;
  let mockConnectDb;
  let mockCloseDb;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetRuntimeConfig();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockApp = {
      listen: jest.fn((port, cb) => {
        if (typeof cb === 'function') cb();
        return {
          close: jest.fn((fn) => fn && fn()),
          on: jest.fn()
        };
      })
    };

    mockConnectDb = jest.fn().mockResolvedValue(true);
    mockCloseDb = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    resetRuntimeConfig();
  });

  it('1. invalid COMMERCE_MONEY_MODE fails before database connection is called', async () => {
    process.env.COMMERCE_MONEY_MODE = 'invalid_random_mode';

    await expect(
      startServer({
        application: mockApp,
        connectDatabase: mockConnectDb,
        closeDatabase: mockCloseDb,
        logger: mockLogger,
        loadEnvironment: () => {}
      })
    ).rejects.toThrow(/COMMERCE_MONEY_MODE must be one of: legacy, shadow_write, exact_read/);

    expect(mockConnectDb).not.toHaveBeenCalled();
    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  it('2. legacy mode connects to database and starts listener without requiring MigrationState', async () => {
    process.env.COMMERCE_MONEY_MODE = 'legacy';
    const findSpy = jest.spyOn(MigrationState, 'findOne');

    const result = await startServer({
      application: mockApp,
      connectDatabase: mockConnectDb,
      closeDatabase: mockCloseDb,
      logger: mockLogger,
      loadEnvironment: () => {}
    });

    expect(mockConnectDb).toHaveBeenCalledTimes(1);
    expect(findSpy).not.toHaveBeenCalled();
    expect(mockApp.listen).toHaveBeenCalledTimes(1);
    expect(result.server).toBeDefined();
  });

  it('3. shadow_write mode connects to database and starts listener without requiring MigrationState', async () => {
    process.env.COMMERCE_MONEY_MODE = 'shadow_write';
    const findSpy = jest.spyOn(MigrationState, 'findOne');

    const result = await startServer({
      application: mockApp,
      connectDatabase: mockConnectDb,
      closeDatabase: mockCloseDb,
      logger: mockLogger,
      loadEnvironment: () => {}
    });

    expect(mockConnectDb).toHaveBeenCalledTimes(1);
    expect(findSpy).not.toHaveBeenCalled();
    expect(mockApp.listen).toHaveBeenCalledTimes(1);
    expect(result.server).toBeDefined();
  });

  it('4. exact_read without MigrationState record throws and NEVER calls app.listen', async () => {
    process.env.COMMERCE_MONEY_MODE = 'exact_read';
    jest.spyOn(MigrationState, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });

    await expect(
      startServer({
        application: mockApp,
        connectDatabase: mockConnectDb,
        closeDatabase: mockCloseDb,
        logger: mockLogger,
        loadEnvironment: () => {}
      })
    ).rejects.toThrow(/Exact-read startup refused: MigrationState is incomplete, unverified, or conflicting/);

    expect(mockConnectDb).toHaveBeenCalledTimes(1);
    expect(mockApp.listen).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Exact-read readiness evidence missing or incomplete'),
      expect.objectContaining({ reasonCode: 'EXACT_READ_STARTUP_NOT_READY' })
    );
  });

  it('5. exact_read with incomplete evidence (status pending) throws and NEVER calls app.listen', async () => {
    process.env.COMMERCE_MONEY_MODE = 'exact_read';
    jest.spyOn(MigrationState, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        migrationId: 'phase4d-exact-money-migration',
        status: 'pending',
        metadata: {
          schemaVersion: '1.0.0',
          registrySnapshot: 'currency-registry-v1'
        }
      })
    });

    await expect(
      startServer({
        application: mockApp,
        connectDatabase: mockConnectDb,
        closeDatabase: mockCloseDb,
        logger: mockLogger,
        loadEnvironment: () => {}
      })
    ).rejects.toThrow(/Exact-read startup refused/);

    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  it('6. exact_read with missing currency registry snapshot throws and NEVER calls app.listen', async () => {
    process.env.COMMERCE_MONEY_MODE = 'exact_read';
    jest.spyOn(MigrationState, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        migrationId: 'phase4d-exact-money-migration',
        status: 'completed',
        metadata: {
          schemaVersion: '1.0.0',
          fieldCoverage: 100,
          unresolvedParityFailures: 0,
          scope: RolloutAuthority.REQUIRED_MODEL_SCOPE
        }
      })
    });

    await expect(
      startServer({
        application: mockApp,
        connectDatabase: mockConnectDb,
        closeDatabase: mockCloseDb,
        logger: mockLogger,
        loadEnvironment: () => {}
      })
    ).rejects.toThrow(/Exact-read startup refused/);

    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  it('7. exact_read with unresolved parity failures (conflictCount > 0) throws and NEVER calls app.listen', async () => {
    process.env.COMMERCE_MONEY_MODE = 'exact_read';
    jest.spyOn(MigrationState, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        migrationId: 'phase4d-exact-money-migration',
        status: 'completed',
        conflictCount: 2,
        metadata: {
          schemaVersion: '1.0.0',
          registrySnapshot: 'currency-registry-v1',
          fieldCoverage: 100,
          unresolvedParityFailures: 2,
          scope: RolloutAuthority.REQUIRED_MODEL_SCOPE
        }
      })
    });

    await expect(
      startServer({
        application: mockApp,
        connectDatabase: mockConnectDb,
        closeDatabase: mockCloseDb,
        logger: mockLogger,
        loadEnvironment: () => {}
      })
    ).rejects.toThrow(/Exact-read startup refused/);

    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  it('8. exact_read with missing required model scope throws and NEVER calls app.listen', async () => {
    process.env.COMMERCE_MONEY_MODE = 'exact_read';
    jest.spyOn(MigrationState, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        migrationId: 'phase4d-exact-money-migration',
        status: 'completed',
        metadata: {
          schemaVersion: '1.0.0',
          registrySnapshot: 'currency-registry-v1',
          fieldCoverage: 100,
          unresolvedParityFailures: 0,
          scope: ['products', 'orders'] // missing payments, refunds, coupons, etc.
        }
      })
    });

    await expect(
      startServer({
        application: mockApp,
        connectDatabase: mockConnectDb,
        closeDatabase: mockCloseDb,
        logger: mockLogger,
        loadEnvironment: () => {}
      })
    ).rejects.toThrow(/Exact-read startup refused/);

    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  it('9. valid isolated MigrationState permits startup and calls app.listen', async () => {
    process.env.COMMERCE_MONEY_MODE = 'exact_read';
    jest.spyOn(MigrationState, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        migrationId: 'phase4d-exact-money-migration',
        status: 'completed',
        conflictCount: 0,
        metadata: {
          schemaVersion: '1.0.0',
          registrySnapshot: 'currency-registry-v1',
          fieldCoverage: 100,
          unresolvedParityFailures: 0,
          scope: RolloutAuthority.REQUIRED_MODEL_SCOPE,
          verifiedAt: new Date().toISOString()
        }
      })
    });

    const result = await startServer({
      application: mockApp,
      connectDatabase: mockConnectDb,
      closeDatabase: mockCloseDb,
      logger: mockLogger,
      loadEnvironment: () => {}
    });

    expect(mockConnectDb).toHaveBeenCalledTimes(1);
    expect(mockApp.listen).toHaveBeenCalledTimes(1);
    expect(result.server).toBeDefined();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('10. database query error during exact_read check terminates startup safely with sanitized error', async () => {
    process.env.COMMERCE_MONEY_MODE = 'exact_read';
    jest.spyOn(MigrationState, 'findOne').mockReturnValue({
      lean: jest.fn().mockRejectedValue(new Error('MongoNetworkError: connection refused to mongodb://secretUser:secretPass@internal-db:27017/prod_db'))
    });

    await expect(
      startServer({
        application: mockApp,
        connectDatabase: mockConnectDb,
        closeDatabase: mockCloseDb,
        logger: mockLogger,
        loadEnvironment: () => {}
      })
    ).rejects.toThrow('Exact-read startup verification failed: database query error');

    expect(mockApp.listen).not.toHaveBeenCalled();
    // Verify sanitized error log
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to query MigrationState for exact_read startup verification',
      { reasonCode: 'EXACT_READ_MIGRATION_QUERY_FAILED' }
    );
  });
});
