import type { NextConfig } from 'next';
import nextConfigSource from './next.config.js';

// Next 16 resolves next.config.js before this compatibility file. Keep both
// paths aligned without selecting an artifact mode or changing image hosts.
const nextConfig: NextConfig = nextConfigSource;

export default nextConfig;
