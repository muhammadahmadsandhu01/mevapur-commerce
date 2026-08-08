const DEPLOYED_ENVIRONMENTS = new Set(['staging', 'production']);
const SUPPORTED_ENVIRONMENTS = new Set([
  'development',
  'test',
  'staging',
  'production'
]);
const SUPPORTED_SAME_SITE = new Set(['strict', 'lax', 'none']);
const SUPPORTED_EMAIL_MODES = new Set(['disabled', 'mock']);
const SUPPORTED_UPLOAD_MODES = new Set(['disabled', 'read-only']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

class RuntimeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuntimeConfigurationError';
    this.code = 'RUNTIME_CONFIGURATION_INVALID';
  }
}

const requiredValue = (environment, name) => {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuntimeConfigurationError(`${name} is required`);
  }
  return value.trim();
};

const optionalValue = (environment, name) => {
  const value = environment[name];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : null;
};

const normalizeEnvironment = (environment) => {
  const appEnvironment = optionalValue(environment, 'APP_ENV');
  const nodeEnvironment = optionalValue(environment, 'NODE_ENV')
    || 'development';
  const candidate = (appEnvironment || nodeEnvironment).toLowerCase();
  const normalized = candidate === 'dev' ? 'development' : candidate;

  if (!SUPPORTED_ENVIRONMENTS.has(normalized)) {
    throw new RuntimeConfigurationError(
      'APP_ENV or NODE_ENV must identify development, test, staging, or production'
    );
  }

  return normalized;
};

const normalizeOrigin = (value, {
  variableName = 'origin',
  allowLoopbackHttp = false
} = {}) => {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === '*') {
    throw new RuntimeConfigurationError(
      `${variableName} must be an explicit HTTP or HTTPS origin`
    );
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new RuntimeConfigurationError(`${variableName} must be a valid URL origin`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new RuntimeConfigurationError(`${variableName} must use HTTP or HTTPS`);
  }
  if (parsed.username || parsed.password) {
    throw new RuntimeConfigurationError(`${variableName} must not contain credentials`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new RuntimeConfigurationError(
      `${variableName} must not contain a path, query, or fragment`
    );
  }
  if (
    parsed.protocol === 'http:'
    && !(allowLoopbackHttp && LOOPBACK_HOSTS.has(parsed.hostname))
  ) {
    throw new RuntimeConfigurationError(
      `${variableName} must use HTTPS outside loopback development`
    );
  }

  return parsed.origin;
};

const parseAdditionalOrigins = (environment, options) => {
  const raw = optionalValue(environment, 'TRUSTED_ORIGINS');
  if (!raw) return [];

  return raw.split(',').map((value, index) => normalizeOrigin(value, {
    ...options,
    variableName: `TRUSTED_ORIGINS entry ${index + 1}`
  }));
};

const parseBoolean = (environment, name, fallback) => {
  const raw = optionalValue(environment, name);
  if (raw === null) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new RuntimeConfigurationError(`${name} must be true or false`);
};

const parseInteger = (environment, name, fallback, { minimum, maximum }) => {
  const raw = optionalValue(environment, name);
  if (raw === null) return fallback;

  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed)
    || parsed < minimum
    || parsed > maximum
  ) {
    throw new RuntimeConfigurationError(
      `${name} must be an integer from ${minimum} to ${maximum}`
    );
  }
  return parsed;
};

