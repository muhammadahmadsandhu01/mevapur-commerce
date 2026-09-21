const rateLimit = require('express-rate-limit');
const ERROR_CODES = require('../constants/errorCodes');
const RedisRateLimitStore = require('./redisRateLimitStore');

let sharedRedisClient = null;

const setSharedRedisClient = (client) => {
  sharedRedisClient = client;
};

const getSharedRedisClient = () => sharedRedisClient;

const parseRateLimitMax = (raw, defaultVal = 10, minVal = 1, maxVal = 10000) => {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < minVal) {
    return defaultVal;
  }
  return Math.min(parsed, maxVal);
};

const createConfiguredLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 10,
  limitFn = null,
  statusCode = 429,
  prefix = 'rl:',
  failClosed = false,
  handler = null,
  redisClient = null
} = {}) => {
  const client = redisClient || sharedRedisClient;
  const store = new RedisRateLimitStore({
    redisClient: client,
    prefix,
    failClosed
  });

  return rateLimit({
    windowMs,
    limit: limitFn || (() => max),
    statusCode,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    skip: (req) => req.method === 'OPTIONS',
    handler: handler || ((req, res) => {
      res.status(statusCode).json({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          message: 'Too many requests from this IP, please try again after 15 minutes.'
        },
        meta: {
          requestId: req.requestId || 'unknown'
        }
      });
    })
  });
};

// Dedicated rate limiter for /login: max 10 attempts per 15 minutes
const loginLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  limitFn: (req, res) => parseRateLimitMax(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10),
  prefix: 'rl:auth:login:',
  failClosed: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many login attempts from this IP, please try again after 15 minutes.'
      },
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

// Dedicated rate limiter for /register: max 10 attempts per 15 minutes
const registerLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  limitFn: (req, res) => parseRateLimitMax(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 10),
  prefix: 'rl:auth:register:',
  failClosed: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many registration attempts from this IP, please try again after 15 minutes.'
      },
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

// Dedicated rate limiter for forgot-password: max 5 attempts per 15 minutes.
const forgotPasswordLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  statusCode: 200,
  prefix: 'rl:auth:forgot:',
  failClosed: true,
  handler: (req, res) => {
    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent',
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

// Dedicated rate limiter for reset-password: max 5 attempts per 15 minutes.
const resetPasswordLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  statusCode: 429,
  prefix: 'rl:auth:reset:',
  failClosed: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests from this IP, please try again after 15 minutes.'
      },
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

// Dedicated rate limiter for resend-verification: max 5 attempts per 15 minutes.
const resendVerificationLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  statusCode: 200,
  prefix: 'rl:auth:resend:',
  failClosed: true,
  handler: (req, res) => {
    res.status(200).json({
      success: true,
      message: 'If an unverified account exists with this email, a verification link has been sent',
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

// Dedicated rate limiter for verify-email: max 10 attempts per 15 minutes.
const verifyEmailLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  statusCode: 429,
  prefix: 'rl:auth:verify-email:',
  failClosed: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many verification attempts from this IP, please try again after 15 minutes.'
      },
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

// Dedicated rate limiter for MFA verify: max 10 attempts per 15 minutes.
const mfaVerifyLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  statusCode: 429,
  prefix: 'rl:auth:mfa:',
  failClosed: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many MFA verification attempts from this IP, please try again after 15 minutes.'
      },
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

// Dedicated rate limiter for invitation acceptance: max 10 attempts per 15 minutes.
const invitationAcceptLimiter = createConfiguredLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  statusCode: 429,
  prefix: 'rl:auth:invitation:',
  failClosed: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many invitation acceptance attempts from this IP, please try again after 15 minutes.'
      },
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  }
});

module.exports = {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  resendVerificationLimiter,
  verifyEmailLimiter,
  mfaVerifyLimiter,
  invitationAcceptLimiter,
  parseRateLimitMax,
  setSharedRedisClient,
  getSharedRedisClient,
  createConfiguredLimiter
};