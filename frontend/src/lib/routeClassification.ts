/**
 * Canonical Storefront Route Classification & Navigation Safety Helpers
 */

const PUBLIC_EXACT_ROUTES = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/products',
  '/search',
  '/cart',
  '/checkout',
  '/order-success',
  '/payment-result',
  '/payment-instructions',
  '/healthz',
  '/robots.txt',
  '/sitemap.xml',
]);

const PUBLIC_PREFIXES = [
  '/products/',
  '/content/',
  '/brand/',
  '/_next/',
  '/api/',
];

const PROTECTED_PREFIXES = [
  '/account',
  '/orders',
  '/wishlist',
];

/**
 * Normalizes a URL pathname by stripping query strings, hashes, and trailing slashes.
 */
export const normalizePathname = (pathname: string): string => {
  if (!pathname) return '/';
  const clean = pathname.split('?')[0].split('#')[0].trim();
  if (clean.length > 1 && clean.endsWith('/')) {
    return clean.slice(0, -1);
  }
  return clean || '/';
};

/**
 * Evaluates whether a given pathname is an unauthenticated public route.
 */
export const isPublicRoute = (rawPathname: string): boolean => {
  const path = normalizePathname(rawPathname);

  if (PUBLIC_EXACT_ROUTES.has(path)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
};

/**
 * Evaluates whether a given pathname requires customer authentication.
 */
export const isProtectedRoute = (rawPathname: string): boolean => {
  const path = normalizePathname(rawPathname);
  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
};

/**
 * Validates a target redirect URL to prevent open redirect vulnerabilities.
 * Rejects external domains, protocol-relative URLs (//evil.com), and backslash payloads (/\evil.com).
 */
export const isSafeLocalRedirect = (
  target: string | null | undefined,
  fallback = '/'
): string => {
  if (!target || typeof target !== 'string') return fallback;
  const trimmed = target.trim();

  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('://') &&
    !trimmed.includes('\\')
  ) {
    return trimmed;
  }

  return fallback;
};
