import type { MetadataRoute } from 'next';
import { publicConfig } from '@/config/publicConfig';

export default function robots(): MetadataRoute.Robots {
  if (!publicConfig.searchIndexingEnabled) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/api',
          '/api/*',
          '/healthz',
        ],
      },
    ],
    sitemap: `${publicConfig.siteOrigin}/sitemap/0.xml`,
  };
}
