import type { NextConfig } from 'next';
import { buildContentSecurityPolicy } from './src/config/cspConfig';

const isProd = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';
const rawApiUrl = process.env.API_URL || process.env.BACKEND_PUBLIC_URL || process.env.INTERNAL_API_URL || process.env['NEXT_PUBLIC_API_URL'] || process.env.NEXT_PUBLIC_API_URL || '';

const cspHeader = buildContentSecurityPolicy({
  isProduction: isProd,
  apiUrl: rawApiUrl
});

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  async rewrites() {
    const backendInternalUrl = (
      process.env.BACKEND_INTERNAL_URL ||
      process.env.INTERNAL_API_URL ||
      process.env.BACKEND_URL ||
      'http://mevapur_uat_p10c_bfkzo9mv-backend-1:5000'
    ).replace(/\/$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${backendInternalUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendInternalUrl}/uploads/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive'
          },
        ]
      }
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverMinification: false,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
