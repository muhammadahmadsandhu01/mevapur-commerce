const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const EmailService = require('../../services/EmailService');
const SessionService = require('../../services/SessionService');
const TokenService = require('../../services/TokenService');
const crypto = require('crypto');

describe('Customer Registration & Email Verification Lifecycle', () => {
  const originalAutoVerify = process.env.AUTH_AUTO_VERIFY_EMAIL;
  let sendVerificationSpy;
  let sendWelcomeSpy;

  beforeEach(() => {
    process.env.AUTH_AUTO_VERIFY_EMAIL = 'false';
    sendVerificationSpy = jest.spyOn(EmailService, 'sendVerificationEmail').mockResolvedValue({ success: true });
    sendWelcomeSpy = jest.spyOn(EmailService, 'sendWelcomeEmail').mockResolvedValue({ success: true });
  });

  afterEach(() => {
    process.env.AUTH_AUTO_VERIFY_EMAIL = originalAutoVerify;
    if (sendVerificationSpy) sendVerificationSpy.mockRestore();
    if (sendWelcomeSpy) sendWelcomeSpy.mockRestore();
  });

  describe('1. Password Length & Complexity Validation', () => {
    it('rejects registration with an 11-character password (under minimum 12 requirement)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Short Password User',
          email: 'shortpass@example.com',
          password: 'Aa1!Short11', // 11 characters
          phone: '03001234567'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTH_VALIDATION_FAILED');
      expect(JSON.stringify(response.body)).toContain('at least 12 characters');
    });

    it('accepts registration with a valid 12-character enterprise compliant password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Valid Password User',
          email: 'validpass@example.com',
          password: 'Aa1!ValidPass', // 13 characters
          phone: '03001234567'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresEmailVerification).toBe(true);
    });
  });

  describe('2. Pending Registration & Email Verification Link Dispatch', () => {
    it('creates unverified account without session or cookies, storing token hash with 24h expiry', async () => {
      const email = 'pending-reg@example.com';
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Pending Verification User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567',
          redirect: '/checkout'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresEmailVerification).toBe(true);
      expect(response.body.data.emailDeliveryFailed).toBe(false);
      expect(response.body.data).not.toHaveProperty('accessToken');
      expect(response.body.data).not.toHaveProperty('refreshToken');

      // Assert no session/auth cookies were set
      const setCookieHeader = response.headers['set-cookie'] || [];
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : setCookieHeader;
      expect(cookieStr).not.toContain('refreshToken=');

      // Assert DB user state
      const dbUser = await User.findOne({ email }).select('+emailVerificationTokenHash +emailVerificationExpiresAt +tokenVersion');
      expect(dbUser).toBeTruthy();
      expect(dbUser.isVerified).toBe(false);
      expect(dbUser.emailVerificationTokenHash).toEqual(expect.any(String));
      expect(dbUser.emailVerificationExpiresAt).toBeInstanceOf(Date);
      expect(dbUser.emailVerificationExpiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

      // Assert EmailService dispatch
      expect(sendVerificationSpy).toHaveBeenCalledTimes(1);
      expect(sendVerificationSpy).toHaveBeenCalledWith(
        email,
        'Pending Verification User',
        expect.any(String),
        { redirect: '/checkout' }
      );

      const dispatchedPlainToken = sendVerificationSpy.mock.calls[0][2];
      const expectedHash = SessionService.hashToken(dispatchedPlainToken);
      expect(dbUser.emailVerificationTokenHash).toBe(expectedHash);
    });

    it('rejects unverified login attempt with HTTP 403 AUTH_EMAIL_NOT_VERIFIED', async () => {
      const email = 'unverified-login@example.com';
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Unverified Login User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567'
        });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Violet!9Mountain'
        });

      expect(loginRes.statusCode).toBe(403);
      expect(loginRes.body.success).toBe(false);
      expect(loginRes.body.error.code).toBe('AUTH_EMAIL_NOT_VERIFIED');
    });
  });

  describe('3. Safe Redirect Contract in Email Service', () => {
    it('preserves valid internal relative paths like /checkout in email link', async () => {
      sendVerificationSpy.mockRestore();
      const originalSend = EmailService.send;
      let capturedEmailData = null;
      EmailService.send = jest.fn().mockImplementation((data) => {
        capturedEmailData = data;
        return Promise.resolve({ success: true, reason: 'EMAIL_SMTP_MOCKED' });
      });

      try {
        await EmailService.sendVerificationEmail(
          'user@example.com',
          'Test User',
          'raw-token-123',
          { redirect: '/checkout?step=payment' }
        );

        expect(capturedEmailData).toBeTruthy();
        expect(capturedEmailData.html).toContain('/verify-email?token=raw-token-123&amp;redirect=%2Fcheckout%3Fstep%3Dpayment');
        expect(capturedEmailData.text).toContain('/verify-email?token=raw-token-123&redirect=%2Fcheckout%3Fstep%3Dpayment');
      } finally {
        EmailService.send = originalSend;
        sendVerificationSpy = jest.spyOn(EmailService, 'sendVerificationEmail').mockResolvedValue({ success: true });
      }
    });

    it('strips unsafe external, protocol-relative, or backslash URLs from email link', async () => {
      sendVerificationSpy.mockRestore();
      const originalSend = EmailService.send;
      let capturedEmailData = null;
      EmailService.send = jest.fn().mockImplementation((data) => {
        capturedEmailData = data;
        return Promise.resolve({ success: true, reason: 'EMAIL_SMTP_MOCKED' });
      });

      try {
        const unsafePayloads = [
          'https://evil.com/phish',
          '//evil.com/phish',
          '/\\evil.com',
          'javascript:alert(1)',
          'data:text/html,evil'
        ];

        for (const unsafe of unsafePayloads) {
          await EmailService.sendVerificationEmail(
            'user@example.com',
            'Test User',
            'raw-token-123',
            { redirect: unsafe }
          );

          expect(capturedEmailData.html).not.toContain('evil.com');
          expect(capturedEmailData.html).not.toContain('javascript');
          expect(capturedEmailData.html).not.toContain('data:');
          expect(capturedEmailData.html).toContain('/verify-email?token=raw-token-123');
        }
      } finally {
        EmailService.send = originalSend;
        sendVerificationSpy = jest.spyOn(EmailService, 'sendVerificationEmail').mockResolvedValue({ success: true });
      }
    });
  });

  describe('4. Email Verification Verification Lifecycle & Fresh Login Enforcement', () => {
    it('verifies pending account on valid token, clears token state, and sends welcome email', async () => {
      const email = 'verify-success@example.com';
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Verify Success User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567'
        });

      const token = sendVerificationSpy.mock.calls[0][2];

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token });

      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.user.isVerified).toBe(true);

      // Check DB state
      const dbUser = await User.findOne({ email }).select('+emailVerificationTokenHash +emailVerificationExpiresAt');
      expect(dbUser.isVerified).toBe(true);
      expect(dbUser.emailVerificationTokenHash).toBeFalsy();
      expect(dbUser.emailVerificationExpiresAt).toBeFalsy();

      // Check Welcome Email
      expect(sendWelcomeSpy).toHaveBeenCalledWith(email, 'Verify Success User');

      // Verified user can now log in
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Violet!9Mountain' });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.data.accessToken).toBeTruthy();
    });

    it('rejects token reuse with 400 AUTH_INVALID_TOKEN', async () => {
      const email = 'single-use@example.com';
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Single Use User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567'
        });

      const token = sendVerificationSpy.mock.calls[0][2];

      // First verification succeeds
      const firstRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token });
      expect(firstRes.statusCode).toBe(200);

      // Second verification fails
      const secondRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token });
      expect(secondRes.statusCode).toBe(400);
      expect(secondRes.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });

    it('rejects expired verification tokens with 400 AUTH_INVALID_TOKEN', async () => {
      const email = 'expired-token@example.com';
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Expired Token User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567'
        });

      const token = sendVerificationSpy.mock.calls[0][2];

      // Artificially expire the token in DB
      await User.updateOne(
        { email },
        { $set: { emailVerificationExpiresAt: new Date(Date.now() - 1000) } }
      );

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token });

      expect(verifyRes.statusCode).toBe(400);
      expect(verifyRes.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });

    it('rejects malformed or non-existent token with 400 AUTH_INVALID_TOKEN', async () => {
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'non-existent-token-123456789' });

      expect(verifyRes.statusCode).toBe(400);
      expect(verifyRes.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });
  });

  describe('5. Resend Verification & Enumeration Neutrality', () => {
    it('rotates verification token, revokes prior sessions, and dispatches fresh email for unverified user', async () => {
      const email = 'resend-user@example.com';
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Resend User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567'
        });

      const firstToken = sendVerificationSpy.mock.calls[0][2];
      sendVerificationSpy.mockClear();

      const resendRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email, redirect: '/checkout' });

      expect(resendRes.statusCode).toBe(200);
      expect(resendRes.body.success).toBe(true);
      expect(resendRes.body.message).toContain('If an');

      expect(sendVerificationSpy).toHaveBeenCalledTimes(1);
      const secondToken = sendVerificationSpy.mock.calls[0][2];
      expect(secondToken).not.toBe(firstToken);

      // Old token no longer works
      const oldVerifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: firstToken });
      expect(oldVerifyRes.statusCode).toBe(400);

      // New token works
      const newVerifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: secondToken });
      expect(newVerifyRes.statusCode).toBe(200);
    });

    it('returns enumeration-neutral 200 response without dispatching email for already-verified or non-existent accounts', async () => {
      // Non-existent email
      sendVerificationSpy.mockClear();
      const nonExistentRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'ghost@example.com' });

      expect(nonExistentRes.statusCode).toBe(200);
      expect(nonExistentRes.body.success).toBe(true);
      expect(sendVerificationSpy).not.toHaveBeenCalled();

      // Already-verified email
      await createTestUser({
        email: 'already-verified@example.com',
        password: 'Violet!9Mountain',
        isVerified: true
      });

      const verifiedRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'already-verified@example.com' });

      expect(verifiedRes.statusCode).toBe(200);
      expect(verifiedRes.body.success).toBe(true);
      expect(sendVerificationSpy).not.toHaveBeenCalled();
    });
  });

  describe('6. Legacy Session Revocation Regression Test', () => {
    it('proves a session/token issued to an unverified user cannot be used after email verification', async () => {
      // 1. Create unverified user
      const email = 'legacy-session@example.com';
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Legacy Session User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567'
        });

      const user = await User.findOne({ email });
      const verificationToken = sendVerificationSpy.mock.calls[0][2];

      // 2. Simulate a legacy pre-verification session and tokens (as if issued by previous insecure flow)
      const sessionId = SessionService.createSessionId();
      const initialTokenVersion = Number(user.tokenVersion || 0);
      const preVerificationAccessToken = TokenService.generateAccessToken({
        userId: user._id,
        sessionId,
        tokenVersion: initialTokenVersion
      });
      const preVerificationRefreshToken = TokenService.generateRefreshToken({
        userId: user._id,
        sessionId,
        tokenVersion: initialTokenVersion,
        tokenFamilyId: crypto.randomUUID()
      });

      await SessionService.createSession({
        sessionId,
        userId: user._id,
        refreshToken: preVerificationRefreshToken,
        tokenFamilyId: crypto.randomUUID(),
        deviceInfo: { deviceName: 'Legacy Device' },
        ipAddress: '127.0.0.1',
        userAgent: 'Legacy Test Client'
      });

      // 3. Before verification: attempt to access /me with preVerificationAccessToken -> rejected with 403 AUTH_EMAIL_NOT_VERIFIED
      const preMeRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${preVerificationAccessToken}`);

      expect(preMeRes.statusCode).toBe(403);
      expect(preMeRes.body.error.code).toBe('AUTH_EMAIL_NOT_VERIFIED');

      // 4. Perform Email Verification
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken });

      expect(verifyRes.statusCode).toBe(200);

      // 5. REGRESSION PROOF: attempt to access /me with the OLD pre-verification token after verification completes
      // It must be rejected because tokenVersion incremented and pre-verification sessions were revoked!
      const postMeRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${preVerificationAccessToken}`);

      expect(postMeRes.statusCode).toBe(401);
      expect(postMeRes.body.error.code).toBe('AUTH_TOKEN_VERSION_MISMATCH');

      // Attempting to refresh with the old refresh token must also fail
      const csrfRes = await request(app).get('/api/v1/auth/csrf-token');
      const csrfToken = csrfRes.body.data.csrfToken;
      const csrfCookies = csrfRes.headers['set-cookie'] || [];

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${preVerificationRefreshToken}`, ...csrfCookies])
        .set('X-CSRF-Token', csrfToken);

      expect(refreshRes.statusCode).toBe(401);

      // 6. Only a fresh login issues a new, valid token
      const freshLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Violet!9Mountain' });

      expect(freshLoginRes.statusCode).toBe(200);
      const freshAccessToken = freshLoginRes.body.data.accessToken;

      const validMeRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${freshAccessToken}`);

      expect(validMeRes.statusCode).toBe(200);
      expect(validMeRes.body.data.user.email).toBe(email);
    });
  });

  describe('7. SMTP Delivery Failure Recovery', () => {
    it('keeps unverified account recoverable via resend without tokens/cookies or duplicate-account deadlock when SMTP fails', async () => {
      // Simulate SMTP transport error
      sendVerificationSpy.mockRejectedValueOnce(new Error('SMTP connection timed out'));

      const email = 'smtp-fail@example.com';
      const regResponse = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'SMTP Failure User',
          email,
          password: 'Violet!9Mountain',
          phone: '03001234567'
        });

      // Assert non-secret, actionable response
      expect(regResponse.statusCode).toBe(201);
      expect(regResponse.body.success).toBe(true);
      expect(regResponse.body.data.requiresEmailVerification).toBe(true);
      expect(regResponse.body.data.emailDeliveryFailed).toBe(true);
      expect(regResponse.body.message).toContain('verification email could not be sent');

      // Assert no session/tokens issued
      expect(regResponse.body.data).not.toHaveProperty('accessToken');
      const setCookieHeader = regResponse.headers['set-cookie'] || [];
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : setCookieHeader;
      expect(cookieStr).not.toContain('refreshToken=');

      // Assert unverified user exists in DB
      const user = await User.findOne({ email });
      expect(user).toBeTruthy();
      expect(user.isVerified).toBe(false);

      // Assert recovery via resend works seamlessly
      sendVerificationSpy.mockResolvedValueOnce({ success: true });

      const resendResponse = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email });

      expect(resendResponse.statusCode).toBe(200);
      expect(sendVerificationSpy).toHaveBeenCalledWith(
        email,
        'SMTP Failure User',
        expect.any(String),
        { redirect: undefined }
      );

      const recoveredToken = sendVerificationSpy.mock.calls[1][2];

      // User can complete verification with the recovered token
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: recoveredToken });

      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body.data.user.isVerified).toBe(true);
    });
  });
});
