import type { NextConfig } from 'next';
import nextConfigSource from './next.config.js';

// Next 16 resolves next.config.js before this compatibility file. Keep both
// paths aligned without selecting an artifact mode or changing image hosts.
const rawConfig = nextConfigSource as unknown as { default?: NextConfig } | NextConfig;
const nextConfig: NextConfig =
  rawConfig && typeof rawConfig === 'object' && 'default' in rawConfig && rawConfig.default
    ? rawConfig.default
    : (rawConfig as NextConfig);

export default nextConfig;
