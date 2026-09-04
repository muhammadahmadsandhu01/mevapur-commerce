import axios from 'axios';
import { publicApiBaseUrl } from '../config/publicConfig.ts';
import { getSafeMediaUrl } from '../lib/catalogAdapter.ts';
import type { ContentItem, ContentType, PublicStoreSettings } from '../types/content.ts';

/**
 * Resolves the authoritative API base URL for server and client execution boundaries
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    const runtimeUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (runtimeUrl) {
      try {
        const parsed = new URL(runtimeUrl);
        return `${parsed.origin}/api`;
      } catch {
        // Fallback to static config
      }
    }
  }
  return publicApiBaseUrl;
}

/**
 * Normalizes a raw backend content object into a safe ContentItem
 */
export function normalizeContentItem(raw: unknown): ContentItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const id = String(obj._id || obj.id || '').trim();
  const type = String(obj.type || '').trim().toLowerCase() as ContentType;
  const title = String(obj.title || '').trim();

  if (!id || !title || !['banner', 'slider', 'page', 'blog'].includes(type)) {
    return null;
  }

  const rawImage = obj.image ? String(obj.image) : '';
  const safeImage = rawImage ? getSafeMediaUrl(rawImage, '') : '';

  const rawImages = Array.isArray(obj.images)
    ? obj.images
        .filter((img) => img && typeof img === 'object')
        .map((img) => {
          const typed = img as Record<string, unknown>;
          const url = String(typed.url || '').trim();
          return {
            url: getSafeMediaUrl(url, ''),
            alt: typed.alt ? String(typed.alt).trim() : undefined,
            link: typed.link ? String(typed.link).trim() : undefined,
          };
        })
        .filter((img) => Boolean(img.url))
    : undefined;

  let button: { text?: string; link?: string } | undefined = undefined;
  if (obj.button && typeof obj.button === 'object') {
    const btn = obj.button as Record<string, unknown>;
    button = {
      text: btn.text ? String(btn.text).trim() : undefined,
      link: btn.link ? String(btn.link).trim() : undefined,
    };
  }

  let seo: { metaTitle?: string; metaDescription?: string; keywords?: string } | undefined = undefined;
  if (obj.seo && typeof obj.seo === 'object') {
    const s = obj.seo as Record<string, unknown>;
    seo = {
      metaTitle: s.metaTitle ? String(s.metaTitle).trim() : undefined,
      metaDescription: s.metaDescription ? String(s.metaDescription).trim() : undefined,
      keywords: s.keywords ? String(s.keywords).trim() : undefined,
    };
  }

  return {
    _id: id,
    type,
    title,
    slug: String(obj.slug || id).trim().toLowerCase(),
    subtitle: obj.subtitle ? String(obj.subtitle).trim() : undefined,
    description: obj.description ? String(obj.description).trim() : undefined,
    content: obj.content ? String(obj.content) : undefined,
    image: safeImage || undefined,
    images: rawImages && rawImages.length > 0 ? rawImages : undefined,
    button,
    position: typeof obj.position === 'number' ? obj.position : 0,
    isActive: obj.isActive !== undefined ? Boolean(obj.isActive) : true,
    isFeatured: Boolean(obj.isFeatured),
    category: obj.category ? String(obj.category).trim() : undefined,
    seo,
    startDate: obj.startDate ? String(obj.startDate) : undefined,
    endDate: obj.endDate ? String(obj.endDate) : undefined,
    views: typeof obj.views === 'number' ? obj.views : 0,
    createdAt: obj.createdAt ? String(obj.createdAt) : undefined,
    updatedAt: obj.updatedAt ? String(obj.updatedAt) : undefined,
  };
}

/**
 * Fetches public active content by type (slider, banner, page, blog)
 */
export async function getPublicContent(type: ContentType): Promise<ContentItem[]> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await axios.get(`${baseUrl}/content/public/${encodeURIComponent(type)}`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    if (!response.data?.success || !Array.isArray(response.data.data)) {
      return [];
    }

    const items: unknown[] = response.data.data;
    return items
      .map((item: unknown) => normalizeContentItem(item))
      .filter((item: ContentItem | null): item is ContentItem => item !== null && item.isActive);
  } catch {
    return [];
  }
}

/**
 * Fetches a single public content page by its slug
 */
export async function getContentBySlug(slug: string): Promise<ContentItem | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await axios.get(`${baseUrl}/content/slug/${encodeURIComponent(slug)}`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    if (!response.data?.success || !response.data.data) {
      return null;
    }

    const item = normalizeContentItem(response.data.data);
    return item && item.isActive ? item : null;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetches public store configuration settings
 */
export async function getPublicSettings(): Promise<PublicStoreSettings | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await axios.get(`${baseUrl}/settings/public`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    if (!response.data?.success || !response.data.data) {
      return null;
    }
    return response.data.data as PublicStoreSettings;
  } catch {
    return null;
  }
}
