const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');

// 1. Rate Limiting - Prevents DDoS and Brute Force
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,

  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

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
    whitelist: ['price', 'rating', 'category', 'subcategory', 'brand', 'tags', 'attribute', 'sortBy', 'keyword', 'page', 'limit', 'minPrice', 'maxPrice', 'inStock', 'autocomplete',], 
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
  dataSanitizer,
  xssCleaner,
  hppCleaner,
  securityHeaders
};
