import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-ignore - ESLint config not in type definition
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverMinification: false,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;