import { resolvePublicApiContract } from './publicApiContract';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const isProductionBuild = process.env.NODE_ENV === 'production';
const apiContract = resolvePublicApiContract(
  process.env.NEXT_PUBLIC_API_URL,
  { environment: process.env.NODE_ENV }
);

const readOrigin = (
  value: string | undefined,
  variableName: string,
  developmentDefault: string
) => {
  const candidate = value?.trim() || (!isProductionBuild ? developmentDefault : '');
  if (!candidate || candidate === '*') {
    throw new Error(`${variableName} is required for production builds`);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${variableName} must be a valid URL origin`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${variableName} must not contain credentials`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${variableName} must not contain a path, query, or fragment`);
  }
  if (isProductionBuild && parsed.protocol !== 'https:') {
    throw new Error(`${variableName} must use HTTPS for production builds`);
  }
  if (
    !isProductionBuild
    && parsed.protocol === 'http:'
    && !LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(`${variableName} may use HTTP only on loopback`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${variableName} must use HTTP or HTTPS`);
  }

  return parsed.origin;
};

const siteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim()
  || (!isProductionBuild ? 'HARZAAR' : '');
if (!siteName) {
  throw new Error('NEXT_PUBLIC_SITE_NAME is required for production builds');
}

export const publicConfig = Object.freeze({
  apiOrigin: apiContract.apiOrigin,
  adminOrigin: readOrigin(
    process.env.NEXT_PUBLIC_ADMIN_URL,
    'NEXT_PUBLIC_ADMIN_URL',
    'http://localhost:3001'
  ),
  siteName: siteName.slice(0, 80),
});

export const publicApiBaseUrl = apiContract.apiBaseUrl;
