import type { NextConfig } from 'next';
import { buildContentSecurityPolicy } from './src/config/cspConfig';

const isProd = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';

const cspHeader = buildContentSecurityPolicy({
  isProduction: isProd,
  apiUrl: rawApiUrl
});

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
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
