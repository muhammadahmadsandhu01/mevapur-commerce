export interface CspOptions {
  isProduction: boolean;
  apiUrl?: string;
}

export function buildContentSecurityPolicy({
  isProduction,
  apiUrl = ''
}: CspOptions): string {
  const cleanApiUrl = apiUrl.trim();

  // In production, connect-src allows only 'self' and the explicit production API URL
  // In development, connect-src includes loopback hosts for local dev and HMR
  const connectSources = isProduction
    ? ["'self'", cleanApiUrl].filter(Boolean).join(' ')
    : ["'self'", 'http://localhost:*', 'https://localhost:*', 'http://127.0.0.1:*', 'https://127.0.0.1:*', cleanApiUrl].filter(Boolean).join(' ');

  // Production CSP strictly eliminates 'unsafe-eval' and unrestricted inline scripts
  // Development retains 'unsafe-eval' and 'unsafe-inline' solely for Fast Refresh / HMR source-mapping
  const scriptSources = isProduction
    ? "'self'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    `connect-src ${connectSources}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isProduction ? ['upgrade-insecure-requests'] : [])
  ].join('; ');
}