const parseMode = (environment, name, supported, fallback, isRequired) => {
  const raw = optionalValue(environment, name);
  if (raw === null) {
    if (isRequired) {
      throw new RuntimeConfigurationError(`${name} is required`);
    }
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (!supported.has(normalized)) {
    throw new RuntimeConfigurationError(
      `${name} must be one of: ${[...supported].join(', ')}`
    );
  }
  return normalized;
};

const parseTrustProxy = (environment, isDeployed) => {
  const raw = optionalValue(environment, 'TRUST_PROXY');
  if (raw === null) {
    if (isDeployed) {
      throw new RuntimeConfigurationError(
        'TRUST_PROXY is required in staging and production'
      );
    }
    return false;
  }
  if (raw === 'false') return false;
  if (raw === 'true') {
    throw new RuntimeConfigurationError(
      'TRUST_PROXY must be false or an explicit positive proxy-hop count'
    );
  }

  const hopCount = Number(raw);
  if (!Number.isInteger(hopCount) || hopCount < 1 || hopCount > 10) {
    throw new RuntimeConfigurationError(
      'TRUST_PROXY must be false or an integer from 1 to 10'
    );
  }
  return hopCount;
};

const createRuntimeConfig = (environment = process.env) => {
  const runtimeEnvironment = normalizeEnvironment(environment);
  const isDeployed = DEPLOYED_ENVIRONMENTS.has(runtimeEnvironment);
  const allowLoopbackHttp = !isDeployed;
  const originOptions = { allowLoopbackHttp };

  const storefrontValue = isDeployed
    ? requiredValue(environment, 'FRONTEND_URL')
    : optionalValue(environment, 'FRONTEND_URL') || 'http://localhost:3000';
  const adminValue = isDeployed
    ? requiredValue(environment, 'ADMIN_URL')
    : optionalValue(environment, 'ADMIN_URL') || 'http://localhost:3001';
  const backendValue = isDeployed
    ? (
      optionalValue(environment, 'BACKEND_PUBLIC_URL')
      || (
        runtimeEnvironment === 'staging'
          ? optionalValue(environment, 'STAGING_BACKEND_ORIGIN')
          : null
      )
      || requiredValue(environment, 'BACKEND_PUBLIC_URL')
    )
    : optionalValue(environment, 'BACKEND_PUBLIC_URL')
      || 'http://localhost:5000';

  const storefront = normalizeOrigin(storefrontValue, {
    ...originOptions,
    variableName: 'FRONTEND_URL'
  });
  const admin = normalizeOrigin(adminValue, {
    ...originOptions,
    variableName: 'ADMIN_URL'
  });
  const backend = normalizeOrigin(backendValue, {
    ...originOptions,
    variableName: 'BACKEND_PUBLIC_URL'
  });
  const additional = parseAdditionalOrigins(environment, originOptions);
  const allowed = new Set([storefront, admin, ...additional]);

  if (isDeployed && storefront === admin) {
    throw new RuntimeConfigurationError(
      'FRONTEND_URL and ADMIN_URL must be distinct in staging and production'
    );
  }

  const sameSiteValue = optionalValue(environment, 'AUTH_COOKIE_SAME_SITE');
  if (isDeployed && !sameSiteValue) {
    throw new RuntimeConfigurationError(
      'AUTH_COOKIE_SAME_SITE is required in staging and production'
    );
  }
  const sameSite = (sameSiteValue || 'lax').toLowerCase();
  if (!SUPPORTED_SAME_SITE.has(sameSite)) {
    throw new RuntimeConfigurationError(
      'AUTH_COOKIE_SAME_SITE must be strict, lax, or none'
    );
  }

  const secureCookieValue = optionalValue(environment, 'AUTH_COOKIE_SECURE');
  if (isDeployed && secureCookieValue === null) {
    throw new RuntimeConfigurationError(
      'AUTH_COOKIE_SECURE is required in staging and production'
    );
  }
  const secure = parseBoolean(environment, 'AUTH_COOKIE_SECURE', isDeployed);
  if (isDeployed && !secure) {
    throw new RuntimeConfigurationError(
      'AUTH_COOKIE_SECURE must be true in staging and production'
    );
  }
  if (sameSite === 'none' && !secure) {
    throw new RuntimeConfigurationError(
      'AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true'
    );
  }

  const trustProxy = parseTrustProxy(environment, isDeployed);
  const emailMode = parseMode(
    environment,
    'EMAIL_MODE',
    SUPPORTED_EMAIL_MODES,
    'mock',
    isDeployed
  );
  const uploadsMode = parseMode(
    environment,
    'LOCAL_UPLOADS_MODE',
    SUPPORTED_UPLOAD_MODES,
    runtimeEnvironment === 'development' ? 'read-only' : 'disabled',
    false
  );
  const logFilesEnabled = parseBoolean(
    environment,
    'LOG_FILE_ENABLED',
    runtimeEnvironment === 'development'
  );
  const databasePingEnabled = parseBoolean(
    environment,
    'READINESS_DB_PING_ENABLED',
    isDeployed
  );
  const databasePingTimeoutMs = parseInteger(
    environment,
    'READINESS_DB_PING_TIMEOUT_MS',
    1000,
    { minimum: 100, maximum: 5000 }
  );
  const shutdownTimeoutMs = parseInteger(
    environment,
    'SHUTDOWN_TIMEOUT_MS',
    10000,
    { minimum: 1000, maximum: 30000 }
  );
  const port = parseInteger(
    environment,
    'PORT',
    5000,
    { minimum: 1, maximum: 65535 }
  );

  const isAllowedOrigin = (origin) => {
    try {
      return allowed.has(normalizeOrigin(origin, {
        allowLoopbackHttp,
        variableName: 'request Origin'
      }));
    } catch {
      return false;
    }
  };

  return Object.freeze({
    initialized: true,
    environment: runtimeEnvironment,
    isDeployed,
    origins: Object.freeze({
      storefront,
      admin,
      backend,
      additional: Object.freeze([...additional]),
      allowed: Object.freeze([...allowed]),
      isAllowed: isAllowedOrigin
    }),
    cors: Object.freeze({
      credentials: true,
      isAllowedOrigin
    }),
    csrf: Object.freeze({
      requireOrigin: isDeployed,
      isAllowedOrigin
    }),
    cookie: Object.freeze({
      httpOnlyRefresh: true,
      secure,
      sameSite,
      domain: undefined,
      refreshPath: '/api',
      csrfPath: '/'
    }),
    proxy: Object.freeze({
      trust: trustProxy
    }),
    email: Object.freeze({
      mode: emailMode
    }),
    filesystem: Object.freeze({
      uploadsMode
    }),
    logging: Object.freeze({
      fileEnabled: logFilesEnabled
    }),
    readiness: Object.freeze({
      databasePingEnabled,
      databasePingTimeoutMs
    }),
    server: Object.freeze({
      port,
      shutdownTimeoutMs
    })
  });
};

let cachedConfig;

const getRuntimeConfig = () => {
  if (!cachedConfig) cachedConfig = createRuntimeConfig(process.env);
  return cachedConfig;
};

module.exports = {
  RuntimeConfigurationError,
  createRuntimeConfig,
  getRuntimeConfig,
  normalizeOrigin
};
