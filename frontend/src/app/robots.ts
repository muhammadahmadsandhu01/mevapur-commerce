import type { MetadataRoute } from 'next';
import { publicConfig } from '@/config/publicConfig';

export default function robots(): MetadataRoute.Robots {
  if (!publicConfig.searchIndexingEnabled) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/cart',
        '/checkout',
        '/forgot-password',
        '/login',
        '/orders',
        '/payment-result',
        '/reset-password',
        '/wishlist',
      ],
    }],
    sitemap: `${publicConfig.siteOrigin}/sitemap.xml`,
  };
}
