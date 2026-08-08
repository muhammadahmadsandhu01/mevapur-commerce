let cachedApp;

const loadApplication = () => {
  if (!cachedApp) cachedApp = require('./app');
  return cachedApp;
};

async function startServer({
  application,
  connectDatabase,
  closeDatabase,
  logger,
  loadEnvironment = () => require('dotenv').config(),
  exit
} = {}) {
  loadEnvironment();

  const runtimeConfig = require('./config/runtime.config').getRuntimeConfig();
  const database = require('./config/db');
  const activeLogger = logger || require('./common/utils/logger');
  const app = application || loadApplication();
  const connect = connectDatabase || database;
  const close = closeDatabase || database.closeDatabase;
  const lifecycleState = require('./operations/lifecycleState');
  const { createServerLifecycle } = require('./operations/serverLifecycle');

  lifecycleState.markRunning();
  await connect();

  const server = app.listen(runtimeConfig.server.port, () => {
    activeLogger.info('HTTP server listening', {
      reasonCode: 'SERVER_LISTENING',
      environment: runtimeConfig.environment,
      port: runtimeConfig.server.port
    });
  });

  const lifecycle = createServerLifecycle({
    server,
    closeDatabase: close,
    logger: activeLogger,
    shutdownTimeoutMs: runtimeConfig.server.shutdownTimeoutMs,
    exit
  });
  lifecycle.installProcessHandlers();

  return {
    app,
    server,
    lifecycle
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
