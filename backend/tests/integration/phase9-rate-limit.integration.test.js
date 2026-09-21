const request = require('supertest');
const express = require('express');
const RedisRateLimitStore = require('../../middleware/redisRateLimitStore');
const { createConfiguredLimiter } = require('../../middleware/rateLimiter');
const { createGlobalLimiter } = require('../../middleware/security');

describe('Phase 9 Distributed Rate Limiting Integration Tests', () => {
  let mockRedisData;
  let sharedRedisMock;

  beforeEach(() => {
    mockRedisData = new Map();

    sharedRedisMock = {
      isOpen: true,
      multi: () => {
        const queue = [];
        const multiObj = {
          incr: (key) => {
            queue.push({ op: 'incr', key });
            return multiObj;
          },
          pTTL: (key) => {
            queue.push({ op: 'pTTL', key });
            return multiObj;
          },
          exec: async () => {
            const results = [];
            for (const item of queue) {
              if (item.op === 'incr') {
                const current = mockRedisData.get(item.key) || { val: 0, ttl: 60000 };
                current.val += 1;
                mockRedisData.set(item.key, current);
                results.push(current.val);
              } else if (item.op === 'pTTL') {
                const current = mockRedisData.get(item.key);
                results.push(current ? current.ttl : -1);
              }
            }
            return results;
          }
        };
        return multiObj;
      },
      pExpire: async (key, ttl) => {
        const current = mockRedisData.get(key) || { val: 1 };
        current.ttl = ttl;
        mockRedisData.set(key, current);
        return 1;
      },
      decr: async (key) => {
        const current = mockRedisData.get(key);
        if (current) current.val -= 1;
      },
      del: async (key) => {
        mockRedisData.delete(key);
      }
    };
  });

  describe('1. Multi-Instance Distributed Rate Limiting', () => {
    test('enforces unified rate limit across 2 independent Express instances sharing Redis', async () => {
      const limiter1 = createConfiguredLimiter({
        windowMs: 60 * 1000,
        max: 5,
        prefix: 'rl:test:shared:',
        redisClient: sharedRedisMock
      });

      const limiter2 = createConfiguredLimiter({
        windowMs: 60 * 1000,
        max: 5,
        prefix: 'rl:test:shared:',
        redisClient: sharedRedisMock
      });

      const app1 = express();
      app1.use('/api/action', limiter1, (req, res) => res.json({ instance: 1, success: true }));

      const app2 = express();
      app2.use('/api/action', limiter2, (req, res) => res.json({ instance: 2, success: true }));

      // 3 requests to instance 1
      for (let i = 0; i < 3; i++) {
        const res = await request(app1).get('/api/action');
        expect(res.status).toBe(200);
      }

      // 2 requests to instance 2 (total reaches 5)
      for (let i = 0; i < 2; i++) {
        const res = await request(app2).get('/api/action');
        expect(res.status).toBe(200);
      }

      // 6th request to instance 1 should be rate-limited (429)
      const res6a = await request(app1).get('/api/action');
      expect(res6a.status).toBe(429);
      expect(res6a.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

      // 7th request to instance 2 should also be rate-limited (429)
      const res6b = await request(app2).get('/api/action');
      expect(res6b.status).toBe(429);
    });
  });

  describe('2. Fail-Closed vs Degraded Failure Policies', () => {
    test('critical auth limiter fails closed when Redis throws error in failClosed mode', async () => {
      const faultyRedis = {
        isOpen: true,
        multi: () => ({
          incr: () => ({
            pTTL: () => ({
              exec: async () => {
                throw new Error('Connection refused to Redis cluster');
              }
            })
          })
        })
      };

      const failClosedStore = new RedisRateLimitStore({
        redisClient: faultyRedis,
        failClosed: true
      });

      await expect(failClosedStore.increment('ip:127.0.0.1')).rejects.toThrow(
        /Rate limiting store unavailable/
      );
    });

    test('non-critical / global limiter degrades gracefully to local memory window when Redis fails', async () => {
      const faultyRedis = {
        isOpen: true,
        multi: () => ({
          incr: () => ({
            pTTL: () => ({
              exec: async () => {
                throw new Error('Connection timeout');
              }
            })
          })
        })
      };

      const degradedStore = new RedisRateLimitStore({
        redisClient: faultyRedis,
        failClosed: false
      });

      // Does not throw, degrades to local memory fallback
      const result1 = await degradedStore.increment('ip:127.0.0.1');
      expect(result1.totalHits).toBe(1);

      const result2 = await degradedStore.increment('ip:127.0.0.1');
      expect(result2.totalHits).toBe(2);
    });
  });
});
