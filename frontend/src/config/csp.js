'use strict';

const isProductionDefault = process.env.NODE_ENV === 'production';

function buildCspHeader({ production = isProductionDefault, origin = '' } = {}) {
  const connectSrc = ["'self'"];
  if (origin) {
    connectSrc.push(origin);
  }
  connectSrc.push('https://api.stripe.com');

  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://res.cloudinary.com',
    'https://via.placeholder.com',
    'https://*.stripe.com',
  ];
  if (origin) {
    imgSrc.push(origin);
  }

  // Development and test origins are strictly forbidden in production
  if (!production) {
    connectSrc.push(
      'http://localhost:*',
      'http://127.0.0.1:*',
      'ws://localhost:*',
      'ws://127.0.0.1:*',
      'https://*.mevapur.test',
      'https://*.test'
    );
    imgSrc.push(
      'http://localhost:*',
      'http://127.0.0.1:*',
      'https://*.mevapur.test',
      'https://*.test'
    );
  }

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    `connect-src ${connectSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  return directives.join('; ');
}

module.exports = { buildCspHeader };
