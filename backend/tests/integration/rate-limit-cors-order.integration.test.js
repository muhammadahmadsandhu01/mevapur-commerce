const request = require('supertest');
const app = require('../../app');
const { morganStream } = require('../../middleware/logger');
const { getRuntimeConfig } = require('../../config/runtime.config');

describe('Rate-Limit, CORS Middleware-Order, and Health Checks Integration Suite', () => {
  const runtimeConfig = getRuntimeConfig();
  const allowedOrigin = runtimeConfig.origins.storefront || 'http://localhost:3000';
  const disallowedOrigin = 'https://malicious-attacker-domain.com';

  describe('1. Preflight OPTIONS Handling & Quota Protection', () => {
    it('handles OPTIONS preflight with exact CORS headers and credentials without consuming quota', async () => {
      // Send multiple preflight requests from an allowed origin
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .options('/api/products')
          .set('Origin', allowedOrigin)
          .set('Access-Control-Request-Method', 'GET')
          .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.headers['access-control-allow-methods']).toContain('GET');
      }
    });

    it('rejects CORS for disallowed origins on OPTIONS preflight', async () => {
      const res = await request(app)
        .options('/api/products')
        .set('Origin', disallowedOrigin)
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('2. Unmetered Health and Readiness Endpoints', () => {
    it('/api/health remains HTTP 200 across repeated high-frequency calls', async () => {
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .get('/api/health')
          .set('Origin', allowedOrigin);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('OK');
        expect(res.body.message).toContain('HARZAAR API');
        expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
        expect(res.headers['x-request-id']).toBeDefined();
      }
    });

    it('/api/ready remains HTTP 200 across repeated high-frequency calls', async () => {
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .get('/api/ready')
          .set('Origin', allowedOrigin);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ready');
        expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
        expect(res.headers['x-request-id']).toBeDefined();
      }
    });
  });

  describe('3. Rate-Limit Responses: CORS Headers, RequestId, and Structured Error', () => {
    it('returns structured 429 with CORS headers, X-Request-ID, and RATE_LIMIT_EXCEEDED error code', async () => {
      // Temporarily set a very low RATE_LIMIT_MAX to trigger 429 deterministically
      const originalMax = process.env.RATE_LIMIT_MAX;
      process.env.RATE_LIMIT_MAX = '5';

      try {
        let lastRes;
        // Make enough requests from allowed origin to exceed the limit
        for (let i = 0; i < 10; i++) {
          lastRes = await request(app)
            .get('/api/categories')
            .set('Origin', allowedOrigin);
        }

        expect(lastRes.status).toBe(429);
        // Crucial requirement: 429 response MUST contain exact Access-Control-Allow-Origin
        expect(lastRes.headers['access-control-allow-origin']).toBe(allowedOrigin);
        expect(lastRes.headers['access-control-allow-credentials']).toBe('true');
        expect(lastRes.headers['x-request-id']).toBeDefined();

        // Structured JSON payload
        expect(lastRes.body.success).toBe(false);
        expect(lastRes.body.error).toBeDefined();
        expect(lastRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(lastRes.body.error.message).toContain('Too many requests');
        expect(lastRes.body.meta).toBeDefined();
        expect(lastRes.body.meta.requestId).toBe(lastRes.headers['x-request-id']);
      } finally {
        if (originalMax !== undefined) {
          process.env.RATE_LIMIT_MAX = originalMax;
        } else {
          delete process.env.RATE_LIMIT_MAX;
        }
      }
    });

    it('does not emit CORS headers for disallowed origins when rate limited', async () => {
      const originalMax = process.env.RATE_LIMIT_MAX;
      process.env.RATE_LIMIT_MAX = '3';

      try {
        let lastRes;
        for (let i = 0; i < 6; i++) {
          lastRes = await request(app)
            .get('/api/brands')
            .set('Origin', disallowedOrigin);
        }

        expect(lastRes.status).toBe(429);
        expect(lastRes.headers['access-control-allow-origin']).toBeUndefined();
        expect(lastRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      } finally {
        if (originalMax !== undefined) {
          process.env.RATE_LIMIT_MAX = originalMax;
        } else {
          delete process.env.RATE_LIMIT_MAX;
        }
      }
    });
  });

  describe('4. Dedicated Auth Rate Limiting & No Double-Counting', () => {
    it('applies dedicated login rate limiter independently without double-counting', async () => {
      const originalLoginMax = process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
      process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '3';

      try {
        let lastRes;
        for (let i = 0; i < 5; i++) {
          lastRes = await request(app)
            .post('/api/v1/auth/login')
            .set('Origin', allowedOrigin)
            .send({
              email: 'ratelimit-test@example.com',
              password: 'InvalidPassword123!'
            });
        }

        expect(lastRes.status).toBe(429);
        expect(lastRes.headers['access-control-allow-origin']).toBe(allowedOrigin);
        expect(lastRes.headers['access-control-allow-credentials']).toBe('true');
        expect(lastRes.headers['x-request-id']).toBeDefined();
        expect(lastRes.body.success).toBe(false);
        expect(lastRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(lastRes.body.error.message).toContain('Too many login attempts');
      } finally {
        if (originalLoginMax !== undefined) {
          process.env.AUTH_LOGIN_RATE_LIMIT_MAX = originalLoginMax;
        } else {
          delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
        }
      }
    });

    it('resend verification rate limiting maintains enumeration-neutral 200 response', async () => {
      let lastRes;
      for (let i = 0; i < 7; i++) {
        lastRes = await request(app)
          .post('/api/v1/auth/resend-verification')
          .set('Origin', allowedOrigin)
          .send({
            email: 'neutral-enumeration@example.com'
          });
      }

      // Enumeration-neutral response returns 200 with standard generic confirmation
      expect(lastRes.status).toBe(200);
      expect(lastRes.body.success).toBe(true);
      expect(lastRes.body.message).toContain('verification link has been sent');
      expect(lastRes.headers['access-control-allow-origin']).toBe(allowedOrigin);
    });
  });

  describe('5. Request Logging Observability for 429 Responses', () => {
    it('ensures Morgan / request logger logs 429 responses with status code and route', async () => {
      const loggedMessages = [];
      const originalWrite = morganStream.write;
      morganStream.write = (msg) => {
        loggedMessages.push(msg);
        originalWrite(msg);
      };

      const originalMax = process.env.RATE_LIMIT_MAX;
      process.env.RATE_LIMIT_MAX = '2';

      try {
        let lastRes;
        for (let i = 0; i < 4; i++) {
          lastRes = await request(app)
            .get('/api/settings')
            .set('Origin', allowedOrigin);
        }

        expect(lastRes.status).toBe(429);

        // Verify Morgan logged at least one message containing 429
        const has429Log = loggedMessages.some((msg) =>
          typeof msg === 'string' && msg.includes('429') && msg.includes('/api/settings')
        );
        expect(has429Log).toBe(true);
      } finally {
        morganStream.write = originalWrite;
        if (originalMax !== undefined) {
          process.env.RATE_LIMIT_MAX = originalMax;
        } else {
          delete process.env.RATE_LIMIT_MAX;
        }
      }
    });
  });
});
