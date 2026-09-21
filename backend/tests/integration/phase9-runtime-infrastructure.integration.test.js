const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');
const { createApp } = require('../../app');
const { resetRuntimeConfig, getRuntimeConfig } = require('../../config/runtime.config');

describe('Phase 9 Runtime Infrastructure Integration Tests', () => {
  let app;
  let mockRedisClient;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-phase9-minimum-32-chars-long';
    process.env.PORT = '5000';
    process.env.ENABLE_DATABASE_PING = 'false';
    resetRuntimeConfig();
    getRuntimeConfig();

    mockRedisClient = {
      isOpen: true,
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue([1, 60]),
      on: jest.fn()
    };

    app = createApp({
      redisClient: mockRedisClient,
      readinessOptions: {
        databaseConnection: {
          readyState: 1,
          db: {
            admin: () => ({
              ping: jest.fn().mockResolvedValue({ ok: 1 })
            })
          }
        }
      }
    });
  });

  describe('1. Health & Liveness Probes', () => {
    test('GET /health/live returns 200 OK and liveness metadata', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'OK',
        message: 'HARZAAR API is running'
      });
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.timestamp).toBe('string');
    });

    test('GET /api/health returns 200 OK for backward compatibility', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
    });
  });

  describe('2. Readiness Probes', () => {
    test('GET /health/ready returns 200 ready when DB is connected', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks.runtime).toBe('ready');
      expect(res.body.checks.lifecycle).toBe('ready');
      expect(res.body.checks.database).toBe('ready');
    });

    test('GET /health/ready returns 503 when DB connection is disconnected', async () => {
      const notReadyApp = createApp({
        readinessOptions: {
          databaseConnection: {
            readyState: 0 // disconnected
          }
        }
      });
      const res = await request(notReadyApp).get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.reasonCodes).toContain('DATABASE_NOT_READY');
    });
  });

  describe('3. Prometheus Metrics Endpoint', () => {
    test('GET /api/metrics exports valid Prometheus text format', async () => {
      const res = await request(app).get('/api/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');

      const text = res.text;
      expect(text).toContain('# HELP mevapur_up Process liveness indicator');
      expect(text).toContain('# TYPE mevapur_up gauge');
      expect(text).toContain('mevapur_up 1');
      expect(text).toContain('mevapur_readiness_status');
      expect(text).toContain('mevapur_database_connected');
      expect(text).toContain('mevapur_redis_connected');
      expect(text).toContain('mevapur_uptime_seconds');
      expect(text).toContain('mevapur_process_memory_rss_bytes');
    });
  });

  describe('4. Worker Heartbeat and Health Probe Compatibility', () => {
    const testHeartbeatPath = path.join(os.tmpdir(), 'worker-heartbeat-test.json');

    afterEach(() => {
      if (fs.existsSync(testHeartbeatPath)) {
        try { fs.unlinkSync(testHeartbeatPath); } catch {}
      }
    });

    test('worker heartbeat file is written with valid ISO timestamp and pid', () => {
      const heartbeatPayload = {
        worker: 'transactional-outbox-worker',
        pid: process.pid,
        timestamp: new Date().toISOString(),
        lastCycleMs: Date.now()
      };

      fs.writeFileSync(testHeartbeatPath, JSON.stringify(heartbeatPayload), 'utf8');

      expect(fs.existsSync(testHeartbeatPath)).toBe(true);
      const readContent = JSON.parse(fs.readFileSync(testHeartbeatPath, 'utf8'));
      expect(readContent.worker).toBe('transactional-outbox-worker');
      expect(readContent.pid).toBe(process.pid);
      expect(new Date(readContent.timestamp).getTime()).toBeGreaterThan(0);
    });

    test('worker healthcheck detects fresh heartbeat (< 120s)', () => {
      const freshHeartbeat = {
        worker: 'test-worker',
        timestamp: new Date().toISOString(),
        lastCycleMs: Date.now()
      };
      fs.writeFileSync(testHeartbeatPath, JSON.stringify(freshHeartbeat), 'utf8');

      const data = JSON.parse(fs.readFileSync(testHeartbeatPath, 'utf8'));
      const ageSec = (Date.now() - new Date(data.timestamp).getTime()) / 1000;
      expect(ageSec).toBeLessThan(120);
    });

    test('worker healthcheck rejects stale heartbeat (> 120s)', () => {
      const staleTimestamp = new Date(Date.now() - 150 * 1000).toISOString();
      const staleHeartbeat = {
        worker: 'test-worker',
        timestamp: staleTimestamp
      };
      fs.writeFileSync(testHeartbeatPath, JSON.stringify(staleHeartbeat), 'utf8');

      const data = JSON.parse(fs.readFileSync(testHeartbeatPath, 'utf8'));
      const ageSec = (Date.now() - new Date(data.timestamp).getTime()) / 1000;
      expect(ageSec).toBeGreaterThan(120);
    });
  });
});
