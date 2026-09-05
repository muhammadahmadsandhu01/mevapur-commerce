import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

function runBuild(appDir, envOverrides) {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log(`[BUILD] Running next build in ${appDir} with env: ${JSON.stringify(envOverrides)}`);
  
  const child = spawnSync(npxCmd, ['next', 'build'], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ...envOverrides,
    },
    stdio: 'inherit',
    shell: true,
  });

  if (child.status !== 0) {
    throw new Error(`Build in ${appDir} failed with status ${child.status}`);
  }
}

function verifyApp(appName) {
  const root = process.cwd();
  const appDir = join(root, appName);
  const nextDir = join(appDir, '.next');
  const standaloneDir = join(nextDir, 'standalone');
  const standaloneServer = join(standaloneDir, 'server.js');

  console.log(`\n======================================================`);
  console.log(`VERIFYING BUILD MODES FOR: ${appName}`);
  console.log(`======================================================`);

  // Step A: Clean .next
  console.log(`[CLEAN] Removing ${nextDir} before Vercel build...`);
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
  }

  // Step B: VERCEL=1 build
  console.log(`[STEP 1] Executing VERCEL=1 build in ${appName}...`);
  runBuild(appDir, { VERCEL: '1' });

  // Step C: Assert standalone does NOT exist
  const vercelStandaloneExists = existsSync(standaloneDir);
  console.log(`[ASSERT] Vercel mode standalone directory exists: ${vercelStandaloneExists}`);
  assert.equal(vercelStandaloneExists, false, `Vercel mode MUST NOT produce ${standaloneDir}`);
  console.log(`[PASS] Vercel build output verified: no standalone directory present.`);

  // Step D: Clean .next again
  console.log(`[CLEAN] Removing ${nextDir} before standalone build...`);
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
  }

  // Step E: Non-Vercel build (VERCEL unset)
  console.log(`[STEP 2] Executing non-Vercel standalone build in ${appName}...`);
  const nonVercelEnv = { ...process.env };
  delete nonVercelEnv.VERCEL;
  runBuild(appDir, { VERCEL: undefined });

  // Step F: Assert standalone/server.js DOES exist
  const standaloneServerExists = existsSync(standaloneServer);
  console.log(`[ASSERT] Standalone server.js exists: ${standaloneServerExists}`);
  assert.equal(standaloneServerExists, true, `Non-Vercel mode MUST produce ${standaloneServer}`);
  console.log(`[PASS] Self-hosted standalone build output verified: ${standaloneServer} exists.`);
}

try {
  const targetApp = process.argv[2];
  if (targetApp) {
    verifyApp(targetApp);
  } else {
    verifyApp('admin-panel');
    verifyApp('frontend');
  }
  console.log(`\n======================================================`);
  console.log(`ALL BUILD OUTPUT VERIFICATIONS PASSED SUCCESSFULLY!`);
  console.log(`======================================================\n`);
  process.exit(0);
} catch (err) {
  console.error(`\n[FATAL ERROR] Verification failed:`, err);
  process.exit(1);
}
