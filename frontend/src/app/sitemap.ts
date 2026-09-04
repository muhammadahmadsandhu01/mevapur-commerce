import type { MetadataRoute } from 'next';
import { publicConfig } from '@/config/publicConfig';
import { getPublicContent } from '@/services/content.service';

const corePublicPaths = ['/', '/products', '/search'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!publicConfig.searchIndexingEnabled) return [];

  const generatedAt = new Date();
  const entries: MetadataRoute.Sitemap = corePublicPaths.map((path) => ({
    url: `${publicConfig.siteOrigin}${path === '/' ? '' : path}`,
    lastModified: generatedAt,
    changeFrequency: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1.0 : 0.8,
  }));

  try {
    const pages = await getPublicContent('page');
    for (const page of pages) {
      if (page.isActive && page.slug) {
        entries.push({
          url: `${publicConfig.siteOrigin}/pages/${encodeURIComponent(page.slug)}`,
          lastModified: page.updatedAt ? new Date(page.updatedAt) : generatedAt,
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }
    }
  } catch {
    // Graceful fallback to core entries if content service is offline
  }

  return entries;
}

