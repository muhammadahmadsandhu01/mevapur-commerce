const jwt = require('jsonwebtoken');

const TokenService = require('../../../services/TokenService');
const authConfig = require('../../../config/auth.config');
const ERROR_CODES = require('../../../constants/errorCodes');

describe('TokenService', () => {
  const userId = '60d5ecb5c7f6a92c8c3e4f1b';
  const sessionId = '60d5ecb5c7f6a92c8c3e4f1c';

  const makeAccessToken = (options = {}) => jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      jti: 'test-jti',
      tokenVersion: 0,
      type: 'access'
    },
    authConfig.jwt.secret,
    {
      algorithm: 'HS256',
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
      ...options
    }
  );

  const captureError = (operation) => {
    try {
      operation();
      throw new Error('Expected token operation to fail');
    } catch (error) {
      return error;
    }
  };

  it('generates and verifies a session-bound access token with the configured contract', () => {
    const token = TokenService.generateAccessToken({
      userId,
      sessionId,
      tokenVersion: 3
    });

    const encoded = jwt.decode(token, { complete: true });
    const decoded = TokenService.verifyAccessToken(token);

    expect(encoded.header.alg).toBe('HS256');
    expect(decoded).toEqual(expect.objectContaining({
      sub: userId,
      sid: sessionId,
      tokenVersion: 3,
      type: 'access',
      iss: authConfig.jwt.issuer,
      aud: authConfig.jwt.audience,
      jti: expect.any(String)
    }));
  });

  it('generates and verifies the refresh-token family contract used by rotation', () => {
    const token = TokenService.generateRefreshToken({
      userId,
      sessionId,
      tokenVersion: 2,
      tokenFamilyId: 'family-1'
    });

    expect(TokenService.verifyRefreshToken(token)).toEqual(expect.objectContaining({
      sub: userId,
      sid: sessionId,
      tokenVersion: 2,
      tokenFamilyId: 'family-1',
      type: 'refresh'
    }));
  });

  it('returns the stable public error contract for an expired token', () => {
    const token = makeAccessToken({ expiresIn: -1 });
    const error = captureError(() => TokenService.verifyAccessToken(token));

    expect(error).toMatchObject({
      message: 'Authentication token has expired',
      statusCode: 401,
      code: ERROR_CODES.AUTH_TOKEN_EXPIRED,
      isOperational: true
    });
  });

  it('returns the stable public error contract for a tampered token', () => {
    const token = TokenService.generateAccessToken({ userId, sessionId });
    const parts = token.split('.');
    const replacement = parts[2][0] === 'a' ? 'b' : 'a';
    parts[2] = `${replacement}${parts[2].slice(1)}`;

    const error = captureError(() => TokenService.verifyAccessToken(parts.join('.')));

    expect(error).toMatchObject({
      message: 'Invalid authentication token',
      statusCode: 401,
      code: ERROR_CODES.AUTH_TOKEN_INVALID,
      isOperational: true
    });
  });

  it('fails closed when JWT_SECRET is absent outside the test environment', () => {
    const originalEnvironment = {
      NODE_ENV: process.env.NODE_ENV,
      APP_ENV: process.env.APP_ENV,
      JWT_SECRET: process.env.JWT_SECRET
    };

    try {
      process.env.NODE_ENV = 'development';
      delete process.env.APP_ENV;
      delete process.env.JWT_SECRET;

      jest.isolateModules(() => {
        expect(() => require('../../../config/auth.config')).toThrow(
          'JWT_SECRET is required for authentication'
        );
      });
    } finally {
      Object.entries(originalEnvironment).forEach(([name, value]) => {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      });
    }
  });
});
