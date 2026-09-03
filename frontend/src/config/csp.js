'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolvePublicApiContract } = require('./publicApiContract');

const isProductionDefault = process.env.NODE_ENV === 'production';

function buildCspHeader({ production = isProductionDefault, origin = '', nonce = '' } = {}) {
  let resolvedApiOrigin = origin;
  if (!resolvedApiOrigin && process.env.NEXT_PUBLIC_API_URL) {
    try {
      const contract = resolvePublicApiContract(process.env.NEXT_PUBLIC_API_URL, {
        environment: production ? 'production' : 'development',
      });
      resolvedApiOrigin = contract.apiOrigin;
    } catch {
      resolvedApiOrigin = process.env.NEXT_PUBLIC_API_URL.trim();
    }
  }

  const connectSrc = ["'self'"];
  if (resolvedApiOrigin) {
    connectSrc.push(resolvedApiOrigin);
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
  if (resolvedApiOrigin) {
    imgSrc.push(resolvedApiOrigin);
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

  const scriptSources = production
    ? (nonce
        ? `'self' 'nonce-${nonce}' https://js.stripe.com`
        : "'self' https://js.stripe.com")
    : "'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com";

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources}`,
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
