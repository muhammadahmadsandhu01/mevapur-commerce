const {
  MigrationGuardError,
  parseMongoUri,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../../scripts/lib/migrationRuntimeGuard');

describe('Shared Migration Runtime Guard', () => {
  describe('parseMongoUri and Fingerprinting', () => {
    it('normalizes single and replica-set mongodb host strings and computes SHA-256', () => {
      const uri1 = 'mongodb://appUser:secretPass123@cluster0.abcde.mongodb.net:27017/mevapur_staging?retryWrites=true&w=majority';
      const parsed1 = parseMongoUri(uri1);

      expect(parsed1.normalizedHosts).toBe('cluster0.abcde.mongodb.net:27017');
      expect(parsed1.normalizedDbName).toBe('mevapur_staging');
      expect(parsed1.canonicalTarget).toBe('cluster0.abcde.mongodb.net:27017/mevapur_staging');
      expect(parsed1.sha256Fingerprint).toHaveLength(64);
      expect(parsed1.sanitizedFingerprint).toMatch(/^sha256:[a-f0-9]{12}$/);
    });

    it('normalizes multi-host replica set connections by sorting hosts deterministically', () => {
      const uriA = 'mongodb://user:pass@hostB:27017,hostA:27017/my_db';
      const uriB = 'mongodb://user2:pass2@hostA:27017,hostB:27017/my_db';

      const parsedA = parseMongoUri(uriA);
      const parsedB = parseMongoUri(uriB);

      expect(parsedA.canonicalTarget).toBe('hosta:27017,hostb:27017/my_db');
      expect(parsedA.sha256Fingerprint).toBe(parsedB.sha256Fingerprint);
    });

    it('never includes credentials or query params in parsed structure or errors', () => {
      const secretUri = 'mongodb://sensitiveAdmin:superSecretP@ssword@secure-db.internal:27017/production_db?authSource=admin';
      const parsed = parseMongoUri(secretUri);

      const serialized = JSON.stringify(parsed);
      expect(serialized).not.toContain('sensitiveAdmin');
      expect(serialized).not.toContain('superSecretP@ssword');
      expect(serialized).not.toContain('authSource');
      expect(serialized).not.toContain('secure-db.internal:27017/production_db?');
    });

    it('rejects invalid or empty connection strings without exposing input in errors', () => {
      expect(() => parseMongoUri('')).toThrow(MigrationGuardError);
      expect(() => parseMongoUri('http://not-a-mongo-uri')).toThrow(MigrationGuardError);
    });
  });

  describe('parseMigrationCli Strict Argument Parsing', () => {
    const defaultOptions = {
      allowedModes: ['--dry-run', '--apply', '--rollback'],
      allowedFlags: ['--confirm-phase2-indexes', '--confirm-production-indexes', '--confirm-phase2-index-rollback'],
      requiredConfirmationMap: {
        apply: {
          staging: ['--confirm-phase2-indexes'],
          production: ['--confirm-phase2-indexes', '--confirm-production-indexes'],
          local: ['--confirm-phase2-indexes']
        },
        rollback: {
          staging: ['--confirm-phase2-index-rollback'],
          production: ['--confirm-phase2-index-rollback', '--confirm-production']
        }
      }
    };

    it('refuses when no mode is provided', () => {
      expect(() => parseMigrationCli(['--target=staging'], defaultOptions))
        .toThrow('Execution mode is required');
    });

    it('refuses when unknown flags are provided', () => {
      expect(() => parseMigrationCli(['--dry-run', '--target=staging', '--unknown-flag'], defaultOptions))
        .toThrow('Unknown or unsupported CLI arguments rejected: --unknown-flag');
    });

    it('refuses when multiple conflicting modes are provided', () => {
      expect(() => parseMigrationCli(['--dry-run', '--apply', '--target=staging'], defaultOptions))
        .toThrow('Conflicting execution modes specified');
    });

    it('refuses when target is missing or invalid', () => {
      expect(() => parseMigrationCli(['--dry-run'], defaultOptions))
        .toThrow('Explicit target parameter is required');
      expect(() => parseMigrationCli(['--dry-run', '--target=invalid_env'], defaultOptions))
        .toThrow("Invalid --target='invalid_env'");
    });

    it('refuses apply on staging when confirmation token is missing', () => {
      expect(() => parseMigrationCli(['--apply', '--target=staging'], defaultOptions))
        .toThrow("requires explicit confirmation token: --confirm-phase2-indexes");
    });

    it('refuses apply on production when production confirmation token is missing', () => {
      expect(() => parseMigrationCli(['--apply', '--target=production', '--confirm-phase2-indexes'], defaultOptions))
        .toThrow("requires explicit confirmation token: --confirm-production-indexes");
    });

    it('accepts valid dry-run invocation', () => {
      const res = parseMigrationCli(['--dry-run', '--target=staging'], defaultOptions);
      expect(res.target).toBe('staging');
      expect(res.isDryRun).toBe(true);
      expect(res.isApply).toBe(false);
      expect(res.isRollback).toBe(false);
    });

    it('accepts valid apply invocation on staging with confirmation', () => {
      const res = parseMigrationCli(['--apply', '--target=staging', '--confirm-phase2-indexes'], defaultOptions);
      expect(res.target).toBe('staging');
      expect(res.isApply).toBe(true);
    });

    it('accepts valid apply invocation on production with both confirmations', () => {
      const res = parseMigrationCli([
        '--apply',
        '--target=production',
        '--confirm-phase2-indexes',
        '--confirm-production-indexes'
      ], defaultOptions);
      expect(res.target).toBe('production');
      expect(res.isApply).toBe(true);
    });
  });

  describe('validateTargetAndDbConfig Database Identity & Fingerprint Verification', () => {
    it('refuses local target without --allow-local flag', () => {
      expect(() => validateTargetAndDbConfig({ target: 'local', hasAllowLocal: false }))
        .toThrow("Execution targeting 'local' requires explicit --allow-local flag");
    });

    it('accepts local target with --allow-local flag and defaults to loopback', () => {
      const config = validateTargetAndDbConfig({ target: 'local', hasAllowLocal: true, env: {} });
      expect(config.target).toBe('local');
      expect(config.mongoUri).toContain('localhost');
      expect(config.sanitizedFingerprint).toMatch(/^sha256:/);
    });

    it('refuses staging target when MONGODB_URI is missing', () => {
      expect(() => validateTargetAndDbConfig({ target: 'staging', env: {} }))
        .toThrow('MONGODB_URI environment variable is strictly required');
    });

    it('refuses staging target when MIGRATION_ENVIRONMENT does not match', () => {
      const env = {
        MONGODB_URI: 'mongodb://cluster0.example.net:27017/staging_db',
        MIGRATION_ENVIRONMENT: 'development'
      };
      expect(() => validateTargetAndDbConfig({ target: 'staging', env }))
        .toThrow("MIGRATION_ENVIRONMENT environment variable must be explicitly set to 'staging'");
    });

    it('refuses staging target when MIGRATION_EXPECTED_DB_FINGERPRINT is missing', () => {
      const env = {
        MONGODB_URI: 'mongodb://cluster0.example.net:27017/staging_db',
        MIGRATION_ENVIRONMENT: 'staging'
      };
      expect(() => validateTargetAndDbConfig({ target: 'staging', env }))
        .toThrow('MIGRATION_EXPECTED_DB_FINGERPRINT environment variable is strictly required');
    });

    it('refuses staging target when fingerprint does not match computed value', () => {
      const env = {
        MONGODB_URI: 'mongodb://cluster0.example.net:27017/staging_db',
        MIGRATION_ENVIRONMENT: 'staging',
        MIGRATION_EXPECTED_DB_FINGERPRINT: 'sha256:000000000000'
      };
      expect(() => validateTargetAndDbConfig({ target: 'staging', env }))
        .toThrow('Database fingerprint verification failed');
    });

    it('accepts staging target when MONGODB_URI, environment, and fingerprint match perfectly', () => {
      const uri = 'mongodb://cluster0.example.net:27017/staging_db';
      const parsed = parseMongoUri(uri);
      const env = {
        MONGODB_URI: uri,
        MIGRATION_ENVIRONMENT: 'staging',
        MIGRATION_EXPECTED_DB_FINGERPRINT: parsed.sanitizedFingerprint
      };
      const validated = validateTargetAndDbConfig({ target: 'staging', env });
      expect(validated.target).toBe('staging');
      expect(validated.fingerprint).toBe(parsed.sha256Fingerprint);
    });
  });
});
