import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildContentSecurityPolicy } from './config/cspConfig';

export async function middleware(request: NextRequest) {
  // Generate unpredictable base64 cryptographic nonce per request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isProd = process.env.NODE_ENV === 'production';
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  const cspHeader = buildContentSecurityPolicy({
    isProduction: isProd,
    apiUrl: rawApiUrl,
    nonce,
  });

  const requestHeaders = new Headers(request.headers);
  // Strictly strip any client-supplied internal CMS headers to prevent header injection/spoofing
  requestHeaders.delete('x-cms-page-payload');
  requestHeaders.delete('x-cms-fetch-error');

  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/pages/')) {
    const slug = pathname.slice('/pages/'.length).trim();
    if (slug) {
      const apiBase = (process.env.INTERNAL_API_URL || rawApiUrl || 'http://127.0.0.1:5000').replace(/\/+$/, '');
      const apiUrl = apiBase.endsWith('/api') ? `${apiBase}/content/slug/${encodeURIComponent(slug)}` : `${apiBase}/api/content/slug/${encodeURIComponent(slug)}`;
      try {
        const backendRes = await fetch(apiUrl, {
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        if (backendRes.status === 404) {
          const rewriteRes = NextResponse.rewrite(new URL('/_not-found', request.url), {
            status: 404,
            headers: requestHeaders,
          });
          rewriteRes.headers.set('Content-Security-Policy', cspHeader);
          rewriteRes.headers.set('X-Content-Type-Options', 'nosniff');
          rewriteRes.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
          rewriteRes.headers.set('X-Frame-Options', 'DENY');
          rewriteRes.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
          return rewriteRes;
        }
        if (backendRes.ok) {
          const data = await backendRes.json();
          if (data?.success && data?.data) {
            requestHeaders.set('x-cms-page-payload', Buffer.from(JSON.stringify(data.data)).toString('base64'));
          }
        }
      } catch {
        requestHeaders.set('x-cms-fetch-error', 'outage');
      }
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
