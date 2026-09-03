/** @type {import('next').NextConfig} */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolvePublicApiContract } = require('./src/config/publicApiContract');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCspHeader } = require('./src/config/csp');

const isProduction = process.env.NODE_ENV === 'production';

let apiOrigin = '';
try {
  const contract = resolvePublicApiContract(process.env.NEXT_PUBLIC_API_URL, {
    environment: process.env.NODE_ENV || 'development',
  });
  apiOrigin = contract.apiOrigin;
} catch {
  // If NEXT_PUBLIC_API_URL is not set during local dev/testing
}

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: buildCspHeader({ production: isProduction, origin: apiOrigin }),
          },
        ],
      },
      {
        source:
          '/(cart|checkout|forgot-password|login|orders|order-success|payment-result|reset-password|wishlist|account)/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
    ],
  },
};

module.exports = nextConfig;
