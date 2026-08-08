const fs = require('fs');
const path = require('path');

const PLACEHOLDER = /(?:REPLACE_WITH_|CUSTOMER_|example\.com|<[^>]+>)/i;
const OWNER_DEMO = /(?:mevapur|\.vercel\.app|\.onrender\.com)/i;
const EDITIONS = new Set(['pakistan', 'international', 'full']);
const PROVIDER_FLAGS = [
  'PAYMENT_PROVIDER_COD_ENABLED',
  'PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED',
  'PAYMENT_PROVIDER_RAAST_ENABLED',
  'PAYMENT_PROVIDER_JAZZCASH_ENABLED',
  'PAYMENT_PROVIDER_EASYPAISA_ENABLED',
  'PAYMENT_PROVIDER_STRIPE_ENABLED',
  'JAZZCASH_OFFICIAL_CONTRACT_APPROVED',
  'EASYPAISA_OFFICIAL_CONTRACT_APPROVED'
];

const parseEnvironmentFile = (filePath) => {
  const result = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) {
      throw new Error('CONFIG_LINE_INVALID');
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    result[key] = value;
  }
  return result;
};

const validateHttpsOrigin = (value, variableName, failures) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    failures.push(`${variableName}_INVALID_URL`);
    return null;
  }
  if (parsed.protocol !== 'https:') failures.push(`${variableName}_HTTPS_REQUIRED`);
  if (parsed.username || parsed.password) {
    failures.push(`${variableName}_CREDENTIALS_FORBIDDEN`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    failures.push(`${variableName}_ORIGIN_ONLY_REQUIRED`);
  }
  return parsed.origin;
};

const validateBoolean = (config, name, failures) => {
  if (!['true', 'false'].includes(config[name])) {
    failures.push(`${name}_BOOLEAN_REQUIRED`);
  }
};

