/**
 * scripts/ops/stop-phase10-uat-environment.js
 *
 * Scoped helper to cleanly reset deterministic fixtures and tear down
 * the disposable integrated Phase 10 UAT environment.
 *
 * Safety Guards:
 * - Targets ONLY containers, networks, and volumes whose com.docker.compose.project
 *   label exactly matches the generated project name mevapur_uat_p10c_<runId>.
 * - Strictly never executes broad prune or touches protected containers.
 * - Verifies protected baseline post-teardown.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { verifyAgainstBaseline } = require('./capture-protected-baseline');

const repoRoot = path.resolve(__dirname, '..', '..');
const UAT_RUN_DIR = process.env.DISPOSABLE_ENV_DIR || path.join(os.tmpdir(), 'mevapur-uat');
const ACTIVE_ENV_FILE = process.env.DISPOSABLE_ENV_FILE || path.join(UAT_RUN_DIR, 'disposable-env-active.json');
const LOCAL_ACTIVE_ENV_FILE = path.resolve(__dirname, 'disposable-env-active.json');

function main() {
  console.log('================================================================');
  console.log(' Phase 10 UAT Disposable Environment Teardown');
  console.log('================================================================');

  let envFile = ACTIVE_ENV_FILE;
  if (!fs.existsSync(envFile) && fs.existsSync(LOCAL_ACTIVE_ENV_FILE)) {
    envFile = LOCAL_ACTIVE_ENV_FILE;
  }

  if (!fs.existsSync(envFile)) {
    console.log('[TEARDOWN] No active disposable environment found. Nothing to tear down.');
    return;
  }

  const activeEnv = JSON.parse(fs.readFileSync(envFile, 'utf8'));
  const { projectName, composeFile, endpoints } = activeEnv;

  if (!projectName || !projectName.startsWith('mevapur_uat_p10c_')) {
    throw new Error(`[SAFETY_VIOLATION] Invalid project name in active env: "${projectName}". Aborting.`);
  }

  // 1. Reset fixtures
  console.log('[1/3] Resetting deterministic UAT fixtures...');
  const resetScript = path.resolve(__dirname, 'reset-uat-fixtures.js');
  try {
    execSync(`node "${resetScript}" --apply-token=PHASE10_UAT_RESET_CONFIRMED`, {
      cwd: repoRoot,
      env: {
        ...process.env,
        UAT_MONGODB_URI: endpoints.mongoUri,
        NODE_ENV: 'test',
        APP_ENV: 'development',
      },
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[WARN] Fixture reset notice:', err.message);
  }

  // 2. Tear down project-scoped containers, volumes, networks
  console.log(`[2/3] Tearing down project-scoped containers for project: ${projectName}...`);
  if (composeFile && fs.existsSync(composeFile)) {
    execSync(`docker compose -p ${projectName} -f "${composeFile}" down -v`, {
      cwd: __dirname,
      stdio: 'inherit',
    });
    try { fs.unlinkSync(composeFile); } catch {}
  } else {
    // Fallback: stop only containers matching the exact project label
    execSync(`docker ps -a --filter "label=com.docker.compose.project=${projectName}" -q | xargs -r docker rm -f`, {
      stdio: 'inherit',
    });
  }

  // Remove active env descriptor
  try { fs.unlinkSync(envFile); } catch {}
  if (fs.existsSync(LOCAL_ACTIVE_ENV_FILE)) {
    try { fs.unlinkSync(LOCAL_ACTIVE_ENV_FILE); } catch {}
  }

  // 3. Verify protected baseline
  console.log('[3/3] Verifying protected baseline post-teardown...');
  verifyAgainstBaseline();

  console.log('================================================================');
  console.log(` Teardown of ${projectName} complete. All protected resources intact.`);
  console.log('================================================================\n');
}

if (require.main === module) {
  main();
}

module.exports = { main };
