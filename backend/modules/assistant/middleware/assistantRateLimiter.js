const rateLimit = require('express-rate-limit');
const { AssistantConfigurationError } = require('../config/assistant.config');

/**
 * Redis store adapter for express-rate-limit that satisfies the Store interface.
 * Implements cluster-wide rate limiting with atomic TTL bounding.
 */
class AssistantRedisStore {
  constructor(options = {}) {
    this.client = options.client || null;
    this.prefix = options.prefix || 'assistant_rl:';
    this.windowMs = options.windowMs || 60000;
  }

  init(options) {
    if (options && options.windowMs) {
      this.windowMs = options.windowMs;
    }
  }

  async increment(key) {
    if (!this.client) {
      throw new Error('Redis client is not configured for distributed rate limiting');
    }
    const prefixedKey = `${this.prefix}${key}`;

    // 1. Lua script execution if supported
    if (typeof this.client.eval === 'function') {
      const script = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        local ttl = redis.call('PTTL', KEYS[1])
        return {current, ttl}
      `;
      const result = await this.client.eval(script, 1, prefixedKey, this.windowMs);
      const totalHits = Number(Array.isArray(result) ? result[0] : (result?.current || result || 1));
      const pttl = Number(Array.isArray(result) ? result[1] : (result?.ttl || this.windowMs));
      const resetTime = new Date(Date.now() + (pttl > 0 ? pttl : this.windowMs));
      return { totalHits, resetTime };
    }

    // 2. Multi / pipeline execution if supported
    if (typeof this.client.multi === 'function') {
      const multi = this.client.multi();
      multi.incr(prefixedKey);
      multi.pttl(prefixedKey);
      const results = await multi.exec();
      const hits = Number(Array.isArray(results[0]) ? results[0][1] : results[0]);
      let ttl = Number(Array.isArray(results[1]) ? results[1][1] : results[1]);
      if (hits === 1 || ttl < 0) {
        if (typeof this.client.pExpire === 'function') {
          await this.client.pExpire(prefixedKey, this.windowMs);
        } else if (typeof this.client.pexpire === 'function') {
          await this.client.pexpire(prefixedKey, this.windowMs);
        }
        ttl = this.windowMs;
      }
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs));
      return { totalHits: hits, resetTime };
    }

    // 3. Direct incr + pttl/pexpire if supported
    if (typeof this.client.incr === 'function') {
      const hits = await this.client.incr(prefixedKey);
      let ttl = this.windowMs;
      if (hits === 1) {
        if (typeof this.client.pExpire === 'function') {
          await this.client.pExpire(prefixedKey, this.windowMs);
        } else if (typeof this.client.pexpire === 'function') {
          await this.client.pexpire(prefixedKey, this.windowMs);
        }
      } else if (typeof this.client.pTtl === 'function') {
        ttl = await this.client.pTtl(prefixedKey);
      } else if (typeof this.client.pttl === 'function') {
        ttl = await this.client.pttl(prefixedKey);
      }
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs));
      return { totalHits: Number(hits), resetTime };
    }

    throw new Error('Unsupported Redis client interface for Assistant rate limiting');
  }

  async decrement(key) {
    if (!this.client) return;
    const prefixedKey = `${this.prefix}${key}`;
    if (typeof this.client.decr === 'function') {
      await this.client.decr(prefixedKey);
    }
  }

  async resetKey(key) {
    if (!this.client) return;
    const prefixedKey = `${this.prefix}${key}`;
    if (typeof this.client.del === 'function') {
      await this.client.del(prefixedKey);
    }
  }
}

/**
 * Produces sanitized diagnostic information about current rate-limit configuration
 * without exposing sensitive URLs, credentials, or internal topology.
 */
const getRateLimitDiagnostics = (config) => {
  const rl = config?.rateLimit || {
    store: 'memory',
    clusterWide: false,
    windowMs: 60000,
    max: 20,
    keyPrefix: 'memory:'
  };

  return {
    store: rl.store,
    clusterWide: rl.clusterWide,
    windowMs: rl.windowMs,
    max: rl.max,
    keyPrefix: rl.keyPrefix,
    notice: rl.clusterWide
      ? 'Distributed cluster-wide rate limiting active'
      : 'In-memory process-local rate limiting active (not cluster-wide across multiple instances)'
  };
};

/**
 * Creates the express-rate-limit middleware for assistant endpoints.
 * Defaults to safe in-memory limiting for single-instance / local use.
 * Supports distributed Redis store when explicitly configured or injected.
 * Fails closed if distributed mode is misconfigured or missing a client.
 */
const createAssistantRateLimiter = (config, options = {}) => {
  const rateLimitConfig = config?.rateLimit || {
    store: 'memory',
    clusterWide: false,
    windowMs: 60000,
    max: 20,
    keyPrefix: 'memory:'
  };

  let store;
  if (options.rateLimitStore) {
    store = options.rateLimitStore;
  } else if (rateLimitConfig.store === 'redis') {
    if (options.redisClient) {
      store = new AssistantRedisStore({
        client: options.redisClient,
        prefix: rateLimitConfig.keyPrefix,
        windowMs: rateLimitConfig.windowMs
      });
    } else {
      // Fail closed: Never silently fall back to process-local memory limiter
      // when distributed mode is explicitly required by configuration.
      throw new AssistantConfigurationError(
        'AI_RATE_LIMIT_STORE',
        'Redis store configured but no active Redis client or connection is available'
      );
    }
  }

  const limiterOptions = {
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'ASSISTANT_RATE_LIMITED',
          message: 'Too many assistant requests; please retry later'
        },
        meta: {
          requestId: req.requestId || 'unknown'
        }
      });
    }
  };

  if (store) {
    limiterOptions.store = store;
  }

  return rateLimit(limiterOptions);
};

module.exports = {
  createAssistantRateLimiter,
  AssistantRedisStore,
  getRateLimitDiagnostics
};
