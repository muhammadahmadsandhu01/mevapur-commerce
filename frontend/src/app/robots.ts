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
        '/account',
        '/account/*',
        '/admin',
        '/admin/*',
        '/cart',
        '/checkout',
        '/checkout/*',
        '/forgot-password',
        '/healthz',
        '/login',
        '/orders',
        '/orders/*',
        '/order-success',
        '/payment-instructions',
        '/payment-result',
        '/register',
        '/reset-password',
        '/wishlist',
      ],
    }],
    sitemap: `${publicConfig.siteOrigin}/sitemap.xml`,
  };
}

