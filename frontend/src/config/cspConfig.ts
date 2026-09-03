import { resolvePublicApiContract } from './publicApiContract.js';

export interface CspOptions {
  isProduction: boolean;
  apiUrl?: string;
  nonce?: string;
}

export function buildContentSecurityPolicy({
  isProduction,
  apiUrl = '',
  nonce,
}: CspOptions): string {
  let resolvedApiOrigin = '';
  if (apiUrl) {
    try {
      const contract = resolvePublicApiContract(apiUrl, {
        environment: isProduction ? 'production' : 'development',
      });
      resolvedApiOrigin = contract.apiOrigin;
    } catch {
      resolvedApiOrigin = apiUrl.trim();
    }
  }

  // In production, connect-src allows only 'self', the validated production API URL, and Stripe API
  const connectSources = isProduction
    ? ["'self'", resolvedApiOrigin, 'https://api.stripe.com'].filter(Boolean).join(' ')
    : [
        "'self'",
        'http://localhost:*',
        'https://localhost:*',
        'http://127.0.0.1:*',
        'https://127.0.0.1:*',
        'ws://localhost:*',
        'ws://127.0.0.1:*',
        'https://*.mevapur.test',
        'https://*.test',
        resolvedApiOrigin,
        'https://api.stripe.com',
      ]
        .filter(Boolean)
        .join(' ');

  // Production CSP strictly eliminates unrestricted 'unsafe-inline' and 'unsafe-eval'.
  // Authorizes nonced Next.js bootstrap scripts and Stripe JS library.
  const scriptSources = isProduction
    ? (nonce
        ? `'self' 'nonce-${nonce}' https://js.stripe.com`
        : "'self' https://js.stripe.com")
    : "'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com";

  const imgSources = isProduction
    ? [
        "'self'",
        'data:',
        'blob:',
        'https://res.cloudinary.com',
        'https://via.placeholder.com',
        'https://*.stripe.com',
        resolvedApiOrigin,
      ]
        .filter(Boolean)
        .join(' ')
    : [
        "'self'",
        'data:',
        'blob:',
        'https://res.cloudinary.com',
        'https://via.placeholder.com',
        'https://*.stripe.com',
        'http://localhost:*',
        'http://127.0.0.1:*',
        'https://*.mevapur.test',
        'https://*.test',
        resolvedApiOrigin,
      ]
        .filter(Boolean)
        .join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    `connect-src ${connectSources}`,
    `img-src ${imgSources}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
