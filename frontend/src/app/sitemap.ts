import type { MetadataRoute } from 'next';
import { publicConfig } from '@/config/publicConfig';
import { getPublicContent } from '@/services/content.service';
import { getProducts } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const SITEMAP_PARTITION_SIZE = 25000;
export const SITEMAP_PAGE_LIMIT = 100;
export const SITEMAP_MAX_PROTOCOL_LIMIT = 50000;

export interface SitemapDependencies {
  fetchProducts?: typeof getProducts;
  fetchPublicContent?: typeof getPublicContent;
}

export async function generateSitemaps(deps?: SitemapDependencies) {
  if (!publicConfig.searchIndexingEnabled) return [{ id: 0 }];

  const fetchProducts = deps?.fetchProducts || getProducts;
  try {
    const response = await fetchProducts({ page: 1, limit: 1 });
    const total = Number(response?.pagination?.total) || 0;
    const partitionCount = Math.max(1, Math.ceil(total / SITEMAP_PARTITION_SIZE));
    return Array.from({ length: partitionCount }, (_, i) => ({ id: i }));
  } catch {
    // Gracefully provide default partition identifier for route initialization
    return [{ id: 0 }];
  }
}

interface SitemapProps {
  id?: Promise<{ id: number | string }> | { id: number | string } | number | string;
}

export default async function sitemap(
  props?: SitemapProps,
  deps?: SitemapDependencies
): Promise<MetadataRoute.Sitemap> {
  if (!publicConfig.searchIndexingEnabled) return [];

  const fetchProducts = deps?.fetchProducts || getProducts;
  const fetchPublicContent = deps?.fetchPublicContent || getPublicContent;

  // Resolve partition ID if provided
  let partitionId = 0;
  if (props) {
    let resolvedProps = props;
    if (typeof (props as Promise<unknown>).then === 'function') {
      resolvedProps = await (props as Promise<SitemapProps>);
    }
    const rawId = typeof resolvedProps === 'object' && resolvedProps !== null && 'id' in resolvedProps
      ? (resolvedProps as { id?: unknown }).id
      : resolvedProps;
    if (typeof rawId === 'object' && rawId !== null && typeof (rawId as Promise<unknown>).then === 'function') {
      const awaited = await (rawId as Promise<{ id?: unknown } | number | string>);
      partitionId = typeof awaited === 'object' && awaited !== null && 'id' in awaited ? Number(awaited.id) : Number(awaited);
    } else if (rawId !== undefined && rawId !== null) {
      partitionId = Number(rawId);
    }
  }
  if (Number.isNaN(partitionId) || partitionId < 0) {
    partitionId = 0;
  }

  const generatedAt = new Date();
  const seenUrls = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  const addEntry = (
    url: string,
    lastModified: Date,
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
    priority: number
  ) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    entries.push({
      url,
      lastModified,
      changeFrequency,
      priority,
    });
  };

  // 1. Static discovery & CMS pages included in partition 0
  if (partitionId === 0) {
    addEntry(publicConfig.siteOrigin, generatedAt, 'daily', 1.0);
    addEntry(`${publicConfig.siteOrigin}/products`, generatedAt, 'weekly', 0.8);

    // Authoritative published CMS pages (fail closed if CMS service errors)
    const cmsPages = await fetchPublicContent('page');
    if (!Array.isArray(cmsPages)) {
      throw new Error('Sitemap generation failed: unable to retrieve authoritative CMS pages');
    }
    for (const page of cmsPages) {
      if (page && page.isActive && page.slug) {
        const url = `${publicConfig.siteOrigin}/pages/${encodeURIComponent(String(page.slug).trim())}`;
        const lastMod = page.updatedAt ? new Date(page.updatedAt) : generatedAt;
        addEntry(url, isNaN(lastMod.getTime()) ? generatedAt : lastMod, 'weekly', 0.7);
      }
    }
  }

  // 2. Authoritative active, published products for this partition
  const startProductIndex = partitionId * SITEMAP_PARTITION_SIZE;
  const startPage = Math.floor(startProductIndex / SITEMAP_PAGE_LIMIT) + 1;
  const maxPagesForPartition = Math.ceil(SITEMAP_PARTITION_SIZE / SITEMAP_PAGE_LIMIT);

  let currentPage = startPage;
  let pagesFetched = 0;
  let hasMore = true;

  while (hasMore && pagesFetched < maxPagesForPartition && entries.length < SITEMAP_MAX_PROTOCOL_LIMIT) {
    const response = await fetchProducts({ page: currentPage, limit: SITEMAP_PAGE_LIMIT });
    if (!response || !response.success || !Array.isArray(response.data)) {
      throw new Error(`Sitemap generation failed: backend outage or error on product page ${currentPage}`);
    }

    for (const product of response.data) {
      if (!product || typeof product !== 'object') continue;
      if (product.isActive && product.status === 'published') {
        const identifier = String(product.slug || product._id || '').trim();
        if (identifier) {
          const url = `${publicConfig.siteOrigin}/products/${encodeURIComponent(identifier)}`;
          const lastMod = product.updatedAt ? new Date(product.updatedAt) : generatedAt;
          addEntry(url, isNaN(lastMod.getTime()) ? generatedAt : lastMod, 'weekly', 0.8);
        }
      }
    }

    pagesFetched += 1;
    const totalPages = Number(response.pagination?.pages) || 1;
    const responseHasNext = Boolean(response.pagination?.hasNext);

    if (!responseHasNext || currentPage >= totalPages || response.data.length === 0) {
      hasMore = false;
    } else {
      currentPage += 1;
    }
  }

  return entries;
}
