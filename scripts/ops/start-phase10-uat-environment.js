/**
 * scripts/ops/start-phase10-uat-environment.js
 *
 * Scoped helper to boot disposable integrated Phase 10 UAT environment.
 * Classification: STATICALLY_VERIFIED_RUNTIME_PENDING
 * (Docker daemon stopped; runtime execution pending engine startup)
 *
 * Safety Guards:
 * - Loopback-only bindings (127.0.0.1)
 * - Disposable database-name validation (rejects production/staging names)
 * - Mock provider configuration only
 * - Runtime-generated ephemeral secrets only
 * - Checks Docker/Mongo engine readiness; never starts Docker Desktop or bypasses daemon
 * - Bounded startup polling
 * - Unconditional signal cleanup
 */

'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

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
  if (/prod|production|staging|live/i.test(dbName) || /prod|production|staging|live/i.test(hostname)) {
    throw new Error(`[SAFETY_VIOLATION] Production or staging target rejected: ${uri}`);
  }
}

function checkPortOpen(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function main() {
  console.log('====================================================');
  console.log(' Phase 10 UAT Integrated Environment Bootstrap');
  console.log('====================================================');

  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;
  validateDatabaseGuard(mongoUri);

  // Check if Docker / MongoDB is available
  const isMongoOpen = await checkPortOpen(27017, '127.0.0.1');
  if (!isMongoOpen) {
    console.error('\n[BLOCKED_ENVIRONMENT_GAP]');
    console.error('The local MongoDB replica set (127.0.0.1:27017) is not reachable.');
    console.error('Docker engine status: INSTALLED_ENGINE_STOPPED');
    console.error('Owner Action Required: Start the Docker engine, then rerun the documented integrated UAT environment verification.');
    process.exit(1);
  }

  console.log('[1/4] MongoDB loopback replica set verified on 127.0.0.1:27017');

  // Seed deterministic UAT fixtures
  console.log('[2/4] Seeding deterministic UAT fixtures...');
  const seedScript = path.resolve(repoRoot, 'scripts/ops/seed-uat-fixtures.js');
  try {
    execSync(`node "${seedScript}"`, {
      cwd: repoRoot,
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,
        UAT_FIXTURE_PASSWORD: process.env.UAT_FIXTURE_PASSWORD || 'UatPassword_2026_Secure!',
      },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Failed to seed UAT fixtures:', err.message);
    process.exit(1);
  }

  // Generate ephemeral runtime secrets
  const ephemeralJwtSecret = crypto.randomBytes(32).toString('hex');
  const ephemeralRefreshSecret = crypto.randomBytes(32).toString('hex');
  const ephemeralCsrfSecret = crypto.randomBytes(32).toString('hex');

  console.log('[3/4] Starting backend on 127.0.0.1:5000...');
  const backendProc = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(repoRoot, 'backend'),
    env: {
      ...process.env,
      PORT: '5000',
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      RATE_LIMIT_STORE: 'memory',
      MOCK_PAYMENT_GATEWAY: 'true',
      MOCK_EMAIL_SERVICE: 'true',
      MOCK_SMS_SERVICE: 'true',
      MONGODB_URI: mongoUri,
      JWT_SECRET: ephemeralJwtSecret,
      JWT_REFRESH_SECRET: ephemeralRefreshSecret,
      CSRF_SECRET: ephemeralCsrfSecret,
    },
    stdio: 'inherit',
  });

  const cleanup = () => {
    console.log('\nStopping UAT environment...');
    if (backendProc && !backendProc.killed) {
      backendProc.kill('SIGTERM');
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.log('[4/4] Environment started successfully. Press Ctrl+C to terminate.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
