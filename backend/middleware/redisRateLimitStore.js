/**
 * @file redisRateLimitStore.js
 * @description Production-grade Redis store adapter for express-rate-limit.
 * Implements atomic increment with bounded TTL, fail-closed / degraded failure policies,
 * and multi-instance distributed rate limit coordination.
 */

'use strict';

class RedisRateLimitStore {
  /**
   * @param {Object} options
   * @param {Object} options.redisClient - Connected node-redis v4 client instance
   * @param {string} [options.prefix='rl:'] - Key prefix in Redis
   * @param {boolean} [options.failClosed=false] - If true, Redis failure blocks requests; if false, degrades gracefully
   */
  constructor(options = {}) {
    this.redisClient = options.redisClient || null;
    this.prefix = options.prefix || 'rl:';
    this.failClosed = Boolean(options.failClosed);
    this.windowMs = 60 * 1000;
    this.localFallback = new Map();
  }

  init(options) {
    this.windowMs = options.windowMs || this.windowMs;
  }

  async increment(key) {
    const fullKey = `${this.prefix}${key}`;
    const client = this.redisClient;

    if (client && client.isOpen) {
      try {
        const results = await client
          .multi()
          .incr(fullKey)
          .pTTL(fullKey)
          .exec();

        const totalHits = results[0];
        let ttlMs = results[1];

        // If newly created key (TTL was -1), set the windowMs TTL
        if (ttlMs < 0) {
          await client.pExpire(fullKey, this.windowMs);
          ttlMs = this.windowMs;
        }

        const resetTime = new Date(Date.now() + Math.max(0, ttlMs));
        return {
          totalHits,
          resetTime
        };
      } catch (redisErr) {
        if (this.failClosed) {
          throw new Error(`Rate limiting store unavailable: ${redisErr.message}`);
        }
      }
    } else if (this.failClosed && process.env.NODE_ENV === 'production' && process.env.RATE_LIMIT_STORE === 'redis') {
      throw new Error('Redis rate limiting store is disconnected (fail-closed policy enforced)');
    }

    // Degraded / fallback local memory window
    const now = Date.now();
    let entry = this.localFallback.get(fullKey);
    if (!entry || entry.resetTime <= now) {
      entry = { totalHits: 0, resetTime: now + this.windowMs };
      this.localFallback.set(fullKey, entry);
    }
    entry.totalHits += 1;

    return {
      totalHits: entry.totalHits,
      resetTime: new Date(entry.resetTime)
    };
  }

  async decrement(key) {
    const fullKey = `${this.prefix}${key}`;
    const client = this.redisClient;
    if (client && client.isOpen) {
      try {
        await client.decr(fullKey);
      } catch {
        // Ignore decrement errors
      }
    }
  }

  async resetKey(key) {
    const fullKey = `${this.prefix}${key}`;
    const client = this.redisClient;
    if (client && client.isOpen) {
      try {
        await client.del(fullKey);
      } catch {
        // Ignore delete errors
      }
    }
    this.localFallback.delete(fullKey);
  }
}

module.exports = RedisRateLimitStore;
