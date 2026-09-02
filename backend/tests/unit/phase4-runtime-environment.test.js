const mongoose = require('mongoose');
const { createRuntimeConfig } = require('../../config/runtime.config');
const ReviewService = require('../../services/ReviewService');
const OrderService = require('../../services/order/OrderService');
const ERROR_CODES = require('../../constants/errorCodes');

describe('Phase 4 Runtime Environment & Fail-Closed Transaction Detection', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  const getValidEnvFor = (appEnv, nodeEnv) => {
    const isDeployed = ['staging', 'production'].includes(appEnv) || ['staging', 'production'].includes(nodeEnv);
    return {
      ...process.env,
      APP_ENV: appEnv,
      NODE_ENV: nodeEnv,
      FRONTEND_URL: isDeployed ? 'https://store.mevapur.test' : 'http://localhost:3000',
      ADMIN_URL: isDeployed ? 'https://admin.mevapur.test' : 'http://localhost:3001',
      BACKEND_PUBLIC_URL: isDeployed ? 'https://api.mevapur.test' : 'http://localhost:5000',
      TRUST_PROXY: isDeployed ? '1' : 'false',
      AUTH_COOKIE_SAME_SITE: 'lax',
      AUTH_COOKIE_SECURE: isDeployed ? 'true' : 'false',
      EMAIL_MODE: isDeployed ? 'smtp' : 'disabled',
      EMAIL_BRAND_NAME: 'MevaPur',
      SMTP_HOST: isDeployed ? 'smtp.sendgrid.net' : undefined,
      SMTP_PORT: isDeployed ? '587' : undefined,
      SMTP_SECURE: isDeployed ? 'false' : undefined,
      SMTP_USER: isDeployed ? 'prod_mail_service_app' : undefined,
      SMTP_PASSWORD: isDeployed ? 'M7x!kQ9#wL4$vR2@' : undefined,
      SMTP_FROM: isDeployed ? 'noreply@mevapur.test' : undefined,
      STORAGE_PROVIDER: 'mock',
      UPLOADS_MODE: 'read-only'
    };
  };

  const environmentTestMatrix = [
    { appEnv: 'development', nodeEnv: 'development', expectedDeployed: false, label: 'development' },
    { appEnv: 'test', nodeEnv: 'test', expectedDeployed: false, label: 'test' },
    { appEnv: 'staging', nodeEnv: 'staging', expectedDeployed: true, label: 'staging' },
    { appEnv: 'production', nodeEnv: 'production', expectedDeployed: true, label: 'production' },
    { appEnv: 'staging', nodeEnv: 'development', expectedDeployed: true, label: 'conflicting APP_ENV=staging, NODE_ENV=development' },
    { appEnv: 'production', nodeEnv: 'test', expectedDeployed: true, label: 'conflicting APP_ENV=production, NODE_ENV=test' }
  ];

  environmentTestMatrix.forEach(({ appEnv, nodeEnv, expectedDeployed, label }) => {
    test(`correctly determines isDeployed=${expectedDeployed} for ${label}`, () => {
      const config = createRuntimeConfig(getValidEnvFor(appEnv, nodeEnv));
      expect(config.isDeployed).toBe(expectedDeployed);
    });
  });

  test('APP_ENV=staging cannot enter fallback even if NODE_ENV=development', () => {
    const config = createRuntimeConfig(getValidEnvFor('staging', 'development'));
    expect(config.isDeployed).toBe(true);
    expect(config.environment).toBe('staging');
  });

  test('ReviewService.withTransaction fails closed with 503 SERVICE_UNAVAILABLE in deployed environment when session cannot start', async () => {
    process.env.APP_ENV = 'staging';
    process.env.NODE_ENV = 'development';

    jest.spyOn(mongoose, 'startSession').mockImplementationOnce(() => {
      throw new Error('MongoServerError: Sessions are not supported in standalone');
    });

    await expect(ReviewService.withTransaction(async () => 'ok'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        code: ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE'
      });
  });

  test('OrderService.runTransaction fails closed with 503 SERVICE_UNAVAILABLE in deployed environment when session cannot start', async () => {
    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'development';

    jest.spyOn(mongoose, 'startSession').mockImplementationOnce(() => {
      throw new Error('MongoServerError: Sessions are not supported');
    });

    await expect(OrderService.runTransaction(async () => 'ok'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        code: ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE'
      });
  });

  test('isolated dev/test environment enters non-transactional fallback when session fails', async () => {
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';

    jest.spyOn(mongoose, 'startSession').mockImplementationOnce(() => {
      throw new Error('Standalone test runner without replica set');
    });

    let executed = false;
    const result = await ReviewService.withTransaction(async (session) => {
      expect(session).toBeNull();
      executed = true;
      return 'fallback-ok';
    });

    expect(executed).toBe(true);
    expect(result).toBe('fallback-ok');
  });
});
