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

const readSiteName = () => {
  const value = process.env.NEXT_PUBLIC_SITE_NAME?.trim();
  if (value) return value.slice(0, 80);
  if (!isProductionBuild) return 'HARZAAR';
  throw new Error('NEXT_PUBLIC_SITE_NAME is required for production builds');
};

const readIndexingFlag = () => {
  const value = process.env.NEXT_PUBLIC_SEARCH_INDEXING_ENABLED?.trim();
  if (!value) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('NEXT_PUBLIC_SEARCH_INDEXING_ENABLED must be true or false');
};

export const publicConfig = Object.freeze({
  apiOrigin: apiContract.apiOrigin,
  siteOrigin: readOrigin(
    process.env.NEXT_PUBLIC_SITE_URL,
    'NEXT_PUBLIC_SITE_URL',
    'http://localhost:3000'
  ),
  siteName: readSiteName(),
  searchIndexingEnabled: readIndexingFlag(),
});

export const publicApiBaseUrl = apiContract.apiBaseUrl;
