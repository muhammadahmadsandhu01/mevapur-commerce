let cachedApp;

const loadApplication = (options = {}) => {
  const { createApp } = require('./app');
  if (options && Object.keys(options).length > 0) {
    return createApp(options);
  }
  if (!cachedApp) cachedApp = createApp();
  return cachedApp;
};

async function startServer({
  application,
  connectDatabase,
  closeDatabase,
  connectRedis,
  closeRedis,
  redisClient: injectedRedisClient,
  logger,
  loadEnvironment = () => require('dotenv').config(),
  exit
} = {}) {
  loadEnvironment();

  const runtimeConfig = require('./config/runtime.config').getRuntimeConfig();
  const database = require('./config/db');
  const activeLogger = logger || require('./common/utils/logger');
  const connect = connectDatabase || database;
  const close = closeDatabase || database.closeDatabase;
  const lifecycleState = require('./operations/lifecycleState');
  const { createServerLifecycle } = require('./operations/serverLifecycle');
  const { createAssistantConfig } = require('./modules/assistant/config/assistant.config');
  const {
    createAssistantRedisClient,
    connectAssistantRedisClient,
    closeAssistantRedisClient
  } = require('./modules/assistant/rateLimit/redisClientFactory');

  lifecycleState.markRunning();
  await connect();

  // Assistant Redis rate limit lifecycle (activated only when store is redis)
  let assistantRedisClient = injectedRedisClient || null;
  let assistantConfig = null;
  try {
    assistantConfig = createAssistantConfig(process.env);
  } catch (err) {
    activeLogger.error('Assistant configuration invalid during server startup', {
      reasonCode: 'ASSISTANT_CONFIG_STARTUP_INVALID'
    });
    throw err;
  }

  if (assistantConfig?.rateLimit?.store === 'redis') {
    if (!assistantRedisClient) {
      assistantRedisClient = createAssistantRedisClient(assistantConfig, {
        logger: activeLogger
      });
    }
    const connectRedisFn = connectRedis
      || (() => connectAssistantRedisClient(assistantRedisClient, { logger: activeLogger }));
    await connectRedisFn(assistantRedisClient);
  }

  // Pre-listen exact-read migration verification gate
  if (runtimeConfig?.commerce?.moneyMode === 'exact_read') {
    const MigrationState = require('./models/MigrationState');
    const { RolloutAuthority } = require('./modules/commerce');

    let state = null;
    try {
      state = await MigrationState.findOne({
        migrationId: 'phase4d-exact-money-migration'
      }).lean();
    } catch (dbErr) {
      activeLogger.error('Failed to query MigrationState for exact_read startup verification', {
        reasonCode: 'EXACT_READ_MIGRATION_QUERY_FAILED'
      });
      throw new Error('Exact-read startup verification failed: database query error');
    }

    const isReady = RolloutAuthority.verifyReadinessEvidence(state);
    if (!isReady) {
      activeLogger.error('Exact-read readiness evidence missing or incomplete; refusing to open HTTP listener', {
        reasonCode: 'EXACT_READ_STARTUP_NOT_READY'
      });
      throw new Error('Exact-read startup refused: MigrationState is incomplete, unverified, or conflicting');
    }
  }

  const app = application || loadApplication({
    redisClient: assistantRedisClient,
    assistantConfig
  });

  const server = app.listen(runtimeConfig.server.port, () => {
    activeLogger.info('HTTP server listening', {
      reasonCode: 'SERVER_LISTENING',
      environment: runtimeConfig.environment,
      port: runtimeConfig.server.port
    });
  });

  const closeRedisFn = closeRedis
    || (() => closeAssistantRedisClient(assistantRedisClient, { logger: activeLogger }));

  const lifecycle = createServerLifecycle({
    server,
    closeDatabase: close,
    closeRedis: closeRedisFn,
    logger: activeLogger,
    shutdownTimeoutMs: runtimeConfig.server.shutdownTimeoutMs,
    exit
  });
  lifecycle.installProcessHandlers();

  return {
    app,
    server,
    lifecycle,
    redisClient: assistantRedisClient
  };
}

if (require.main === module) {
  startServer().catch(() => {
    const logger = require('./common/utils/logger');
    logger.error('Server startup failed', {
      reasonCode: 'SERVER_START_FAILED'
    });
    process.exit(1);
  });
}

const exportedApp = loadApplication();
module.exports = exportedApp;
module.exports.loadApplication = loadApplication;
module.exports.startServer = startServer;
