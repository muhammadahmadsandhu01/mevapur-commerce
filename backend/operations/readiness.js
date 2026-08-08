const mongoose = require('mongoose');
const { getRuntimeConfig } = require('../config/runtime.config');
const lifecycleState = require('./lifecycleState');

const READINESS_CODES = Object.freeze({
  RUNTIME_NOT_READY: 'RUNTIME_NOT_READY',
  SHUTTING_DOWN: 'SHUTTING_DOWN',
  DATABASE_NOT_READY: 'DATABASE_NOT_READY',
  DATABASE_PING_UNAVAILABLE: 'DATABASE_PING_UNAVAILABLE',
  DATABASE_PING_FAILED: 'DATABASE_PING_FAILED',
  DATABASE_PING_TIMEOUT: 'DATABASE_PING_TIMEOUT'
});

const boundedPing = async (
  ping,
  timeoutMs,
  {
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  } = {}
) => {
  let timeoutId;
  try {
    await Promise.race([
      Promise.resolve().then(ping),
      new Promise((resolve, reject) => {
        timeoutId = setTimeoutFn(() => {
          const error = new Error('Readiness database ping timed out');
          error.code = READINESS_CODES.DATABASE_PING_TIMEOUT;
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeoutFn(timeoutId);
  }
};

const checkReadiness = async ({
  runtimeConfigProvider = getRuntimeConfig,
  lifecycleSnapshot = lifecycleState.snapshot,
  databaseConnection = mongoose.connection,
  pingOptions
} = {}) => {
  const checks = {
    runtime: 'not_ready',
    lifecycle: 'not_ready',
    database: 'not_ready'
  };
  const reasonCodes = [];

  let runtimeConfig;
  try {
    runtimeConfig = runtimeConfigProvider();
    if (!runtimeConfig?.initialized) {
      throw new Error('Runtime configuration is not initialized');
    }
    checks.runtime = 'ready';
  } catch {
    reasonCodes.push(READINESS_CODES.RUNTIME_NOT_READY);
    return {
      ready: false,
      body: {
        status: 'not_ready',
        checks,
        reasonCodes
      }
    };
  }

  if (lifecycleSnapshot().shuttingDown) {
    reasonCodes.push(READINESS_CODES.SHUTTING_DOWN);
  } else {
    checks.lifecycle = 'ready';
  }

  if (databaseConnection?.readyState !== 1) {
    reasonCodes.push(READINESS_CODES.DATABASE_NOT_READY);
  } else if (runtimeConfig.readiness.databasePingEnabled) {
    const databaseAdmin = databaseConnection.db?.admin?.();
    const ping = databaseAdmin?.ping;
    if (typeof ping !== 'function') {
      reasonCodes.push(READINESS_CODES.DATABASE_PING_UNAVAILABLE);
    } else {
      try {
        await boundedPing(
          () => ping.call(databaseAdmin),
          runtimeConfig.readiness.databasePingTimeoutMs,
          pingOptions
        );
        checks.database = 'ready';
      } catch (error) {
        reasonCodes.push(
          error?.code === READINESS_CODES.DATABASE_PING_TIMEOUT
            ? READINESS_CODES.DATABASE_PING_TIMEOUT
            : READINESS_CODES.DATABASE_PING_FAILED
        );
      }
    }
  } else {
    checks.database = 'ready';
  }

  const ready = reasonCodes.length === 0;
  return {
    ready,
    body: {
      status: ready ? 'ready' : 'not_ready',
      checks,
      reasonCodes
    }
  };
};

const createReadinessHandler = (options = {}) => async (req, res) => {
  const result = await checkReadiness(options);
  res.status(result.ready ? 200 : 503).json(result.body);
};

module.exports = {
  READINESS_CODES,
  boundedPing,
  checkReadiness,
  createReadinessHandler
};
