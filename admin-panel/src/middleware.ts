import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildContentSecurityPolicy } from './config/cspConfig';

export function middleware(request: NextRequest) {
  // Generate unpredictable base64 cryptographic nonce per request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isProd = process.env.NODE_ENV === 'production';
  const rawApiUrl = process.env.API_URL || process.env.BACKEND_PUBLIC_URL || process.env.INTERNAL_API_URL || process.env['NEXT_PUBLIC_API_URL'] || process.env.NEXT_PUBLIC_API_URL || '';

  const cspHeader = buildContentSecurityPolicy({
    isProduction: isProd,
    apiUrl: rawApiUrl,
    nonce
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login' || pathname.startsWith('/login');
  
  if (!isLoginPage) {
    const hasAdminToken = request.cookies.has('mevapur_admin_token') || request.cookies.has('mevapur_admin_access_token');
    const hasGenericToken = request.cookies.has('refreshToken') || request.cookies.has('accessToken');
    if (!hasAdminToken && !hasGenericToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' }
      ]
    }
  ]
};
