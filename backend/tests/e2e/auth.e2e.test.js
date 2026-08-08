const request = require('supertest');
const app = require('../../app');
const AuditLog = require('../../models/AuditLog');
const Session = require('../../models/Session');
const User = require('../../models/User');

const password = 'Violet!9Mountain';

const register = (agent, email) => agent
  .post('/api/v1/auth/register')
  .send({
    fullName: 'E2E User',
    email,
    password,
    phone: '03001234567',
  });

describe('Authentication session lifecycle', () => {
  it('registers, lists the current session, and revokes it on logout', async () => {
    const agent = request.agent(app);
    const registered = await register(agent, 'lifecycle@example.com');
    const { accessToken, csrfToken } = registered.body.data;

    const sessions = await agent
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(sessions.statusCode).toBe(200);
    expect(sessions.body.data.sessions).toHaveLength(1);
    expect(sessions.body.data.sessions[0]).toMatchObject({
      isCurrent: true,
    });
    expect(sessions.body.data.sessions[0]).not.toHaveProperty(
      'refreshTokenHash'
    );

    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(logout.statusCode).toBe(200);

    const rejected = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(rejected.statusCode).toBe(401);
    expect(rejected.body.error.code).toBe('AUTH_SESSION_REVOKED');

    const events = await AuditLog.find({
      eventName: { $in: ['AUTH.REGISTER', 'AUTH.LOGOUT'] },
    });
    expect(events.map((event) => event.eventName)).toEqual(
      expect.arrayContaining(['AUTH.REGISTER', 'AUTH.LOGOUT'])
    );
  });

  it('logout-all revokes every session and invalidates issued access tokens', async () => {
    await createTestUser({
      email: 'logout-all@example.com',
      password,
    });

    const firstAgent = request.agent(app);
    const secondAgent = request.agent(app);
    const firstLogin = await firstAgent
      .post('/api/v1/auth/login')
      .send({ email: 'logout-all@example.com', password });
    const secondLogin = await secondAgent
      .post('/api/v1/auth/login')
      .send({ email: 'logout-all@example.com', password });

    const logoutAll = await firstAgent
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${firstLogin.body.data.accessToken}`)
      .set('X-CSRF-Token', firstLogin.body.data.csrfToken)
      .send({});

    expect(logoutAll.statusCode).toBe(200);
    expect(logoutAll.body.data.sessionsRevoked).toBe(2);
    expect(await Session.countDocuments({ isActive: true })).toBe(0);

    const rejected = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${secondLogin.body.data.accessToken}`);

    expect(rejected.statusCode).toBe(401);
    expect(rejected.body.error.code).toBe(
      'AUTH_TOKEN_VERSION_MISMATCH'
    );
  });

  it('rejects an access token when the current tokenVersion changes', async () => {
    const agent = request.agent(app);
    const registered = await register(agent, 'version@example.com');
    const user = await User.findOne({ email: 'version@example.com' });

    await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`);

    expect(response.statusCode).toBe(401);
    expect(response.body.error.code).toBe(
      'AUTH_TOKEN_VERSION_MISMATCH'
    );
  });

  it('rejects cookie-authenticated mutations without a CSRF header', async () => {
    const agent = request.agent(app);
    const registered = await register(agent, 'csrf@example.com');

    const response = await agent
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`)
      .send({});

    expect(response.statusCode).toBe(403);
    expect(response.body.error.code).toBe('AUTH_CSRF_INVALID');
    expect(await Session.countDocuments({ isActive: true })).toBe(1);
  });
});
