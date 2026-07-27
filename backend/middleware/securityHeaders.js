const helmet = require('helmet');
const config = require('../config/security.config');

const securityHeaders = (req, res, next) => {
  // Helmet Basic
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", config.apiAllowedDomains],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    frameguard: ['deny', { allowFrom: config.allowedFrameDomains }]
  })(req, res, next);
};

module.exports = securityHeaders;