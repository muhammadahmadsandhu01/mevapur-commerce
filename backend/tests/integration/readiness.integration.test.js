const request = require('supertest');
const app = require('../../app');
const lifecycleState = require('../../operations/lifecycleState');

describe('P5B operational health integration', () => {
  beforeEach(() => {
    lifecycleState.markRunning();
  });

  afterEach(() => {
    lifecycleState.markRunning();
  });

  test('preserves liveness and exposes separate database readiness', async () => {
    const liveness = await request(app).get('/api/health');
    const readiness = await request(app).get('/api/ready');

    expect(liveness.status).toBe(200);
    expect(liveness.body.status).toBe('OK');
    expect(liveness.body.message).toBe('HARZAAR API is running');
    expect(liveness.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'"
    );
    expect(liveness.headers['content-security-policy']).toContain(
      "object-src 'none'"
    );
    expect(liveness.headers['content-security-policy']).not.toContain(
      'stripe.com'
    );
    expect(liveness.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests'
    );
    expect(liveness.headers['x-frame-options']).toBe('DENY');
    expect(readiness.status).toBe(200);
    expect(readiness.body).toEqual({
      status: 'ready',
      checks: {
        runtime: 'ready',
        lifecycle: 'ready',
        database: 'ready'
      },
      reasonCodes: []
    });
  });

  test('readiness returns sanitized 503 while shutting down', async () => {
    lifecycleState.beginShutdown();

    const response = await request(app).get('/api/ready');
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(503);
    expect(response.body.reasonCodes).toContain('SHUTTING_DOWN');
    expect(serialized).not.toMatch(/mongodb|hostname|username|stack/i);
  });

  test('test runtime keeps the legacy uploads route fail closed', async () => {
    const response = await request(app).get('/uploads/not-present.txt');

    expect(response.status).toBe(404);
  });
});
