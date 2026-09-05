import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function runIsolatedAdminConfigEvaluation(envOverrides: Record<string, string | undefined>) {
  const helperPath = join(process.cwd(), 'tests', 'helpers', 'evalConfig.mts');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  const child = spawnSync(npxCmd, ['tsx', helperPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...envOverrides,
    },
    encoding: 'utf8',
    shell: true,
  });

  if (child.status !== 0) {
    throw new Error(`Child process failed with code ${child.status}: ${child.stderr || child.stdout}`);
  }

  const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
  const jsonLine = lines[lines.length - 1];
  return JSON.parse(jsonLine);
}

test('Admin Panel next.config.ts separates Vercel and standalone outputs in isolated processes', () => {
  // 1. VERCEL=1 mode: output property MUST be completely absent (not undefined)
  const vercelResult = runIsolatedAdminConfigEvaluation({
    VERCEL: '1',
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'https://api.mevapur.test'
  });
  assert.equal(vercelResult.hasOutput, false, 'In VERCEL=1 mode, output property must be completely absent');
  assert.equal(vercelResult.outputVal, undefined);

  // 2. Non-Vercel mode (VERCEL unset): output property MUST be 'standalone'
  const nonVercelResult = runIsolatedAdminConfigEvaluation({
    VERCEL: '',
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'https://api.mevapur.test'
  });
  assert.equal(nonVercelResult.hasOutput, true, 'In non-Vercel mode, output property must exist');
  assert.equal(nonVercelResult.outputVal, 'standalone', 'In non-Vercel mode, output must be standalone');

  // 3. VERCEL=0 mode: output property MUST be 'standalone'
  const vercelZeroResult = runIsolatedAdminConfigEvaluation({
    VERCEL: '0',
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'https://api.mevapur.test'
  });
  assert.equal(vercelZeroResult.hasOutput, true);
  assert.equal(vercelZeroResult.outputVal, 'standalone');
});

test('Admin Panel next.config.ts preserves security headers and settings across build modes', () => {
  for (const vercelFlag of ['1', '']) {
    const result = runIsolatedAdminConfigEvaluation({
      VERCEL: vercelFlag,
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'https://api.mevapur.test'
    });

    assert.equal(result.ignoreBuildErrors, false);
    assert.equal(result.imageUnoptimized, true);
    assert.equal(result.serverMinification, false);

    assert.ok(result.headerKeys.includes('Content-Security-Policy'));
    assert.ok(result.headerKeys.includes('X-Content-Type-Options'));
    assert.ok(result.headerKeys.includes('Referrer-Policy'));
    assert.ok(result.headerKeys.includes('X-Frame-Options'));
    assert.ok(result.headerKeys.includes('Permissions-Policy'));
    assert.ok(result.headerKeys.includes('X-Robots-Tag'));
  }
});

test('Admin Panel package.json engines declaration is Vercel-compatible', () => {
  const pkgPath = join(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  assert.ok(pkg.engines, 'engines field must exist in package.json');
  assert.equal(pkg.engines.node, '24.x', 'engines.node must be declared as 24.x for Vercel compatibility');
  assert.equal(pkg.engines.npm, '>=10.0.0', 'engines.npm must be >=10.0.0');

  // Verify that Vercel runtime Node 24.19.0 and LTS 24.20.0 match the 24.x specification
  const majorNode = (version: string) => version.split('.')[0];
  assert.equal(majorNode('24.19.0'), '24', 'Vercel platform Node 24.19.0 satisfies 24.x');
  assert.equal(majorNode('24.20.0'), '24', 'LTS Node 24.20.0 satisfies 24.x');
});
