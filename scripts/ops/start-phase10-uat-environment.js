/**
 * scripts/ops/start-phase10-uat-environment.js
 *
 * Scoped helper to boot disposable integrated Phase 10 UAT environment.
 * Meets all Phase 10 Batch 10C Disposable Integration Requirements.
 *
 * Safety Guards:
 * - Loopback-only bindings (127.0.0.1)
 * - Protected baseline container/volume/network preservation
 * - Unique Compose project name: mevapur_uat_p10c_<runId>
 * - Dynamically allocated verified-free loopback host ports (never 6379, 8000, 5432, etc.)
 * - Isolated replica set rs0 + Redis + Backend + Storefront + Admin
 * - Deterministic fixture seed via seed-uat-fixtures.js & seed-governed-commerce-config.js
 * - Verification against baseline to prove zero modifications to existing containers
 * - Ephemeral secrets and compose files stored EXTERNALLY outside git repository
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const mongoose = require(path.resolve(__dirname, '../../backend/node_modules/mongoose'));
const { captureBaseline, verifyAgainstBaseline } = require('./capture-protected-baseline');
const { seedCommerceConfig } = require('./seed-governed-commerce-config');

const repoRoot = path.resolve(__dirname, '..', '..');
const UAT_RUN_DIR = process.env.DISPOSABLE_ENV_DIR || path.join(os.tmpdir(), 'mevapur-uat');
const ACTIVE_ENV_FILE = process.env.DISPOSABLE_ENV_FILE || path.join(UAT_RUN_DIR, 'disposable-env-active.json');

const PROTECTED_PORTS = new Set([
  6379,  // mevapur_redis
  8000,  // mevapur_webserver
  5432,  // mevapur_db
  7700,  // mevapur_meilisearch
  1025,  // mevapur_mailpit smtp
  8025,  // mevapur_mailpit http
  27017, // default mongo
  5000,  // default backend
  3000,  // default storefront
  3001,  // default admin
  80     // default proxy
]);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => {
        if (PROTECTED_PORTS.has(port)) {
          return resolve(getFreePort());
        }
        resolve(port);
      });
    });
  });
}

async function allocateFreePorts() {
  const allocated = new Set();
  async function nextUnique() {
    let port;
    do {
      port = await getFreePort();
    } while (allocated.has(port) || PROTECTED_PORTS.has(port));
    allocated.add(port);
    return port;
  }

  const mongoPort = await nextUnique();
  const redisPort = await nextUnique();
  const backendPort = await nextUnique();
  const storefrontPort = await nextUnique();
  const adminPort = await nextUnique();

  return { mongoPort, redisPort, backendPort, storefrontPort, adminPort };
}

function checkHttp(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHttp(url, maxAttempts = 30, intervalMs = 2000) {
  for (let i = 1; i <= maxAttempts; i++) {
    const ok = await checkHttp(url);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function generateComposeFile(config) {
  const {
    projectName,
    runId,
    mongoPort,
    redisPort,
    backendPort,
    storefrontPort,
    adminPort,
    redisPassword,
    jwtSecret,
    jwtRefreshSecret,
    csrfSecret,
    otpPepperSecret,
    dbName,
  } = config;

  return `
# Auto-generated ephemeral Compose topology for ${projectName}
services:
  mongodb:
    image: mongo:7.0.14-jammy
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "127.0.0.1:${mongoPort}:27017"
    networks:
      - uat_net
    volumes:
      - mongo_data:/data/db
    labels:
      com.docker.compose.project: "${projectName}"
    healthcheck:
      test: ["CMD-SHELL", "mongosh --quiet --eval 'try { rs.status().ok === 1 && db.hello().isWritablePrimary === true ? quit(0) : quit(1) } catch(e) { quit(1) }'"]
      interval: 3s
      timeout: 3s
      retries: 20

  redis:
    image: redis:7.4.1-alpine3.20
    command: ["redis-server", "--requirepass", "${redisPassword}"]
    ports:
      - "127.0.0.1:${redisPort}:6379"
    networks:
      - uat_net
    volumes:
      - redis_data:/data
    labels:
      com.docker.compose.project: "${projectName}"
    healthcheck:
      test: ["CMD-SHELL", "REDISCLI_AUTH=${redisPassword} redis-cli ping || exit 1"]
      interval: 3s
      timeout: 3s
      retries: 20

  backend:
    image: mevapur/backend:test-probe
    ports:
      - "127.0.0.1:${backendPort}:5000"
    networks:
      - uat_net
    environment:
      - PORT=5000
      - HOST=0.0.0.0
      - NODE_ENV=development
      - APP_ENV=development
      - RATE_LIMIT_STORE=redis
      - RATE_LIMIT_MAX=10000
      - REDIS_URL=redis://:${redisPassword}@redis:6379
      - MONGODB_URI=mongodb://mongodb:27017/${dbName}?replicaSet=rs0&directConnection=true
      - FRONTEND_URL=http://127.0.0.1:${storefrontPort}
      - ADMIN_URL=http://127.0.0.1:${adminPort}
      - BACKEND_PUBLIC_URL=http://127.0.0.1:${backendPort}
      - TRUSTED_ORIGINS=http://localhost:${storefrontPort},http://localhost:${adminPort},http://127.0.0.1:${storefrontPort},http://127.0.0.1:${adminPort}
      - MOCK_PAYMENT_GATEWAY=true
      - MOCK_EMAIL_SERVICE=true
      - MOCK_SMS_SERVICE=true
      - PAYMENT_PROVIDER_STRIPE_ENABLED=true
      - STRIPE_SECRET_KEY=sk_test_mock_stripe_key_phase10_uat_001
      - STRIPE_PUBLISHABLE_KEY=pk_test_mock_stripe_pub_phase10_uat_001
      - STRIPE_WEBHOOK_SECRET=whsec_mock_stripe_webhook_phase10_uat_001
      - UAT_MOCK_OTP=123456
      - JWT_SECRET=${jwtSecret}
      - JWT_REFRESH_SECRET=${jwtRefreshSecret}
      - CSRF_SECRET=${csrfSecret}
      - OTP_PEPPER_SECRET=${otpPepperSecret}
      - PHASE10_UAT_RUN_ID=${runId}
    labels:
      com.docker.compose.project: "${projectName}"
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy

  storefront:
    image: node:24.20.0-alpine3.24
    working_dir: /app
    command: ["node", "server.js"]
    ports:
      - "127.0.0.1:${storefrontPort}:3000"
    networks:
      - uat_net
    environment:
      - PORT=3000
      - HOSTNAME=0.0.0.0
      - NODE_ENV=production
      - INTERNAL_API_URL=http://backend:5000
      - NEXT_PUBLIC_API_URL=http://127.0.0.1:${backendPort}
      - NEXT_PUBLIC_SITE_NAME=HARZAAR
      - NEXT_PUBLIC_SITE_URL=http://127.0.0.1:${storefrontPort}
    volumes:
      - ${repoRoot.replace(/\\/g, '/')}/frontend/.next/standalone:/app:ro
      - ${repoRoot.replace(/\\/g, '/')}/frontend/public:/app/public:ro
      - ${repoRoot.replace(/\\/g, '/')}/frontend/.next/static:/app/.next/static:ro
    labels:
      com.docker.compose.project: "${projectName}"
    depends_on:
      backend:
        condition: service_started

  admin:
    image: mevapur-commerce-admin:latest
    working_dir: /app
    command: ["node", "server.js"]
    ports:
      - "127.0.0.1:${adminPort}:3001"
    networks:
      - uat_net
    environment:
      - PORT=3001
      - HOSTNAME=0.0.0.0
      - NODE_ENV=production
      - APP_ENV=uat
      - API_URL=http://127.0.0.1:${backendPort}
      - BACKEND_PUBLIC_URL=http://127.0.0.1:${backendPort}
      - INTERNAL_API_URL=http://backend:5000
      - NEXT_PUBLIC_API_URL=http://127.0.0.1:${backendPort}
      - NEXT_PUBLIC_SITE_NAME=HARZAAR
      - NEXT_PUBLIC_ADMIN_URL=http://127.0.0.1:${adminPort}
    labels:
      com.docker.compose.project: "${projectName}"
    depends_on:
      backend:
        condition: service_started

networks:
  uat_net:
    name: ${projectName}_net
    driver: bridge

volumes:
  mongo_data:
    name: ${projectName}_mongo_data
  redis_data:
    name: ${projectName}_redis_data
`;
}

async function main() {
  console.log('================================================================');
  console.log(' Phase 10 Batch 10C Disposable UAT Environment Bootstrap');
  console.log('================================================================');

  fs.mkdirSync(UAT_RUN_DIR, { recursive: true });

  // Step 1: Capture and verify baseline of pre-existing protected resources
  captureBaseline();
  verifyAgainstBaseline();

  // Step 2: Generate unique project name and run ID
  const runId = Math.random().toString(36).substring(2, 10);
  const projectName = `mevapur_uat_p10c_${runId}`;
  console.log(`[BOOTSTRAP] Generated unique Compose project: ${projectName}`);

  // Step 3: Allocate verified-free loopback host ports
  const ports = await allocateFreePorts();
  console.log('[BOOTSTRAP] Dynamically allocated free loopback ports:');
  console.log(`  - MongoDB:    127.0.0.1:${ports.mongoPort}`);
  console.log(`  - Redis:      127.0.0.1:${ports.redisPort} (protected 6379 strictly avoided)`);
  console.log(`  - Backend:    127.0.0.1:${ports.backendPort}`);
  console.log(`  - Storefront: 127.0.0.1:${ports.storefrontPort}`);
  console.log(`  - Admin:      127.0.0.1:${ports.adminPort}`);

  // Step 4: Ephemeral secrets and configuration (stored externally)
  const redisPassword = crypto.randomBytes(16).toString('hex');
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const jwtRefreshSecret = crypto.randomBytes(32).toString('hex');
  const csrfSecret = crypto.randomBytes(32).toString('hex');
  const otpPepperSecret = crypto.randomBytes(32).toString('hex');
  const dbName = 'mevapur_uat_phase10';

  const config = {
    runId,
    projectName,
    ...ports,
    redisPassword,
    jwtSecret,
    jwtRefreshSecret,
    csrfSecret,
    otpPepperSecret,
    dbName,
    endpoints: {
      backendUrl: `http://127.0.0.1:${ports.backendPort}`,
      storefrontUrl: `http://127.0.0.1:${ports.storefrontPort}`,
      adminUrl: `http://127.0.0.1:${ports.adminPort}`,
      mongoUri: `mongodb://127.0.0.1:${ports.mongoPort}/${dbName}?replicaSet=rs0&directConnection=true`,
      redisUrl: `redis://:${redisPassword}@127.0.0.1:${ports.redisPort}`,
    },
  };

  // Step 5: Write ephemeral docker-compose file in external directory
  const composeFile = path.join(UAT_RUN_DIR, `docker-compose.uat.${runId}.yml`);
  config.composeFile = composeFile;
  const composeContent = generateComposeFile(config);
  fs.writeFileSync(composeFile, composeContent, 'utf8');
  console.log(`[BOOTSTRAP] Wrote external ephemeral Compose specification: ${composeFile}`);

  // Step 6: Start infrastructure services (mongodb & redis)
  console.log(`[BOOTSTRAP] Starting isolated MongoDB replica set and Redis containers...`);
  execSync(`docker compose -p ${projectName} -f "${composeFile}" up -d mongodb redis`, {
    cwd: UAT_RUN_DIR,
    stdio: 'inherit',
  });

  // Step 7: Wait for MongoDB port and initiate rs0
  console.log(`[BOOTSTRAP] Waiting for MongoDB on 127.0.0.1:${ports.mongoPort}...`);
  let mongoConnected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const conn = await mongoose.createConnection(`mongodb://127.0.0.1:${ports.mongoPort}/admin?directConnection=true`, {
        serverSelectionTimeoutMS: 2000,
      }).asPromise();
      console.log(`[BOOTSTRAP] Initiating MongoDB single-node replica set rs0...`);
      try {
        await conn.db.admin().command({
          replSetInitiate: {
            _id: 'rs0',
            members: [{ _id: 0, host: 'mongodb:27017' }]
          }
        });
        console.log(`[BOOTSTRAP] Replica set rs0 initiated.`);
      } catch (rsErr) {
        if (!rsErr.message.includes('already initialized')) {
          console.warn(`[WARN] replSetInitiate notice:`, rsErr.message);
        }
      }
      await conn.close();
      mongoConnected = true;
      break;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!mongoConnected) {
    throw new Error(`Failed to initialize MongoDB replica set rs0 on port ${ports.mongoPort}`);
  }

  // Step 8: Seed deterministic UAT fixtures & governed config
  console.log(`[BOOTSTRAP] Seeding deterministic UAT fixtures...`);
  const seedScript = path.resolve(__dirname, 'seed-uat-fixtures.js');
  execSync(`node "${seedScript}" --apply-token=PHASE10_UAT_SEED_CONFIRMED`, {
    cwd: repoRoot,
    env: {
      ...process.env,
      UAT_MONGODB_URI: config.endpoints.mongoUri,
      UAT_FIXTURE_PASSWORD: 'UatPassword_2026_Secure!',
      NODE_ENV: 'test',
      APP_ENV: 'development',
    },
    stdio: 'inherit',
  });

  console.log(`[BOOTSTRAP] Seeding governed commerce configuration...`);
  await seedCommerceConfig(config.endpoints.mongoUri);

  // Step 9: Start remaining application containers (backend, storefront, admin)
  console.log(`[BOOTSTRAP] Starting backend, storefront, and admin containers...`);
  execSync(`docker compose -p ${projectName} -f "${composeFile}" up -d backend storefront admin`, {
    cwd: UAT_RUN_DIR,
    stdio: 'inherit',
  });

  // Step 10: Wait for HTTP health endpoints
  console.log(`[BOOTSTRAP] Polling HTTP readiness endpoints...`);
  const backendReadyUrl = `http://127.0.0.1:${ports.backendPort}/health/ready`;
  const storefrontHealthUrl = `http://127.0.0.1:${ports.storefrontPort}/healthz`;
  const adminHealthUrl = `http://127.0.0.1:${ports.adminPort}/healthz`;

  console.log(`  - Checking Backend (${backendReadyUrl})...`);
  const backendOk = await waitForHttp(backendReadyUrl, 30, 2000);
  if (!backendOk) {
    throw new Error(`Backend readiness failed on ${backendReadyUrl}`);
  }
  console.log(`  ✓ Backend healthy.`);

  console.log(`  - Checking Storefront (${storefrontHealthUrl})...`);
  const storefrontOk = await waitForHttp(storefrontHealthUrl, 30, 2000);
  if (!storefrontOk) {
    throw new Error(`Storefront healthcheck failed on ${storefrontHealthUrl}`);
  }
  console.log(`  ✓ Storefront healthy.`);

  console.log(`  - Checking Admin Panel (${adminHealthUrl})...`);
  const adminOk = await waitForHttp(adminHealthUrl, 30, 2000);
  if (!adminOk) {
    throw new Error(`Admin Panel healthcheck failed on ${adminHealthUrl}`);
  }
  console.log(`  ✓ Admin Panel healthy.`);

  // Step 11: Verify against protected baseline to prove zero modifications
  verifyAgainstBaseline();

  // Step 12: Write active environment manifest externally
  fs.writeFileSync(ACTIVE_ENV_FILE, JSON.stringify(config, null, 2), 'utf8');

  const teardownCmd = `docker compose -p ${projectName} -f "${composeFile}" down -v`;

  console.log('\n================================================================');
  console.log(' DISPOSABLE UAT ENVIRONMENT IS ACTIVE & VERIFIED');
  console.log('================================================================');
  console.log(`Compose Project:    ${projectName}`);
  console.log(`Backend API:        http://127.0.0.1:${ports.backendPort}`);
  console.log(`Storefront:         http://127.0.0.1:${ports.storefrontPort}`);
  console.log(`Admin Panel:        http://127.0.0.1:${ports.adminPort}`);
  console.log(`MongoDB ReplicaSet: mongodb://127.0.0.1:${ports.mongoPort}/${dbName}?replicaSet=rs0&directConnection=true`);
  console.log(`Redis Cache:        redis://127.0.0.1:${ports.redisPort}`);
  console.log('----------------------------------------------------------------');
  console.log('Protected Baseline: 100% Intact and Verified.');
  console.log(`Exact Project-Scoped Teardown Command (DO NOT EXECUTE):`);
  console.log(`  ${teardownCmd}`);
  console.log('================================================================\n');

  return config;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[FATAL ERROR] Disposable bootstrap failed:', err);
    process.exit(1);
  });
}

module.exports = { main, getFreePort, allocateFreePorts, ACTIVE_ENV_FILE };
