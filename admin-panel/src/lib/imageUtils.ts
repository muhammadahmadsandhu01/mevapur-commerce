import { PRODUCT_PLACEHOLDER } from '@/lib/placeholder';

export function resolveImageUrl(image?: unknown): string {
  if (!image) {
    return PRODUCT_PLACEHOLDER;
  }

  let rawUrl: string = '';
  if (typeof image === 'string') {
    rawUrl = image;
  } else if (typeof image === 'object' && image !== null) {
    const obj = image as Record<string, unknown>;
    rawUrl = (typeof obj.url === 'string' ? obj.url : '') ||
             (typeof obj.path === 'string' ? obj.path : '') ||
             (typeof obj.secure_url === 'string' ? obj.secure_url : '') ||
             (typeof obj.src === 'string' ? obj.src : '') || '';
  }

  if (!rawUrl || typeof rawUrl !== 'string') {
    return PRODUCT_PLACEHOLDER;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return PRODUCT_PLACEHOLDER;
  }

  // Map mock media uploads to local /uploads reverse proxy; fallback on other mock domains
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      if (
        parsed.hostname === 'media.mock.mevapur.test' ||
        parsed.hostname.endsWith('.mock.mevapur.test')
      ) {
        const cleanPath = parsed.pathname.replace(/^\/+/, '');
        if (!cleanPath) {
          return PRODUCT_PLACEHOLDER;
        }
        const fullPath = cleanPath.startsWith('uploads/') ? `/${cleanPath}` : `/uploads/${cleanPath}`;
        return parsed.search ? `${fullPath}${parsed.search}` : fullPath;
      }
      if (parsed.hostname === 'harzaar.com') {
        return PRODUCT_PLACEHOLDER;
      }
      return trimmed;
    }
  } catch {
    return PRODUCT_PLACEHOLDER;
  }

  // Data URIs or absolute paths
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Relative upload paths - return as relative so Next.js rewrites proxy them to backend
  if (trimmed.startsWith('/uploads/')) {
    return trimmed;
  }

  if (trimmed.startsWith('uploads/')) {
    return `/${trimmed}`;
  }

  return trimmed;
}
