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
const {
  createAssistantRedisClient,
  connectAssistantRedisClient,
  closeAssistantRedisClient,
  pingAssistantRedisClient
} = require('../../../modules/assistant/rateLimit/redisClientFactory');
const { createApp } = require('../../../app');
const { startServer } = require('../../../server');
const { checkReadiness, READINESS_CODES } = require('../../../operations/readiness');
const { createServerLifecycle } = require('../../../operations/serverLifecycle');
const lifecycleState = require('../../../operations/lifecycleState');
const errorHandler = require('../../../middleware/errorHandler');

describe('Assistant Rate Limiting & Distributed Boundary (DEF-02-C / Batch 2H)', () => {
  beforeEach(() => {
    lifecycleState.markRunning();
  });
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

  describe('Redis Client Factory & Lifecycle Operations', () => {
    test('createAssistantRedisClient returns null in default memory mode', () => {
      const config = createAssistantConfig({});
      expect(createAssistantRedisClient(config)).toBeNull();
    });

    test('createAssistantRedisClient constructs client using injected factory in redis mode', () => {
      const config = createAssistantConfig({
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://localhost:6379'
      });
      const mockCreateClient = jest.fn().mockReturnValue({
        on: jest.fn()
      });

      const client = createAssistantRedisClient(config, { createClient: mockCreateClient });
      expect(mockCreateClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
      expect(client).toBeDefined();
    });

    test('connectAssistantRedisClient connects client cleanly and logs reason code', async () => {
      const mockClient = {
        isOpen: false,
        connect: jest.fn().mockResolvedValue()
      };
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn()
      };

      await connectAssistantRedisClient(mockClient, { logger: mockLogger });
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Assistant Redis client connected',
        expect.objectContaining({ reasonCode: 'ASSISTANT_REDIS_CONNECTED' })
      );
    });

    test('connectAssistantRedisClient logs sanitized failure on connection error and throws', async () => {
      const mockClient = {
        isOpen: false,
        connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      };
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn()
      };

      await expect(connectAssistantRedisClient(mockClient, { logger: mockLogger })).rejects.toThrow('ECONNREFUSED');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Assistant Redis client failed to connect',
        expect.objectContaining({ reasonCode: 'ASSISTANT_REDIS_CONNECT_FAILED' })
      );
    });

    test('closeAssistantRedisClient closes client cleanly via quit or disconnect', async () => {
      const mockClient = {
        isOpen: true,
        quit: jest.fn().mockResolvedValue()
      };
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn()
      };

      await closeAssistantRedisClient(mockClient, { logger: mockLogger });
      expect(mockClient.quit).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Assistant Redis client closed cleanly',
        expect.objectContaining({ reasonCode: 'ASSISTANT_REDIS_CLOSED' })
      );
    });

    test('pingAssistantRedisClient returns true when healthy and false when closed', async () => {
      const healthyClient = {
        isOpen: true,
        ping: jest.fn().mockResolvedValue('PONG')
      };
      expect(await pingAssistantRedisClient(healthyClient)).toBe(true);

      const closedClient = {
        isOpen: false,
        ping: jest.fn()
      };
      expect(await pingAssistantRedisClient(closedClient)).toBe(false);
    });
  });

  describe('Application & Server Lifecycle Composition Wiring', () => {
    test('createApp accepts injected redisClient and mounts distributed rate limiter', async () => {
      const redisConfig = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval',
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379'
      });

      const mockRedisClient = {
        isOpen: true,
        eval: jest.fn().mockResolvedValue([1, 60000]),
        ping: jest.fn().mockResolvedValue('PONG')
      };

      const app = createApp({
        assistantConfig: redisConfig,
        redisClient: mockRedisClient
      });

      const res = await request(app)
        .post('/api/assistant/chat')
        .send({ message: 'Shipping policy' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockRedisClient.eval).toHaveBeenCalled();
    });

    test('startServer fails closed and does not start HTTP server when Redis connection fails', async () => {
      const originalEnv = process.env.AI_RATE_LIMIT_STORE;
      const originalUrl = process.env.AI_RATE_LIMIT_REDIS_URL;
      const originalEnabled = process.env.AI_ASSISTANT_ENABLED;
      const originalMode = process.env.AI_ASSISTANT_MODE;

      process.env.AI_ASSISTANT_ENABLED = 'true';
      process.env.AI_ASSISTANT_MODE = 'retrieval';
      process.env.AI_RATE_LIMIT_STORE = 'redis';
      process.env.AI_RATE_LIMIT_REDIS_URL = 'redis://invalid-host:6379';

      const mockConnectDatabase = jest.fn().mockResolvedValue();
      const mockConnectRedis = jest.fn().mockRejectedValue(new Error('Redis connection refused'));
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
      };

      await expect(startServer({
        connectDatabase: mockConnectDatabase,
        connectRedis: mockConnectRedis,
        logger: mockLogger,
        loadEnvironment: () => {}
      })).rejects.toThrow('Redis connection refused');

      process.env.AI_RATE_LIMIT_STORE = originalEnv;
      process.env.AI_RATE_LIMIT_REDIS_URL = originalUrl;
      process.env.AI_ASSISTANT_ENABLED = originalEnabled;
      process.env.AI_ASSISTANT_MODE = originalMode;
    });

    test('createServerLifecycle invokes closeRedis on shutdown', async () => {
      const mockCloseRedis = jest.fn().mockResolvedValue();
      const mockCloseDb = jest.fn().mockResolvedValue();
      const mockServer = { close: jest.fn((cb) => cb()) };
      const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
      const mockExit = jest.fn();

      const lifecycle = createServerLifecycle({
        server: mockServer,
        closeDatabase: mockCloseDb,
        closeRedis: mockCloseRedis,
        logger: mockLogger,
        shutdownTimeoutMs: 1000,
        exit: mockExit
      });

      const result = await lifecycle.shutdown('SIGTERM');
      expect(result.clean).toBe(true);
      expect(mockCloseDb).toHaveBeenCalled();
      expect(mockCloseRedis).toHaveBeenCalled();
    });
  });

  describe('Readiness Check with Redis Distributed Store', () => {
    test('checkReadiness reports ready when Redis client is open and ping responds', async () => {
      const redisConfig = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval',
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379'
      });

      const mockRedisClient = {
        isOpen: true,
        ping: jest.fn().mockResolvedValue('PONG')
      };

      const mockDb = {
        readyState: 1,
        db: {
          admin: () => ({
            ping: jest.fn().mockResolvedValue({ ok: 1 })
          })
        }
      };

      const result = await checkReadiness({
        databaseConnection: mockDb,
        redisClient: mockRedisClient,
        assistantConfigProvider: () => redisConfig
      });

      expect(result.ready).toBe(true);
      expect(result.body.checks.redis).toBe('ready');
      expect(result.body.reasonCodes).toEqual([]);
    });

    test('checkReadiness reports not ready when Redis client is disconnected', async () => {
      const redisConfig = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval',
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379'
      });

      const mockRedisClient = {
        isOpen: false,
        ping: jest.fn()
      };

      const mockDb = {
        readyState: 1,
        db: {
          admin: () => ({
            ping: jest.fn().mockResolvedValue({ ok: 1 })
          })
        }
      };

      const result = await checkReadiness({
        databaseConnection: mockDb,
        redisClient: mockRedisClient,
        assistantConfigProvider: () => redisConfig
      });

      expect(result.ready).toBe(false);
      expect(result.body.checks.redis).toBe('not_ready');
      expect(result.body.reasonCodes).toContain(READINESS_CODES.REDIS_NOT_READY);
    });

    test('checkReadiness reports not ready when Redis ping fails', async () => {
      const redisConfig = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval',
        AI_RATE_LIMIT_STORE: 'redis',
        AI_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379'
      });

      const mockRedisClient = {
        isOpen: true,
        ping: jest.fn().mockRejectedValue(new Error('Connection lost'))
      };

      const mockDb = {
        readyState: 1,
        db: {
          admin: () => ({
            ping: jest.fn().mockResolvedValue({ ok: 1 })
          })
        }
      };

      const result = await checkReadiness({
        databaseConnection: mockDb,
        redisClient: mockRedisClient,
        assistantConfigProvider: () => redisConfig
      });

      expect(result.ready).toBe(false);
      expect(result.body.checks.redis).toBe('not_ready');
      expect(result.body.reasonCodes).toContain(READINESS_CODES.REDIS_PING_FAILED);
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
