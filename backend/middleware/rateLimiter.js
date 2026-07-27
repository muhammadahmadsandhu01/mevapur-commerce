const rateLimit = require('express-rate-limit');
const config = require('../config/security.config');
const { AppError } = require('../errors/AppError');

// Generic Limiter
const genericLimiter = rateLimit({
  windowMs: config.rateLimits.generic.windowMs,
  max: config.rateLimits.generic.max,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many requests, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip
});

// Strict Limiter (Login, Register)
const strictLimiter = rateLimit({
  windowMs: config.rateLimits.strict.windowMs,
  max: config.rateLimits.strict.max,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many attempts, please try again after 15 minutes.'
    }
  },
  skipSuccessfulRequests: false,
  handler: async (req, res) => {
    // Log brute force attempt
    const AuditService = require('../services/AuditService');
    await AuditService.log({
      requestId: req.requestId || 'unknown',
      userId: null,
      action: 'AUTH.RATE_LIMIT_HIT',
      status: 'WARNING',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent') || 'unknown',
      errorMessage: 'Rate limit exceeded'
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many attempts, please try again later.'
      }
    });
  }
});

// API Limiter (General Endpoints)
const apiLimiter = rateLimit({
  windowMs: config.rateLimits.api.windowMs,
  max: config.rateLimits.api.max,
  message: {
    success: false,
    error: {
      code: 'API_RATE_LIMITED',
      message: 'Too many requests, please slow down.'
    }
  }
});

module.exports = {
  genericLimiter,
  strictLimiter,
  apiLimiter
};