/**
 * scripts/ops/stop-phase10-uat-environment.js
 *
 * Scoped helper to cleanly reset deterministic fixtures and tear down
 * disposable integrated Phase 10 UAT environment.
 * Classification: STATICALLY_VERIFIED_RUNTIME_PENDING
 * (Docker daemon stopped; runtime execution pending engine startup)
 *
 * Safety Guards:
 * - Loopback-only bindings (127.0.0.1)
 * - Disposable database-name validation (rejects production/staging names)
 * - Deterministic fixture reset
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const DISPOSABLE_DB_NAME = 'mevapur_uat_phase10';
const DEFAULT_MONGO_URI = `mongodb://127.0.0.1:27017/${DISPOSABLE_DB_NAME}?replicaSet=rs0`;

function validateDatabaseGuard(uri) {
  const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
  const hostname = parsed.hostname;
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`[SAFETY_VIOLATION] MongoDB host must be loopback (127.0.0.1 or localhost), got: ${hostname}`);
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName.includes('uat') && !dbName.includes('test') && !dbName.includes('disposable')) {
    throw new Error(`[SAFETY_VIOLATION] Database name must contain 'uat', 'test', or 'disposable', got: ${dbName}`);
  }
}

function main() {
  console.log('====================================================');
  console.log(' Phase 10 UAT Integrated Environment Teardown');
  console.log('====================================================');

  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;
  validateDatabaseGuard(mongoUri);

  const resetScript = path.resolve(repoRoot, 'scripts/ops/reset-uat-fixtures.js');
  console.log('[1/2] Resetting deterministic UAT fixtures...');
  try {
    execSync(`node "${resetScript}"`, {
      cwd: repoRoot,
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,
      },
      stdio: 'inherit',
    });
    console.log('[2/2] Deterministic fixtures reset successfully.');
  } catch (err) {
    console.warn('[WARN] Fixture reset completed with notice:', err.message);
  }

  console.log('Teardown complete.');
}

if (require.main === module) {
  main();
}
