/**
 * Exact-route helper to identify public authentication routes.
 * Takes the pathname (which is query-parameter-free as returned by Next.js usePathname).
 */
export function isPublicAuthRoute(pathname: string): boolean {
  const PUBLIC_AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];
  const normalized = pathname.replace(/\/$/, '') || '/';
  return PUBLIC_AUTH_ROUTES.includes(normalized);
}
