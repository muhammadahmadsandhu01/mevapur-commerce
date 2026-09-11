const mongoose = require('mongoose');
const { getRuntimeConfig } = require('../config/runtime.config');
const lifecycleState = require('./lifecycleState');

const READINESS_CODES = Object.freeze({
  RUNTIME_NOT_READY: 'RUNTIME_NOT_READY',
  SHUTTING_DOWN: 'SHUTTING_DOWN',
  DATABASE_NOT_READY: 'DATABASE_NOT_READY',
  DATABASE_PING_UNAVAILABLE: 'DATABASE_PING_UNAVAILABLE',
  DATABASE_PING_FAILED: 'DATABASE_PING_FAILED',
  DATABASE_PING_TIMEOUT: 'DATABASE_PING_TIMEOUT',
  EXACT_READ_NOT_READY: 'EXACT_READ_NOT_READY',
  REDIS_NOT_READY: 'REDIS_NOT_READY',
  REDIS_PING_UNAVAILABLE: 'REDIS_PING_UNAVAILABLE',
  REDIS_PING_FAILED: 'REDIS_PING_FAILED',
  REDIS_PING_TIMEOUT: 'REDIS_PING_TIMEOUT'
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
          const error = new Error('Readiness ping timed out');
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
  redisClient = null,
  assistantConfigProvider = () => {
    try {
      const { createAssistantConfig } = require('../modules/assistant/config/assistant.config');
      return createAssistantConfig(process.env);
    } catch {
      return null;
    }
  },
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
  } else if (runtimeConfig?.readiness?.databasePingEnabled) {
    const databaseAdmin = databaseConnection.db?.admin?.();
    const ping = databaseAdmin?.ping;
    if (typeof ping !== 'function') {
      reasonCodes.push(READINESS_CODES.DATABASE_PING_UNAVAILABLE);
    } else {
      try {
        await boundedPing(
          () => ping.call(databaseAdmin),
          runtimeConfig.readiness?.databasePingTimeoutMs || 2000,
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

  // Exact-Read Commerce Migration Readiness Check
  if (
    runtimeConfig?.commerce?.moneyMode === 'exact_read'
    && databaseConnection?.readyState === 1
  ) {
    try {
      const MigrationState = mongoose.models.MigrationState || require('../models/MigrationState');
      const { RolloutAuthority } = require('../modules/commerce');
      const state = await MigrationState.findOne({
        migrationId: 'phase4d-exact-money-migration'
      }).lean();
      const isReady = RolloutAuthority.verifyReadinessEvidence(state);
      if (!isReady) {
        checks.database = 'not_ready';
        reasonCodes.push(READINESS_CODES.EXACT_READ_NOT_READY);
      }
    } catch {
      checks.database = 'not_ready';
      reasonCodes.push(READINESS_CODES.EXACT_READ_NOT_READY);
    }
  }

  // Assistant Redis readiness check when Redis store is configured
  let assistantConfig = null;
  try {
    assistantConfig = typeof assistantConfigProvider === 'function'
      ? assistantConfigProvider()
      : assistantConfigProvider;
  } catch {
    // If provider throws, it is treated as not ready below
  }

  if (assistantConfig?.rateLimit?.store === 'redis') {
    checks.redis = 'not_ready';
    if (!redisClient) {
      reasonCodes.push(READINESS_CODES.REDIS_NOT_READY);
    } else if (redisClient.isOpen === false) {
      reasonCodes.push(READINESS_CODES.REDIS_NOT_READY);
    } else if (typeof redisClient.ping === 'function') {
      try {
        await boundedPing(
          () => redisClient.ping(),
          runtimeConfig.readiness?.databasePingTimeoutMs || 2000,
          pingOptions
        );
        checks.redis = 'ready';
      } catch (error) {
        reasonCodes.push(
          error?.code === READINESS_CODES.DATABASE_PING_TIMEOUT
            ? READINESS_CODES.REDIS_PING_TIMEOUT
            : READINESS_CODES.REDIS_PING_FAILED
        );
      }
    } else {
      checks.redis = 'ready';
    }
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
