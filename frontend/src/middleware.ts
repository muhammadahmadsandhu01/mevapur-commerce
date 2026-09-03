import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildContentSecurityPolicy } from './config/cspConfig';

export function middleware(request: NextRequest) {
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
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

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
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
