'use strict';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

const isStalePlaceholderHost = (hostname) => (
  hostname === 'example.com' ||
  hostname.endsWith('.example.com') ||
  hostname.endsWith('.invalid')
);

/**
 * @param {string | undefined} value
 * @param {{ environment?: string, developmentDefault?: string }} options
 * @returns {{ apiOrigin: string, apiBaseUrl: string }}
 */
function resolvePublicApiContract(value, {
  environment = 'development',
  developmentDefault = 'http://localhost:5000'
} = {}) {
  const production = environment === 'production';
  const candidate = value?.trim() || (!production ? developmentDefault : '');
  if (!candidate || candidate === '*') {
    throw new Error('NEXT_PUBLIC_API_URL is required for production builds');
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be a valid URL origin');
  }

  if (parsed.username || parsed.password) {
    throw new Error('NEXT_PUBLIC_API_URL must not contain credentials');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('NEXT_PUBLIC_API_URL must be an origin without /api or another path');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('NEXT_PUBLIC_API_URL must use HTTP or HTTPS');
  }
  if (production) {
    if (parsed.protocol !== 'https:') {
      throw new Error('NEXT_PUBLIC_API_URL must use HTTPS for production builds');
    }
    if (LOOPBACK_HOSTS.has(parsed.hostname) || isStalePlaceholderHost(parsed.hostname)) {
      throw new Error('NEXT_PUBLIC_API_URL must name the deployed production backend');
    }
  } else if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('NEXT_PUBLIC_API_URL may use HTTP only on loopback');
  }

  const apiOrigin = parsed.origin;
  return Object.freeze({
    apiOrigin,
    apiBaseUrl: `${apiOrigin}/api`
  });
}

module.exports = { resolvePublicApiContract };
