import type { MetadataRoute } from 'next';
import { publicConfig } from '@/config/publicConfig';
import { getPublicContent } from '@/services/content.service';
import { getProducts } from '@/lib/api';

export const dynamic = 'force-dynamic';

const MAX_PAGES = 50;
const PAGE_LIMIT = 50;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!publicConfig.searchIndexingEnabled) return [];

  const generatedAt = new Date();

  try {
    const entries: MetadataRoute.Sitemap = [
      {
        url: publicConfig.siteOrigin,
        lastModified: generatedAt,
        changeFrequency: 'daily',
        priority: 1.0,
      },
      {
        url: `${publicConfig.siteOrigin}/products`,
        lastModified: generatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      },
    ];

    // 1. Authoritative active, published products with bounded pagination
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && currentPage <= MAX_PAGES) {
      const response = await getProducts({ page: currentPage, limit: PAGE_LIMIT });
      if (!response || !response.success || !Array.isArray(response.data)) {
        throw new Error(`Failed to retrieve product batch for sitemap (page ${currentPage})`);
      }

      for (const product of response.data) {
        if (product.isActive && product.status === 'published') {
          const identifier = product.slug || product._id;
          if (identifier) {
            entries.push({
              url: `${publicConfig.siteOrigin}/products/${encodeURIComponent(identifier)}`,
              lastModified: product.updatedAt ? new Date(product.updatedAt) : generatedAt,
              changeFrequency: 'weekly',
              priority: 0.8,
            });
          }
        }
      }

      if (
        !response.pagination?.hasNext ||
        currentPage >= (response.pagination?.pages || 1) ||
        response.data.length === 0
      ) {
        hasMore = false;
      } else {
        currentPage += 1;
      }
    }

    // 2. Authoritative active, currently published CMS pages
    const cmsPages = await getPublicContent('page');
    if (Array.isArray(cmsPages)) {
      for (const page of cmsPages) {
        if (page.isActive && page.slug) {
          entries.push({
            url: `${publicConfig.siteOrigin}/pages/${encodeURIComponent(page.slug)}`,
            lastModified: page.updatedAt ? new Date(page.updatedAt) : generatedAt,
            changeFrequency: 'weekly',
            priority: 0.7,
          });
        }
      }
    }

    return entries;
  } catch (error: unknown) {
    // A backend outage must not publish a misleading partial sitemap as a successful snapshot.
    // Smallest safe failure behavior: return empty array [] rather than partial corrupted snapshot.
    console.error('[Sitemap Generation Error] Backend outage or fetch failure, suppressing partial publication:', error);
    return [];
  }
}
