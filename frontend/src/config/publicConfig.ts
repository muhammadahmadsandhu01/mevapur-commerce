import { resolvePublicApiContract } from './publicApiContract.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SAFE_PATH_REGEX = /^\/[a-zA-Z0-9_\-./]+$/;

export const readOrigin = (
  value: string | undefined,
  variableName: string,
  developmentDefault: string,
  isProduction = process.env.NODE_ENV === 'production'
): string => {
  const candidate = value?.trim() || (!isProduction ? developmentDefault : '');
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
  if (isProduction && parsed.protocol !== 'https:') {
    throw new Error(`${variableName} must use HTTPS for production builds`);
  }
  if (
    !isProduction
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

export const readSiteName = (isProduction = process.env.NODE_ENV === 'production'): string => {
  const raw = process.env.NEXT_PUBLIC_SITE_NAME?.replace(/[\r\n\t\x00-\x1F\x7F]/g, '').trim();
  if (raw) return raw.slice(0, 80);
  if (!isProduction) return 'Local Store';
  throw new Error('NEXT_PUBLIC_SITE_NAME is required for production builds');
};

export const readLegalName = (): string => {
  const raw = (
    process.env.NEXT_PUBLIC_LEGAL_NAME
    || process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME
  )?.replace(/[\r\n\t\x00-\x1F\x7F]/g, '').trim();

  if (raw) return raw.slice(0, 120);
  return readSiteName();
};

export const readTagline = (): string => {
  const raw = process.env.NEXT_PUBLIC_TAGLINE?.replace(/[\r\n\t\x00-\x1F\x7F]/g, '').trim();
  return raw ? raw.slice(0, 120) : 'CHOOSE BEYOND.';
};

export const readShortDescription = (): string => {
  const raw = process.env.NEXT_PUBLIC_SHORT_DESCRIPTION?.replace(/[\r\n\t\x00-\x1F\x7F]/g, '').trim();
  return raw ? raw.slice(0, 240) : 'A modern, configurable commerce platform.';
};

export const readSafeAssetPath = (
  value: string | undefined,
  fallback: string,
  variableName: string
): string => {
  const candidate = value?.trim();
  if (!candidate) return fallback;

  if (candidate.startsWith('//') || candidate.startsWith('\\\\')) {
    throw new Error(`${variableName} must not use protocol-relative or UNC paths`);
  }

  if (candidate.startsWith('/')) {
    if (candidate.includes('..') || !SAFE_PATH_REGEX.test(candidate)) {
      throw new Error(`${variableName} contains invalid characters or directory traversal`);
    }
    return candidate;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') {
      throw new Error(`${variableName} remote URLs must use HTTPS`);
    }
    if (parsed.username || parsed.password) {
      throw new Error(`${variableName} must not contain credentials`);
    }
    return parsed.href;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes(variableName)) {
      throw err;
    }
    throw new Error(`${variableName} must be a root-relative path starting with '/' or a valid HTTPS URL`);
  }
};

export const readSafeColor = (
  value: string | undefined,
  fallback: string,
  variableName: string
): string => {
  const candidate = value?.trim();
  if (!candidate) return fallback;

  if (!HEX_COLOR_REGEX.test(candidate)) {
    throw new Error(`${variableName} must be a valid hex color code (e.g. #0B132B or #FF8A00)`);
  }
  return candidate;
};

export const readIndexingFlag = (): boolean => {
  const value = process.env.NEXT_PUBLIC_SEARCH_INDEXING_ENABLED?.trim();
  if (!value) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('NEXT_PUBLIC_SEARCH_INDEXING_ENABLED must be true or false');
};

export const publicConfig = Object.freeze({
  get apiOrigin(): string {
    return resolvePublicApiContract(
      process.env.NEXT_PUBLIC_API_URL,
      { environment: process.env.NODE_ENV }
    ).apiOrigin;
  },
  get siteOrigin(): string {
    return readOrigin(
      process.env.NEXT_PUBLIC_SITE_URL,
      'NEXT_PUBLIC_SITE_URL',
      'http://localhost:3000'
    );
  },
  get siteName(): string {
    return readSiteName();
  },
  get legalDisplayName(): string {
    return readLegalName();
  },
  get tagline(): string {
    return readTagline();
  },
  get shortDescription(): string {
    return readShortDescription();
  },
  get logoPath(): string {
    return readSafeAssetPath(process.env.NEXT_PUBLIC_LOGO_PATH, '/brand/logo.svg', 'NEXT_PUBLIC_LOGO_PATH');
  },
  get logoLightPath(): string {
    return readSafeAssetPath(process.env.NEXT_PUBLIC_LOGO_LIGHT_PATH, '/brand/logo-light.svg', 'NEXT_PUBLIC_LOGO_LIGHT_PATH');
  },
  get logoDarkPath(): string {
    return readSafeAssetPath(process.env.NEXT_PUBLIC_LOGO_DARK_PATH, '/brand/logo-dark.svg', 'NEXT_PUBLIC_LOGO_DARK_PATH');
  },
  get symbolPath(): string {
    return readSafeAssetPath(process.env.NEXT_PUBLIC_SYMBOL_PATH, '/brand/symbol.svg', 'NEXT_PUBLIC_SYMBOL_PATH');
  },
  get faviconPath(): string {
    return readSafeAssetPath(process.env.NEXT_PUBLIC_FAVICON_PATH, '/brand/favicon.svg', 'NEXT_PUBLIC_FAVICON_PATH');
  },
  get socialPreviewPath(): string {
    return readSafeAssetPath(
      process.env.NEXT_PUBLIC_SOCIAL_IMAGE_PATH || process.env.NEXT_PUBLIC_OG_IMAGE_PATH,
      '/brand/logo.svg',
      'NEXT_PUBLIC_SOCIAL_IMAGE_PATH'
    );
  },
  get primaryColor(): string {
    return readSafeColor(process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR, '#0B132B', 'NEXT_PUBLIC_THEME_PRIMARY_COLOR');
  },
  get accentColor(): string {
    return readSafeColor(process.env.NEXT_PUBLIC_THEME_ACCENT_COLOR, '#FF8A00', 'NEXT_PUBLIC_THEME_ACCENT_COLOR');
  },
  get surfaceColor(): string {
    return readSafeColor(process.env.NEXT_PUBLIC_THEME_SURFACE_COLOR, '#F7F7F5', 'NEXT_PUBLIC_THEME_SURFACE_COLOR');
  },
  get mutedColor(): string {
    return readSafeColor(process.env.NEXT_PUBLIC_THEME_MUTED_COLOR, '#6B7280', 'NEXT_PUBLIC_THEME_MUTED_COLOR');
  },
  get searchIndexingEnabled(): boolean {
    return readIndexingFlag();
  },
});

export const publicApiBaseUrl = resolvePublicApiContract(
  process.env.NEXT_PUBLIC_API_URL,
  { environment: process.env.NODE_ENV }
).apiBaseUrl;
