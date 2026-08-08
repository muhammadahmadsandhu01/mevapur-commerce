const NODE_ENV = process.env.NODE_ENV || 'development';
const isTest = NODE_ENV === 'test';
const { getRuntimeConfig } = require('./runtime.config');
const runtimeConfig = getRuntimeConfig();

const jwtSecret = process.env.JWT_SECRET
  || (isTest ? 'test-only-auth-secret-that-is-never-used-outside-tests' : null);

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required for authentication');
}

if (runtimeConfig.isDeployed && jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET must contain at least 32 characters in staging and production'
  );
}

const parseDurationMs = (value, fallbackMs) => {
  if (!value) return fallbackMs;

  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[match[2] || 's'];
};

const { sameSite, secure } = runtimeConfig.cookie;

const refreshExpiry = process.env.JWT_REFRESH_EXPIRE || '7d';
const refreshMaxAge = parseDurationMs(refreshExpiry, 7 * 24 * 60 * 60 * 1000);

module.exports = {
  jwt: {
    secret: jwtSecret,
    accessExpiry: process.env.JWT_ACCESS_EXPIRE || '15m',
    refreshExpiry,
    issuer: process.env.JWT_ISSUER || 'mevapur-auth',
    audience: process.env.JWT_AUDIENCE || 'mevapur-users'
  },
  cookie: {
    refresh: {
      name: process.env.REFRESH_COOKIE_NAME || 'refreshToken',
      httpOnly: runtimeConfig.cookie.httpOnlyRefresh,
      secure,
      sameSite,
      path: runtimeConfig.cookie.refreshPath,
      maxAge: refreshMaxAge
    },
    csrf: {
      name: process.env.CSRF_COOKIE_NAME || 'csrfToken',
      httpOnly: false,
      secure,
      sameSite,
      path: runtimeConfig.cookie.csrfPath,
      maxAge: refreshMaxAge
    }
  },
  security: {
    maxLoginAttempts: Number(process.env.AUTH_MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDurationMs: parseDurationMs(
      process.env.AUTH_LOCKOUT_DURATION,
      60 * 60 * 1000
    ),
    passwordMinLength: 12,
    resetTokenExpiryMs: parseDurationMs(
      process.env.AUTH_RESET_TOKEN_EXPIRY,
      15 * 60 * 1000
    ),
    csrfSecret: process.env.CSRF_SECRET || jwtSecret
  },
  email: {
    autoVerify: process.env.AUTH_AUTO_VERIFY_EMAIL !== 'false',
    from: process.env.EMAIL_FROM || 'MevaPur <noreply@mevapur.com>',
    verificationSubject: 'Verify Your MevaPur Account',
    resetSubject: 'Password Reset Request'
  }
};
