const rateLimit = require('express-rate-limit');
const ERROR_CODES = require('../constants/errorCodes');

const parseRateLimitMax = (raw, defaultVal = 10, minVal = 1, maxVal = 10000) => {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < minVal) {
    return defaultVal;
  }
  return Math.min(parsed, maxVal);
};

// Dedicated rate limiter for /login: max 10 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: (req, res) => parseRateLimitMax(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10),
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: (req, res) => parseRateLimitMax(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 10),
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
// Returns the identical generic success message and 200 status code to prevent enumeration.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  statusCode: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
// Returns neutral 429 status code to prevent brute-forcing token validity.
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
// Returns the identical generic success message and 200 status code to prevent enumeration.
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  statusCode: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
const invitationAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res, next, options) => {
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
  parseRateLimitMax
};