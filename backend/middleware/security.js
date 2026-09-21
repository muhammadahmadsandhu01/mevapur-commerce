const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');

const ERROR_CODES = require('../constants/errorCodes');
const RedisRateLimitStore = require('./redisRateLimitStore');
const { getSharedRedisClient } = require('./rateLimiter');

const parseRateLimitMax = (raw, defaultVal = 100, minVal = 1, maxVal = 10000) => {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < minVal) {
    return defaultVal;
  }
  return Math.min(parsed, maxVal);
};

const parseRateLimitWindowMs = (raw, defaultVal = 15 * 60 * 1000, minVal = 1000, maxVal = 24 * 60 * 60 * 1000) => {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < minVal) {
    return defaultVal;
  }
  return Math.min(parsed, maxVal);
};

const createGlobalLimiter = (options = {}) => {
  const client = options.redisClient || getSharedRedisClient();
  const store = new RedisRateLimitStore({
    redisClient: client,
    prefix: 'rl:global:',
    failClosed: false // Global limiter can degrade on read endpoints
  });

  return rateLimit({
    windowMs: parseRateLimitWindowMs(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    limit: (req, res) => parseRateLimitMax(process.env.RATE_LIMIT_MAX, 100),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    store,
    skip: (req) => {
      if (req.method === 'OPTIONS') return true;
      const path = req.path || '';
      if (
        path === '/health' || path === '/ready' ||
        path === '/api/health' || path === '/api/ready' ||
        path === '/health/live' || path === '/health/ready'
      ) {
        return true;
      }
      return false;
    },
    handler: (req, res, next, options) => {
      return res.status(429).json({
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
};

const limiter = createGlobalLimiter();

// 2. Data Sanitization against NoSQL Injection
const dataSanitizer = () => {
  return mongoSanitize({
    replaceWith: '_',
    allowDots: true,
  });
};

// 3. Data Sanitization against XSS (Cross Site Scripting)
const xssCleaner = () => {
  return xss();
};

// 4. Prevent Parameter Pollution
const hppCleaner = () => {
  return hpp({
    whitelist: ['price', 'rating', 'category', 'subcategory', 'brand', 'tags', 'attribute', 'sortBy', 'keyword', 'page', 'limit', 'minPrice', 'maxPrice', 'inStock', 'autocomplete'], 
  });
};

// 5. Security Headers (Helmet)
const securityHeaders = (runtimeConfig) => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", ...runtimeConfig.origins.allowed],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: runtimeConfig.isDeployed ? [] : null
      },
    },
    strictTransportSecurity: runtimeConfig.isDeployed
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
};

module.exports = {
  limiter,
  createGlobalLimiter,
  dataSanitizer,
  xssCleaner,
  hppCleaner,
  securityHeaders,
  parseRateLimitMax,
  parseRateLimitWindowMs
};
