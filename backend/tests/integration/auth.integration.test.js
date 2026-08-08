const request = require('supertest');
const app = require('../../app');

const password = 'Violet!9Mountain';

const setCookies = (response) => {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header : [header].filter(Boolean);
};

const cookiePair = (response, name) => {
  const cookie = setCookies(response).find((value) =>
    value.startsWith(`${name}=`)
  );
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return cookie.split(';')[0];
};

const register = (agent, email) => agent
  .post('/api/v1/auth/register')
  .send({
    fullName: 'Integration User',
    email,
    password,
    phone: '03001234567',
  });

describe('Auth HTTP contract', () => {
  it('registers with an HttpOnly refresh cookie and JSON access token only', async () => {
    const agent = request.agent(app);
    const response = await register(agent, 'register@example.com');

    expect(response.statusCode).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe('register@example.com');
    expect(response.body.data).not.toHaveProperty('refreshToken');

    const refreshCookie = setCookies(response).find((value) =>
      value.startsWith('refreshToken=')
    );
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api');

    const rawRefreshToken = refreshCookie.split(';')[0].split('=')[1];
    expect(JSON.stringify(response.body)).not.toContain(rawRefreshToken);
  });

  it('uses the canonical validation error envelope', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Invalid User',
        email: 'not-an-email',
        password,
      });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'AUTH_VALIDATION_FAILED',
      },
      meta: {
        requestId: expect.any(String),
      },
    });
  });

  it('logs in and validates the access-token session on /me', async () => {
    await createTestUser({
      email: 'login@example.com',
      password,
    });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password });

    expect(response.statusCode).toBe(200);
    expect(response.body.data).not.toHaveProperty('refreshToken');

    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`);

    expect(profile.statusCode).toBe(200);
    expect(profile.body.data.user.email).toBe('login@example.com');
  });

  it('never accepts a refresh token from the JSON request body', async () => {
    const agent = request.agent(app);
    const registered = await register(agent, 'body-refresh@example.com');
    const refreshPair = cookiePair(registered, 'refreshToken');
    const rawRefreshToken = refreshPair.slice(refreshPair.indexOf('=') + 1);
    const csrfPair = cookiePair(registered, 'csrfToken');
    const csrfToken = registered.body.data.csrfToken;

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', csrfPair)
      .set('X-CSRF-Token', csrfToken)
      .send({ refreshToken: rawRefreshToken });

    expect(response.statusCode).toBe(401);
    expect(response.body.error.code).toBe('AUTH_TOKEN_REQUIRED');
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const agent = request.agent(app);
    const registered = await register(agent, 'rotation@example.com');
    const oldRefreshPair = cookiePair(registered, 'refreshToken');
    const oldCsrfPair = cookiePair(registered, 'csrfToken');
    const oldCsrfToken = registered.body.data.csrfToken;

    const refreshed = await agent
      .post('/api/v1/auth/refresh')
      .set('X-CSRF-Token', oldCsrfToken)
      .send({});

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.data).not.toHaveProperty('refreshToken');

    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [oldRefreshPair, oldCsrfPair])
      .set('X-CSRF-Token', oldCsrfToken)
      .send({});

    expect(reused.statusCode).toBe(401);
    expect(reused.body.error.code).toBe('AUTH_TOKEN_REUSE_DETECTED');

    const revokedFamily = await agent
      .post('/api/v1/auth/refresh')
      .set('X-CSRF-Token', refreshed.body.data.csrfToken)
      .send({});

    expect(revokedFamily.statusCode).toBe(401);
    expect(revokedFamily.body.error.code).toBe('AUTH_SESSION_REVOKED');
  });
});
