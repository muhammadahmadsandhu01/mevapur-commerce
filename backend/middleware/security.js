const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');

// 1. Rate Limiting - Prevents DDoS and Brute Force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
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
    whitelist: ['price', 'rating', 'category', 'tags'], 
  });
};

// 5. Security Headers (Helmet)
const securityHeaders = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://accounts.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https://api.stripe.com", "https://maps.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameAncestors: ["'none'"], // Prevent clickjacking
      },
    },
    crossOriginEmbedderPolicy: false, // Required for some image loaders
  });
};

module.exports = {
  limiter,
  dataSanitizer,
  xssCleaner,
  hppCleaner,
  securityHeaders
};