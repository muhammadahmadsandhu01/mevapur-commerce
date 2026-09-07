const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const { resetRuntimeConfig } = require('../../config/runtime.config');

describe('Brevo HTTPS Transactional Email Integration', () => {
  const originalFetch = global.fetch;
  const originalAutoVerify = process.env.AUTH_AUTO_VERIFY_EMAIL;
  const originalEmailMode = process.env.EMAIL_MODE;
  const originalApiKey = process.env.BREVO_API_KEY;
  const originalFromAddress = process.env.EMAIL_FROM_ADDRESS;
  const originalFromName = process.env.EMAIL_FROM_NAME;
  const originalBrandName = process.env.EMAIL_BRAND_NAME;

  const validPassword = 'Violet!9Mountain';

  beforeAll(() => {
    process.env.EMAIL_MODE = 'brevo';
    process.env.BREVO_API_KEY = 'xkeysib-live-test-key-777';
    process.env.EMAIL_FROM_ADDRESS = 'sender@harzaar.com';
    process.env.EMAIL_FROM_NAME = 'HARZAAR Demo';
    process.env.EMAIL_BRAND_NAME = 'HARZAAR Integration Test';
    resetRuntimeConfig();
  });

  afterAll(() => {
    process.env.EMAIL_MODE = originalEmailMode;
    process.env.BREVO_API_KEY = originalApiKey;
    process.env.EMAIL_FROM_ADDRESS = originalFromAddress;
    process.env.EMAIL_FROM_NAME = originalFromName;
    process.env.EMAIL_BRAND_NAME = originalBrandName;
    resetRuntimeConfig();
  });

  beforeEach(() => {
    process.env.AUTH_AUTO_VERIFY_EMAIL = 'false';
    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ messageId: '<brevo-default-msg-id>' })
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.AUTH_AUTO_VERIFY_EMAIL = originalAutoVerify;
  });

  describe('Registration Verification Lifecycle over Brevo', () => {
    it('dispatches verification email via Brevo HTTPS when a new user registers', async () => {
      global.fetch.mockImplementationOnce(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<brevo-reg-msg-111>' })
      }));

      const email = 'brevo-reg-user@example.com';
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Brevo User',
          email,
          password: validPassword,
          phone: '03001234567',
          redirect: '/checkout'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresEmailVerification).toBe(true);
      expect(response.body.data.emailDeliveryFailed).toBe(false);

      expect(global.fetch).toHaveBeenCalled();
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(options.headers['api-key']).toBe('xkeysib-live-test-key-777');

      const body = JSON.parse(options.body);
      expect(body.sender).toEqual({ name: 'HARZAAR Demo', email: 'sender@harzaar.com' });
      expect(body.to).toEqual([{ email }]);
      expect(body.subject).toContain('Verify Your Email');
      expect(body.htmlContent).toContain('redirect=%2Fcheckout');
    });

    it('gracefully handles Brevo delivery failure during registration without crashing or creating session', async () => {
      global.fetch.mockImplementationOnce(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal error' })
      }));

      const email = 'brevo-fail-user@example.com';
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Brevo Fail User',
          email,
          password: validPassword,
          phone: '03001234567'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresEmailVerification).toBe(true);
      expect(response.body.data.emailDeliveryFailed).toBe(true);
      expect(response.body.data).not.toHaveProperty('accessToken');

      const user = await User.findOne({ email });
      expect(user).toBeTruthy();
      expect(user.isVerified).toBe(false);
    });
  });

  describe('Resend Verification Lifecycle over Brevo', () => {
    it('sends resend-verification email over Brevo and returns enumeration-neutral response for existing unverified user', async () => {
      const email = 'brevo-resend@example.com';
      await User.create({
        fullName: 'Brevo Resend User',
        email,
        password: validPassword,
        phone: '03001234567',
        isVerified: false
      });

      global.fetch.mockClear();
      global.fetch.mockImplementationOnce(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<brevo-resend-msg-222>' })
      }));

      const response = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists with this email');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.to).toEqual([{ email }]);
      expect(body.subject).toContain('Verify Your Email');
    });

    it('returns same enumeration-neutral response without calling Brevo for non-existent user', async () => {
      global.fetch.mockClear();
      const response = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'nonexistent-user@example.com' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists with this email');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Forgot-Password Lifecycle over Brevo', () => {
    it('dispatches reset password email via Brevo and returns enumeration-neutral response for existing user', async () => {
      const email = 'brevo-forgot@example.com';
      await User.create({
        fullName: 'Brevo Forgot User',
        email,
        password: validPassword,
        phone: '03001234567',
        isVerified: true
      });

      global.fetch.mockClear();
      global.fetch.mockImplementationOnce(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<brevo-forgot-msg-333>' })
      }));

      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists with this email');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.to).toEqual([{ email }]);
      expect(body.subject).toContain('Reset Your Password');
    });

    it('returns same enumeration-neutral response without calling Brevo for non-existent user on forgot-password', async () => {
      global.fetch.mockClear();
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown-forgot@example.com' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists with this email');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('preserves enumeration-neutral response even when Brevo rejects/fails forgot-password dispatch', async () => {
      const email = 'brevo-fail-forgot@example.com';
      await User.create({
        fullName: 'Brevo Fail Forgot User',
        email,
        password: validPassword,
        phone: '03001234567',
        isVerified: true
      });

      global.fetch.mockClear();
      global.fetch.mockImplementationOnce(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ code: 'unauthorized', message: 'Bad key' })
      }));

      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists with this email');
    });
  });
});
