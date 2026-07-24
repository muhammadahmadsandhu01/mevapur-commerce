import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  
  // ✅ FIXED: Removed 'eslint' property (not valid in NextConfig type)
  typescript: {
    ignoreBuildErrors: false, // ✅ Enable TS checks for production
  },
  
  experimental: {
    serverMinification: false,
  },
  
  images: {
    unoptimized: false, // ✅ Enable Next.js Image Optimization
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'mevapur-backend.onrender.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5000',
      }
    ]
  },
};

export default nextConfig;