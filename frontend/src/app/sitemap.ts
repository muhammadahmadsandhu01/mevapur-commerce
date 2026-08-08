import type { MetadataRoute } from 'next';
import { publicConfig } from '@/config/publicConfig';

const publicPaths = ['/', '/products', '/payment-instructions'];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!publicConfig.searchIndexingEnabled) return [];

  const generatedAt = new Date();
  return publicPaths.map((path) => ({
    url: `${publicConfig.siteOrigin}${path === '/' ? '' : path}`,
    lastModified: generatedAt,
    changeFrequency: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : 0.8,
  }));
}
