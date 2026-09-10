const express = require('express');
const request = require('supertest');
const {
  AssistantConfigurationError,
  createAssistantConfig
} = require('../../../modules/assistant/config/assistant.config');
const {
  createAssistantRateLimiter,
  AssistantRedisStore,
  getRateLimitDiagnostics
} = require('../../../modules/assistant/middleware/assistantRateLimiter');
const {
  createAssistantRouter
} = require('../../../modules/assistant/assistant.routes');
const errorHandler = require('../../../middleware/errorHandler');

describe('Assistant Rate Limiting & Distributed Boundary (DEF-02-C / Batch 2H)', () => {
  describe('Configuration Parsing & Validation', () => {
    test('defaults to in-memory process-local store with safe bounds', () => {
      const config = createAssistantConfig({});

      expect(config.rateLimit).toEqual({
        store: 'memory',
        clusterWide: false,
        windowMs: 60000,
        max: 20,
        keyPrefix: 'memory:',
        redis: null
      });
    });

    test('accepts custom windowMs and max within approved boundaries', () => {
      const config = createAssistantConfig({
        AI_RATE_LIMIT_WINDOW_MS: '30000',
        AI_RATE_LIMIT_MAX: '50'
      });

      expect(config.rateLimit.windowMs).toBe(30000);
      expect(config.rateLimit.max).toBe(50);
      expect(config.rateLimit.store).toBe('memory');
      expect(config.rateLimit.clusterWide).toBe(false);
    });

    test('rejects invalid store types with AssistantConfigurationError', () => {
      expect(() => createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'memcached'
      })).toThrow(AssistantConfigurationError);

      expect(() => createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'dynamodb'
      })).toThrow('AI_RATE_LIMIT_STORE: must be memory or redis');
    });

    test('rejects redis store mode when Redis URL is missing', () => {
      expect(() => createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis'
      })).toThrow('AI_RATE_LIMIT_REDIS_URL: Redis URL is required when AI_RATE_LIMIT_STORE is redis');
    });

    test('rejects invalid or non-redis URLs in redis mode', () => {
      expect(() => createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'http://localhost:6379'
      })).toThrow('AI_RATE_LIMIT_REDIS_URL: must use redis:// or rediss:// protocol');

      expect(() => createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'not-a-valid-url'
      })).toThrow('AI_RATE_LIMIT_REDIS_URL: must be a valid redis:// or rediss:// URL');
    });

    test('accepts valid redis configuration and marks clusterWide true', () => {
      const config = createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379',
        AI_RATE_LIMIT_PREFIX: 'test_assistant_rl:'
      });

      expect(config.rateLimit.store).toBe('redis');
      expect(config.rateLimit.clusterWide).toBe(true);
      expect(config.rateLimit.keyPrefix).toBe('test_assistant_rl:');
      expect(config.rateLimit.redis.url).toBe('redis://127.0.0.1:6379');
    });
  });

  describe('Diagnostic Metadata Visibility', () => {
    test('reports sanitized diagnostic object without credential leakage', () => {
      const memoryConfig = createAssistantConfig({});
      const memoryDiag = getRateLimitDiagnostics(memoryConfig);

      expect(memoryDiag).toEqual({
        store: 'memory',
        clusterWide: false,
        windowMs: 60000,
        max: 20,
        keyPrefix: 'memory:',
        notice: 'In-memory process-local rate limiting active (not cluster-wide across multiple instances)'
      });

      const redisConfig = createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'rediss://user:secretpass@cluster.example.test:6379',
        AI_RATE_LIMIT_PREFIX: 'prod_rl:'
      });
      const redisDiag = getRateLimitDiagnostics(redisConfig);

      expect(redisDiag).toEqual({
        store: 'redis',
        clusterWide: true,
        windowMs: 60000,
        max: 20,
        keyPrefix: 'prod_rl:',
        notice: 'Distributed cluster-wide rate limiting active'
      });
      // Ensure no URL, username, or secret is exposed
      expect(JSON.stringify(redisDiag)).not.toContain('secretpass');
      expect(JSON.stringify(redisDiag)).not.toContain('cluster.example.test');
    });
  });

  describe('Fail-Closed Boundary & Store Initialization', () => {
    test('fails closed when redis store is configured without an active client or store', () => {
      const redisConfig = createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379'
      });

      expect(() => createAssistantRateLimiter(redisConfig)).toThrow(AssistantConfigurationError);
      expect(() => createAssistantRateLimiter(redisConfig)).toThrow(
        'AI_RATE_LIMIT_STORE: Redis store configured but no active Redis client or connection is available'
      );
    });

    test('initializes AssistantRedisStore when redisClient is provided', () => {
      const redisConfig = createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379'
      });

      const mockClient = {
        eval: jest.fn().mockResolvedValue([1, 60000])
      };

      const limiter = createAssistantRateLimiter(redisConfig, { redisClient: mockClient });
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe('function');
    });

    test('uses custom injected rateLimitStore option directly', () => {
      const customStore = {
        increment: jest.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date() }),
        decrement: jest.fn(),
        resetKey: jest.fn()
      };

      const limiter = createAssistantRateLimiter(createAssistantConfig({}), {
        rateLimitStore: customStore
      });
      expect(limiter).toBeDefined();
    });
  });

  describe('AssistantRedisStore Adapter Mechanics', () => {
    test('increments counter using Lua script evaluation', async () => {
      const mockClient = {
        eval: jest.fn().mockResolvedValue([3, 45000]),
        decr: jest.fn(),
        del: jest.fn()
      };

      const store = new AssistantRedisStore({
        client: mockClient,
        prefix: 'test_rl:',
        windowMs: 60000
      });

      const result = await store.increment('client-ip-123');
      expect(result.totalHits).toBe(3);
      expect(result.resetTime).toBeInstanceOf(Date);
      expect(mockClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('local current = redis.call(\'INCR\', KEYS[1])'),
        1,
        'test_rl:client-ip-123',
        60000
      );

      await store.decrement('client-ip-123');
      expect(mockClient.decr).toHaveBeenCalledWith('test_rl:client-ip-123');

      await store.resetKey('client-ip-123');
      expect(mockClient.del).toHaveBeenCalledWith('test_rl:client-ip-123');
    });

    test('increments counter using multi/pipeline when eval is unavailable', async () => {
      const mockExec = jest.fn().mockResolvedValue([[null, 2], [null, 30000]]);
      const mockClient = {
        multi: jest.fn().mockReturnValue({
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: mockExec
        }),
        pExpire: jest.fn().mockResolvedValue(1)
      };

      const store = new AssistantRedisStore({
        client: mockClient,
        prefix: 'pipeline_rl:',
        windowMs: 60000
      });

      const result = await store.increment('user-456');
      expect(result.totalHits).toBe(2);
      expect(mockClient.multi).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalled();
    });

    test('increments counter using direct incr/pExpire when multi and eval are unavailable', async () => {
      const mockClient = {
        incr: jest.fn().mockResolvedValue(1),
        pExpire: jest.fn().mockResolvedValue(1),
        pttl: jest.fn().mockResolvedValue(60000)
      };

      const store = new AssistantRedisStore({
        client: mockClient,
        prefix: 'direct_rl:',
        windowMs: 60000
      });

      const result = await store.increment('user-789');
      expect(result.totalHits).toBe(1);
      expect(mockClient.incr).toHaveBeenCalledWith('direct_rl:user-789');
      expect(mockClient.pExpire).toHaveBeenCalledWith('direct_rl:user-789', 60000);
    });

    test('throws if increment is called on unconfigured store instance', async () => {
      const store = new AssistantRedisStore({});
      await expect(store.increment('k')).rejects.toThrow(
        'Redis client is not configured for distributed rate limiting'
      );
    });
  });

  describe('HTTP Rate Limit Enforcement & Standard Envelope', () => {
    test('enforces rate limit and returns standardized 429 response envelope', async () => {
      const tightConfig = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval',
        AI_RATE_LIMIT_MAX: '2',
        AI_RATE_LIMIT_WINDOW_MS: '60000'
      });

      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.requestId = 'rl-test-req';
        next();
      });
      app.use('/api/assistant', createAssistantRouter(tightConfig));
      app.use(errorHandler);

      // First request -> 200
      const res1 = await request(app)
        .post('/api/assistant/chat')
        .send({ message: 'Shipping policy' })
        .expect(200);
      expect(res1.body.success).toBe(true);

      // Second request -> 200
      const res2 = await request(app)
        .post('/api/assistant/chat')
        .send({ message: 'Return policy' })
        .expect(200);
      expect(res2.body.success).toBe(true);

      // Third request -> 429 Rate Limited
      const res3 = await request(app)
        .post('/api/assistant/chat')
        .send({ message: 'Refunds' })
        .expect(429);

      expect(res3.body).toEqual({
        success: false,
        error: {
          code: 'ASSISTANT_RATE_LIMITED',
          message: 'Too many assistant requests; please retry later'
        },
        meta: {
          requestId: 'rl-test-req'
        }
      });
      // Verify standard rate limit headers
      expect(res3.headers['ratelimit-limit']).toBe('2');
      expect(res3.headers['ratelimit-remaining']).toBe('0');
      expect(res3.headers['ratelimit-reset']).toBeDefined();
    });

    test('capabilities endpoint reflects rate-limit metadata', async () => {
      const config = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval'
      });

      const app = express();
      app.use(express.json());
      app.use('/api/assistant', createAssistantRouter(config));
      app.use(errorHandler);

      const response = await request(app)
        .get('/api/assistant/capabilities')
        .expect(200);

      expect(response.body.data.rateLimiting).toEqual({
        store: 'memory',
        clusterWide: false
      });
    });
  });
});
