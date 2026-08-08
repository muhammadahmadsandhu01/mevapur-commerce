const lifecycleState = require('./lifecycleState');

const SHUTDOWN_CODES = Object.freeze({
  STARTED: 'SERVER_SHUTDOWN_STARTED',
  COMPLETED: 'SERVER_SHUTDOWN_COMPLETED',
  FAILED: 'SERVER_SHUTDOWN_FAILED',
  TIMED_OUT: 'SERVER_SHUTDOWN_TIMEOUT',
  UNCAUGHT_EXCEPTION: 'UNCAUGHT_EXCEPTION',
  UNHANDLED_REJECTION: 'UNHANDLED_REJECTION'
});

const createServerLifecycle = ({
  server,
  closeDatabase,
  logger,
  shutdownTimeoutMs,
  exit = (code) => process.exit(code),
  processRef = process,
  state = lifecycleState,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) => {
  let shutdownPromise;
  let databaseClosePromise;
  let installed = false;
  const handlers = new Map();

  const closeDatabaseOnce = () => {
    if (!databaseClosePromise) {
      databaseClosePromise = Promise.resolve().then(closeDatabase);
    }
    return databaseClosePromise;
  };

  const closeHttpServer = () => new Promise((resolve, reject) => {
    if (!server?.close) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const performShutdown = async (signal, requestedExitCode) => {
    state.beginShutdown();
    logger.info('Server shutdown started', {
      reasonCode: SHUTDOWN_CODES.STARTED,
      signal
    });

    let timeoutId;
    const orderlyClose = (async () => {
      await closeHttpServer();
      await closeDatabaseOnce();
    })();
    const timeout = new Promise((resolve, reject) => {
      timeoutId = setTimeoutFn(() => {
        const error = new Error('Server shutdown timed out');
        error.code = SHUTDOWN_CODES.TIMED_OUT;
        reject(error);
      }, shutdownTimeoutMs);
    });

    try {
      await Promise.race([orderlyClose, timeout]);
      clearTimeoutFn(timeoutId);
      logger.info('Server shutdown completed', {
        reasonCode: SHUTDOWN_CODES.COMPLETED,
        signal
      });
      exit(requestedExitCode);
      return {
        clean: true,
        exitCode: requestedExitCode
      };
    } catch (error) {
      clearTimeoutFn(timeoutId);
      if (typeof server?.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      try {
        await closeDatabaseOnce();
      } catch {
        // The sanitized failure code below is the authoritative shutdown log.
      }
      const reasonCode = error?.code === SHUTDOWN_CODES.TIMED_OUT
        ? SHUTDOWN_CODES.TIMED_OUT
        : SHUTDOWN_CODES.FAILED;
      logger.error('Server shutdown did not complete cleanly', {
        reasonCode,
        signal
      });
      exit(1);
      return {
        clean: false,
        exitCode: 1,
        reasonCode
      };
    }
  };

  const shutdown = (signal, { exitCode = 0 } = {}) => {
    if (!shutdownPromise) {
      shutdownPromise = performShutdown(signal, exitCode);
    }
    return shutdownPromise;
  };

  const installProcessHandlers = () => {
    if (installed) return;
    installed = true;

    handlers.set('SIGTERM', () => shutdown('SIGTERM'));
    handlers.set('SIGINT', () => shutdown('SIGINT'));
    handlers.set('uncaughtException', () => {
      logger.error('Fatal process event', {
        reasonCode: SHUTDOWN_CODES.UNCAUGHT_EXCEPTION
      });
      return shutdown('UNCAUGHT_EXCEPTION', { exitCode: 1 });
    });
    handlers.set('unhandledRejection', () => {
      logger.error('Fatal process event', {
        reasonCode: SHUTDOWN_CODES.UNHANDLED_REJECTION
      });
      return shutdown('UNHANDLED_REJECTION', { exitCode: 1 });
    });

    for (const [event, handler] of handlers) {
      processRef.on(event, handler);
    }
  };

  const removeProcessHandlers = () => {
    if (!installed) return;
    for (const [event, handler] of handlers) {
      processRef.removeListener(event, handler);
    }
    handlers.clear();
    installed = false;
  };

  return {
    installProcessHandlers,
    removeProcessHandlers,
    shutdown
  };
};

module.exports = {
  SHUTDOWN_CODES,
  createServerLifecycle
};
