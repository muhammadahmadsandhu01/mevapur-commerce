const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Session = require('../models/Session');
const EmailService = require('../services/EmailService');

const password = 'Violet!9Mountain';
const changedPassword = 'Quartz!7VelvetMoon';

describe('Authentication password flows', () => {
  it('stores only a reset-token hash and saves the new password through hashing', async () => {
    const user = await createTestUser({
      email: 'reset@example.com',
      password,
    });
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: user.email, password });
    const oldAccessToken = login.body.data.accessToken;

    let deliveredResetToken;
    jest.spyOn(EmailService, 'sendPasswordResetEmail')
      .mockImplementation(async (email, fullName, resetToken) => {
        deliveredResetToken = resetToken;
        return { success: true };
      });

    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: user.email });

    expect(forgot.statusCode).toBe(200);
    expect(forgot.body).not.toHaveProperty('resetToken');
    expect(JSON.stringify(forgot.body)).not.toContain(deliveredResetToken);

    const pendingUser = await User.findById(user._id).select(
      '+resetPasswordTokenHash +resetPasswordExpiresAt'
    );
    expect(pendingUser.resetPasswordTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pendingUser.resetPasswordTokenHash).not.toBe(deliveredResetToken);

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({
        resetToken: deliveredResetToken,
        newPassword: changedPassword,
      });

    expect(reset.statusCode).toBe(200);

    const savedUser = await User.findById(user._id).select(
      '+password +tokenVersion +resetPasswordTokenHash'
    );
    expect(savedUser.password).not.toBe(changedPassword);
    expect(await savedUser.matchPassword(changedPassword)).toBe(true);
    expect(savedUser.resetPasswordTokenHash).toBeNull();
    expect(savedUser.tokenVersion).toBe(1);
    expect(await Session.countDocuments({ isActive: true })).toBe(0);

    const oldTokenResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldAccessToken}`);
    expect(oldTokenResponse.statusCode).toBe(401);
  });

  it('changes a password, revokes sessions, and accepts only the new password', async () => {
    const agent = request.agent(app);
    const registered = await agent
      .post('/api/auth/register')
      .send({
        fullName: 'Change Password',
        email: 'change@example.com',
        password,
        phone: '03001234567',
      });

    const changed = await agent
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`)
      .set('X-CSRF-Token', registered.body.data.csrfToken)
      .send({
        currentPassword: password,
        newPassword: changedPassword,
      });

    expect(changed.statusCode).toBe(200);
    expect(await Session.countDocuments({ isActive: true })).toBe(0);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'change@example.com', password });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'change@example.com', password: changedPassword });
    expect(newLogin.statusCode).toBe(200);
  });

  it('locks an account after the configured failed-login threshold', async () => {
    await createTestUser({
      email: 'locked@example.com',
      password,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'locked@example.com',
          password: 'Wrong!8Password',
        });
      expect(response.statusCode).toBe(401);
    }

    const locked = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'locked@example.com',
        password: 'Wrong!8Password',
      });

    expect(locked.statusCode).toBe(423);
    expect(locked.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
  });
});
