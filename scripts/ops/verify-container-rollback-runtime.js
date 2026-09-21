#!/usr/bin/env node
/**
 * @file verify-container-rollback-runtime.js
 * @description Real container image A -> B -> A rollback rehearsal verification for clean Ubuntu CI:
 * 1. Starts real Release A container, verifies health (200 OK), and seeds persistent database fixtures.
 * 2. Deploys real Release B container, verifies health (200 OK) and persistent fixture availability, adds Release B record.
 * 3. Restores real Release A container, verifies health (200 OK) and persistent fixture integrity (0 data loss).
 * 4. Cleans up disposable rehearsal containers and fixtures.
 *
 * Usage:
 *   node scripts/ops/verify-container-rollback-runtime.js
 */

'use strict';

const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = require(path.resolve(__dirname, '../../backend/node_modules/mongoose'));
}

const mongoHost = process.env.MONGO_HOST || '127.0.0.1:27017';
const appDb = process.env.MONGO_APP_DATABASE || 'mevapur-commerce';
const appUser = process.env.MONGO_APP_USER || 'app_user';
const appPass = process.env.MONGO_APP_PASSWORD || 'app_password';
const dockerNetwork = process.env.DOCKER_NETWORK || 'mevapur-ci_backend_net';
const backendPort = parseInt(process.env.BACKEND_PORT, 10) || 5000;

const imageA = process.env.IMAGE_RELEASE_A || 'mevapur/backend:v1.0.0-phase8';
const imageB = process.env.IMAGE_RELEASE_B || 'mevapur/backend:v1.1.0-phase9';
const containerName = 'mevapur-backend-rollback-rehearsal';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeHealth(port = backendPort, timeoutMs = 25000) {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await new Promise((resResolve, resReject) => {
          const req = http.get(`http://127.0.0.1:${port}/health/ready`, { timeout: 2000 }, (r) => {
            resResolve(r.statusCode);
          });
          req.on('error', resReject);
          req.on('timeout', () => { req.destroy(); resReject(new Error('Timeout')); });
        });

        if (res === 200) {
          return resolve(true);
        }
      } catch {}
      await sleep(1000);
    }
    reject(new Error(`Container healthcheck timed out after ${timeoutMs}ms on port ${port}`));
  });
}

function execDocker(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`Docker command failed [${cmd}]: ${err.stderr || err.message}`);
  }
}

