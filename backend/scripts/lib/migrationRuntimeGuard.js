const crypto = require('crypto');

class MigrationGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MigrationGuardError';
    this.code = code;
  }
}

/**
 * Parses MongoDB connection URI to extract normalized host(s) and database name
 * without leaking credentials or query parameters.
 */
function parseMongoUri(uri) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new MigrationGuardError('INVALID_MONGODB_URI', 'MongoDB URI is invalid or empty.');
  }

  const trimmed = uri.trim();
  // Match mongodb:// or mongodb+srv:// with optional user:pass@ and path/query
  const match = trimmed.match(/^mongodb(?:\+srv)?:\/\/(?:([^:]+)(?::([^@]+))?@)?([^/?#]+)(?:\/([^?#]*))?/i);
  if (!match) {
    throw new MigrationGuardError('INVALID_MONGODB_URI', 'MongoDB connection URI is not a valid mongodb:// or mongodb+srv:// connection string.');
  }

  const rawHosts = match[3] || '';
  const rawDb = match[4] || '';

  const normalizedHosts = rawHosts
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');

  if (!normalizedHosts) {
    throw new MigrationGuardError('INVALID_MONGODB_URI', 'MongoDB connection URI does not contain valid host specifications.');
  }

  const normalizedDbName = (rawDb.trim() || 'mevapur-commerce').toLowerCase();
  const canonicalTarget = `${normalizedHosts}/${normalizedDbName}`;
  const sha256Fingerprint = crypto.createHash('sha256').update(canonicalTarget).digest('hex');

  return {
    normalizedHosts,
    normalizedDbName,
    canonicalTarget,
    sha256Fingerprint,
    sanitizedFingerprint: `sha256:${sha256Fingerprint.slice(0, 12)}`
  };
}

/**
 * Strict CLI argument parser for migration and maintenance scripts.
 *
 * @param {string[]} argv - Array of arguments (e.g. process.argv.slice(2))
 * @param {object} options
 * @param {string[]} options.allowedModes - e.g. ['--dry-run', '--apply'] or ['--dry-run', '--apply', '--rollback']
 * @param {string[]} options.allowedFlags - script-specific flags (e.g. ['--confirm-phase2-migration', '--rerun'])
 * @param {object} options.requiredConfirmationMap - Map of mode -> target -> array of required confirmation flags
 */
function parseMigrationCli(argv, {
  allowedModes = ['--dry-run', '--apply'],
  allowedFlags = [],
  requiredConfirmationMap = {}
} = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const validTargets = new Set(['local', 'staging', 'production']);

  const passedModes = [];
  let target = null;
  const flags = new Set();
  const unknownArgs = [];

  for (const arg of args) {
    if (typeof arg !== 'string') continue;
    if (arg.startsWith('--target=')) {
      const val = arg.slice('--target='.length).trim().toLowerCase();
      if (validTargets.has(val)) {
        target = val;
      } else {
        throw new MigrationGuardError('INVALID_TARGET', `Invalid --target='${val}'. Must be one of: local, staging, production`);
      }
    } else if (allowedModes.includes(arg)) {
      passedModes.push(arg);
    } else if (
      allowedFlags.includes(arg) ||
      arg === '--allow-local' ||
      arg === '--confirm-production'
    ) {
      flags.add(arg);
    } else {
      unknownArgs.push(arg);
    }
  }

  if (unknownArgs.length > 0) {
    throw new MigrationGuardError('UNKNOWN_ARGUMENTS', `Unknown or unsupported CLI arguments rejected: ${unknownArgs.join(', ')}`);
  }

  if (!target) {
    throw new MigrationGuardError('TARGET_REQUIRED', 'Explicit target parameter is required (e.g. --target=local, --target=staging, --target=production).');
  }

  if (passedModes.length === 0) {
    throw new MigrationGuardError('MODE_REQUIRED', `Execution mode is required. Exactly one mode must be specified from: ${allowedModes.join(', ')}`);
  }

  if (passedModes.length > 1) {
    throw new MigrationGuardError('MULTIPLE_MODES_CONFLICT', `Conflicting execution modes specified: ${passedModes.join(', ')}. Exactly one mode is permitted.`);
  }

  const selectedMode = passedModes[0];
  const modeKey = selectedMode.replace(/^--/, '');

  // Validate required confirmation tokens for this mode and target
  if (requiredConfirmationMap[modeKey]) {
    const targetRequirements = requiredConfirmationMap[modeKey][target] || [];
    for (const reqFlag of targetRequirements) {
      const hasSpecificFlag = flags.has(reqFlag);
      const isProdFlag = reqFlag.startsWith('--confirm-production');
      const hasGenericProdFlag = isProdFlag && flags.has('--confirm-production');

      if (!hasSpecificFlag && !hasGenericProdFlag) {
        throw new MigrationGuardError('CONFIRMATION_REQUIRED', `Mode ${selectedMode} for target '${target}' requires explicit confirmation token: ${reqFlag}`);
      }
    }
  }

  return {
    target,
    mode: selectedMode,
    modeKey,
    isDryRun: selectedMode === '--dry-run',
    isApply: selectedMode === '--apply',
    isRollback: selectedMode === '--rollback',
    hasAllowLocal: flags.has('--allow-local'),
    hasFlag: (f) => flags.has(f),
    flags: Array.from(flags)
  };
}

/**
 * Validates runtime environment, target authorization, and database identity fingerprint before connection.
 */
function validateTargetAndDbConfig({
  target,
  hasAllowLocal = false,
  env = process.env
} = {}) {
  if (target === 'local') {
    if (!hasAllowLocal) {
      throw new MigrationGuardError('LOCAL_TARGET_REQUIRES_ALLOW_LOCAL', "Execution targeting 'local' requires explicit --allow-local flag to prevent accidental fallback.");
    }
    const mongoUri = env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
    const parsed = parseMongoUri(mongoUri);
    return {
      target,
      mongoUri,
      fingerprint: parsed.sha256Fingerprint,
      sanitizedFingerprint: parsed.sanitizedFingerprint
    };
  }

  if (!env.MONGODB_URI || typeof env.MONGODB_URI !== 'string' || !env.MONGODB_URI.trim()) {
    throw new MigrationGuardError('MONGODB_URI_REQUIRED', `MONGODB_URI environment variable is strictly required for target '${target}'.`);
  }

  const migrationEnv = (env.MIGRATION_ENVIRONMENT || '').trim().toLowerCase();
  if (migrationEnv !== target) {
    throw new MigrationGuardError('MIGRATION_ENVIRONMENT_MISMATCH', `MIGRATION_ENVIRONMENT environment variable must be explicitly set to '${target}' (currently: '${migrationEnv || 'unset'}').`);
  }

  const parsed = parseMongoUri(env.MONGODB_URI);

  const expectedFingerprint = (env.MIGRATION_EXPECTED_DB_FINGERPRINT || '').trim().toLowerCase();
  if (!expectedFingerprint) {
    throw new MigrationGuardError('EXPECTED_DB_FINGERPRINT_REQUIRED', `MIGRATION_EXPECTED_DB_FINGERPRINT environment variable is strictly required for target '${target}'. (Expected fingerprint: ${parsed.sanitizedFingerprint})`);
  }

  const expectedNormalized = expectedFingerprint.startsWith('sha256:') ? expectedFingerprint.slice(7) : expectedFingerprint;
  const computedShort = parsed.sha256Fingerprint.slice(0, expectedNormalized.length).toLowerCase();

  if (expectedNormalized !== parsed.sha256Fingerprint.toLowerCase() && expectedNormalized !== computedShort) {
    throw new MigrationGuardError('DB_FINGERPRINT_MISMATCH', `Database fingerprint verification failed for target '${target}'. Expected: ${expectedFingerprint}, Computed: ${parsed.sanitizedFingerprint}`);
  }

  return {
    target,
    mongoUri: env.MONGODB_URI,
    fingerprint: parsed.sha256Fingerprint,
    sanitizedFingerprint: parsed.sanitizedFingerprint
  };
}

module.exports = {
  MigrationGuardError,
  parseMongoUri,
  parseMigrationCli,
  validateTargetAndDbConfig
};