const validateConfig = ({ backend, frontend, admin }) => {
  const failures = [];
  const storefrontOrigin = validateHttpsOrigin(
    frontend.NEXT_PUBLIC_SITE_URL,
    'NEXT_PUBLIC_SITE_URL',
    failures
  );
  const adminOrigin = validateHttpsOrigin(
    admin.NEXT_PUBLIC_ADMIN_URL,
    'NEXT_PUBLIC_ADMIN_URL',
    failures
  );
  const apiOrigin = validateHttpsOrigin(
    frontend.NEXT_PUBLIC_API_URL,
    'NEXT_PUBLIC_API_URL',
    failures
  );

  validateHttpsOrigin(
    admin.NEXT_PUBLIC_API_URL,
    'ADMIN_NEXT_PUBLIC_API_URL',
    failures
  );
  validateHttpsOrigin(backend.FRONTEND_URL, 'FRONTEND_URL', failures);
  validateHttpsOrigin(backend.ADMIN_URL, 'ADMIN_URL', failures);
  validateHttpsOrigin(
    backend.BACKEND_PUBLIC_URL,
    'BACKEND_PUBLIC_URL',
    failures
  );

  const distinct = new Set([storefrontOrigin, adminOrigin, apiOrigin].filter(Boolean));
  if (distinct.size !== 3) failures.push('PUBLIC_ORIGINS_MUST_BE_DISTINCT');
  if (backend.FRONTEND_URL !== storefrontOrigin) {
    failures.push('FRONTEND_ORIGIN_MISMATCH');
  }
  if (backend.ADMIN_URL !== adminOrigin) failures.push('ADMIN_ORIGIN_MISMATCH');
  if (backend.BACKEND_PUBLIC_URL !== apiOrigin) failures.push('API_ORIGIN_MISMATCH');
  if (admin.NEXT_PUBLIC_API_URL !== frontend.NEXT_PUBLIC_API_URL) {
    failures.push('BROWSER_API_ORIGIN_MISMATCH');
  }

  const trusted = String(backend.TRUSTED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    trusted.length !== 2
    || !trusted.includes(storefrontOrigin)
    || !trusted.includes(adminOrigin)
  ) {
    failures.push('TRUSTED_ORIGINS_EXACT_ALLOWLIST_REQUIRED');
  }

  if (!['lax', 'strict', 'none'].includes(backend.AUTH_COOKIE_SAME_SITE)) {
    failures.push('AUTH_COOKIE_SAME_SITE_INVALID');
  }
  if (backend.AUTH_COOKIE_SECURE !== 'true') {
    failures.push('AUTH_COOKIE_SECURE_REQUIRED');
  }
  if (
    backend.AUTH_COOKIE_SAME_SITE === 'none'
    && backend.AUTH_COOKIE_SECURE !== 'true'
  ) {
    failures.push('SAMESITE_NONE_REQUIRES_SECURE');
  }
  if (!/^(?:false|[1-9]|10)$/.test(backend.TRUST_PROXY || '')) {
    failures.push('TRUST_PROXY_INVALID');
  }

  if (!EDITIONS.has(backend.PAYMENT_EDITION)) {
    failures.push('PAYMENT_EDITION_INVALID');
  }
  for (const name of PROVIDER_FLAGS) {
    validateBoolean(backend, name, failures);
    if (backend[name] !== 'false') {
      failures.push(`${name}_MUST_DEFAULT_FALSE`);
    }
  }

  if (!['disabled', 'mock'].includes(backend.EMAIL_MODE)) {
    failures.push('EMAIL_MODE_INVALID');
  }
  if (!['disabled', 'read-only'].includes(backend.LOCAL_UPLOADS_MODE)) {
    failures.push('LOCAL_UPLOADS_MODE_INVALID');
  }

  validateBoolean(backend, 'AI_ASSISTANT_ENABLED', failures);
  validateBoolean(backend, 'AI_CHAT_HISTORY_PERSIST', failures);
  validateBoolean(backend, 'AI_EXTERNAL_PII_ALLOWED', failures);
  const aiMode = backend.AI_ASSISTANT_MODE;
  if (!['disabled', 'retrieval', 'provider'].includes(aiMode)) {
    failures.push('AI_ASSISTANT_MODE_INVALID');
  }
  if (aiMode !== 'disabled' && backend.AI_ASSISTANT_ENABLED !== 'true') {
    failures.push('AI_ASSISTANT_ENABLED_REQUIRED');
  }
  if (aiMode === 'disabled' && backend.AI_ASSISTANT_ENABLED !== 'false') {
    failures.push('AI_DISABLED_FLAG_MISMATCH');
  }
  if (backend.AI_CHAT_HISTORY_PERSIST !== 'false') {
    failures.push('AI_HISTORY_PERSISTENCE_FORBIDDEN');
  }
  if (aiMode === 'provider') {
    if (!backend.AI_PROVIDER || backend.AI_PROVIDER === 'none') {
      failures.push('AI_PROVIDER_REQUIRED');
    }
    validateHttpsOrigin(
      backend.AI_PROVIDER_BASE_URL,
      'AI_PROVIDER_BASE_URL',
      failures
    );
    if (!backend.AI_PROVIDER_API_KEY) failures.push('AI_PROVIDER_API_KEY_REQUIRED');
    if (!backend.AI_PROVIDER_MODEL) failures.push('AI_PROVIDER_MODEL_REQUIRED');
  }

  const publicConfigs = { ...frontend, ...admin };
  for (const [key, value] of Object.entries(publicConfigs)) {
    if (
      key.startsWith('NEXT_PUBLIC_')
      && /(?:secret|password|token|api[_-]?key|credential)/i.test(key)
      && value
    ) {
      failures.push('PUBLIC_SECRET_VARIABLE_FORBIDDEN');
    }
  }

  for (const [groupName, config] of Object.entries({
    BACKEND: backend,
    FRONTEND: frontend,
    ADMIN: admin
  })) {
    for (const [key, value] of Object.entries(config)) {
      if (PLACEHOLDER.test(value)) {
        failures.push(`${groupName}_${key}_PLACEHOLDER_UNRESOLVED`);
      }
      if (OWNER_DEMO.test(value)) {
        failures.push(`${groupName}_${key}_OWNER_DEMO_VALUE_FORBIDDEN`);
      }
    }
  }

  return [...new Set(failures)].sort();
};

const parseArguments = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!['--backend', '--frontend', '--admin'].includes(name) || !value) {
      throw new Error('CONFIG_PATH_ARGUMENTS_INVALID');
    }
    values[name.slice(2)] = path.resolve(value);
  }
  if (!values.backend || !values.frontend || !values.admin) {
    throw new Error('CONFIG_PATH_ARGUMENTS_REQUIRED');
  }
  return values;
};

const main = () => {
  try {
    const paths = parseArguments(process.argv.slice(2));
    const failures = validateConfig({
      backend: parseEnvironmentFile(paths.backend),
      frontend: parseEnvironmentFile(paths.frontend),
      admin: parseEnvironmentFile(paths.admin)
    });
    if (failures.length > 0) {
      for (const code of failures) {
        process.stdout.write(`CUSTOMER_CONFIG_FAIL code=${code}\n`);
      }
      process.exitCode = 1;
      return;
    }
    process.stdout.write('CUSTOMER_CONFIG_PASS\n');
  } catch (error) {
    process.stdout.write(
      `CUSTOMER_CONFIG_FAIL code=${error.message || 'VALIDATION_FAILED'}\n`
    );
    process.exitCode = 1;
  }
};

if (require.main === module) main();

module.exports = {
  parseEnvironmentFile,
  validateConfig
};