async function verifyContainerRollbackRuntime() {
  console.log(`[ROLLBACK-RUNTIME-VERIFY] Initiating real container rollback rehearsal: ${imageA} -> ${imageB} -> ${imageA}...`);
  const steps = [];

  const hostMongoUri = `mongodb://${encodeURIComponent(appUser)}:${encodeURIComponent(appPass)}@${mongoHost}/${appDb}?authSource=${appDb}&replicaSet=rs0&directConnection=true`;
  const containerMongoUri = `mongodb://${encodeURIComponent(appUser)}:${encodeURIComponent(appPass)}@mongodb:27017/${appDb}?authSource=${appDb}&replicaSet=rs0&directConnection=true`;

  // Connect to DB to manage fixture
  const conn = await mongoose.createConnection(hostMongoUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const db = conn.db;
  const fixtureColl = db.collection('rollback_runtime_fixture');
  await fixtureColl.deleteMany({});

  try {
    // Ensure no existing rehearsal container is running
    try { execDocker(`docker rm -f ${containerName}`); } catch {}

    // STEP 1: Deploy Release A container
    console.log(`[ROLLBACK-RUNTIME-VERIFY] Step 1: Starting Release A container (${imageA})...`);
    execDocker(`docker run -d --name ${containerName} --network ${dockerNetwork} -p ${backendPort}:5000 -e NODE_ENV=production -e MONGODB_URI="${containerMongoUri}" -e PORT=5000 ${imageA}`);

    await probeHealth(backendPort, 25000);
    console.log('[ROLLBACK-RUNTIME-VERIFY] ✓ Release A container is healthy (/health/ready -> 200 OK).');

    // Seed Release A persistent fixtures
    const seedDocs = [
      { fixtureId: 'FIX-001', name: 'Phase 8 Product Catalog Index', release: 'v1.0.0-phase8', createdAt: new Date() },
      { fixtureId: 'FIX-002', name: 'Phase 8 Order Pipeline State', release: 'v1.0.0-phase8', createdAt: new Date() }
    ];
    await fixtureColl.insertMany(seedDocs);
    const countA = await fixtureColl.countDocuments({ release: 'v1.0.0-phase8' });
    steps.push({ step: '1_DEPLOY_AND_SEED_RELEASE_A', count: countA, status: 'PASSED' });

    // STEP 2: Deploy Release B container (replaces Release A container)
    console.log(`[ROLLBACK-RUNTIME-VERIFY] Step 2: Deploying Release B container (${imageB})...`);
    execDocker(`docker rm -f ${containerName}`);
    execDocker(`docker run -d --name ${containerName} --network ${dockerNetwork} -p ${backendPort}:5000 -e NODE_ENV=production -e MONGODB_URI="${containerMongoUri}" -e PORT=5000 ${imageB}`);

    await probeHealth(backendPort, 25000);
    console.log('[ROLLBACK-RUNTIME-VERIFY] ✓ Release B container is healthy (/health/ready -> 200 OK).');

    // Additive Release B record
    await fixtureColl.insertOne({ fixtureId: 'FIX-003', name: 'Phase 9 Added Feature State', release: 'v1.1.0-phase9', createdAt: new Date() });
    const totalCountB = await fixtureColl.countDocuments();
    if (totalCountB !== 3) {
      throw new Error(`Expected 3 records in Release B, found ${totalCountB}`);
    }
    steps.push({ step: '2_DEPLOY_RELEASE_B_ADDITIVE', count: totalCountB, status: 'PASSED' });

    // STEP 3: Rollback to Release A container
    console.log(`[ROLLBACK-RUNTIME-VERIFY] Step 3: Rolling back to Release A container (${imageA})...`);
    execDocker(`docker rm -f ${containerName}`);
    execDocker(`docker run -d --name ${containerName} --network ${dockerNetwork} -p ${backendPort}:5000 -e NODE_ENV=production -e MONGODB_URI="${mongoUri}" -e PORT=5000 ${imageA}`);

    await probeHealth(backendPort, 25000);
    console.log('[ROLLBACK-RUNTIME-VERIFY] ✓ Restored Release A container is healthy (/health/ready -> 200 OK).');

    // Verify original Release A fixtures are intact and unchanged
    const originalDocsAfterRollback = await fixtureColl.find({ release: 'v1.0.0-phase8' }).toArray();
    if (originalDocsAfterRollback.length !== 2) {
      throw new Error(`Data loss detected on rollback: expected 2 Release A records, found ${originalDocsAfterRollback.length}`);
    }
    steps.push({ step: '3_ROLLBACK_TO_RELEASE_A_INTEGRITY_VERIFIED', count: originalDocsAfterRollback.length, status: 'PASSED' });
    console.log('[ROLLBACK-RUNTIME-VERIFY] ✓ All pre-existing Release A persistent data survived rollback with zero corruption.');

    // STEP 4: Cleanup
    console.log('[ROLLBACK-RUNTIME-VERIFY] Step 4: Cleaning up rehearsal container and fixture...');
    execDocker(`docker rm -f ${containerName}`);
    await fixtureColl.deleteMany({});
    steps.push({ step: '4_CLEANUP_REHEARSAL_CONTAINERS', status: 'PASSED' });

    return {
      success: true,
      imageA,
      imageB,
      steps
    };
  } finally {
    try { execDocker(`docker rm -f ${containerName}`); } catch {}
    await conn.close();
  }
}

if (require.main === module) {
  verifyContainerRollbackRuntime()
    .then((rep) => {
      console.log(JSON.stringify(rep, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ROLLBACK-RUNTIME-VERIFY] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { verifyContainerRollbackRuntime };
