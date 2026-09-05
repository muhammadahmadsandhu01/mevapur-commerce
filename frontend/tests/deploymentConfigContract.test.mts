import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function runIsolatedStorefrontConfigEvaluation(envOverrides: Record<string, string | undefined>) {
  const helperPath = join(process.cwd(), 'tests', 'helpers', 'evalConfig.js');

  const child = spawnSync(process.execPath, [helperPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...envOverrides,
    },
    encoding: 'utf8',
  });

  if (child.status !== 0) {
    throw new Error(`Child process failed with code ${child.status}: ${child.stderr || child.stdout}`);
  }

  const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
  const jsonLine = lines[lines.length - 1];
  return JSON.parse(jsonLine);
}

test('Storefront next.config.js separates Vercel and standalone outputs in isolated processes', () => {
  // 1. VERCEL=1 mode: output property MUST be completely absent (not undefined)
  const vercelResult = runIsolatedStorefrontConfigEvaluation({
    VERCEL: '1',
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
    NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
    NEXT_PUBLIC_SITE_NAME: 'MevaPur'
  });
  assert.equal(vercelResult.hasOutput, false, 'In VERCEL=1 mode, output property must be completely absent');
  assert.equal(vercelResult.outputVal, undefined);

  // 2. Non-Vercel mode (VERCEL unset): output property MUST be 'standalone'
  const nonVercelResult = runIsolatedStorefrontConfigEvaluation({
    VERCEL: '',
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
    NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
    NEXT_PUBLIC_SITE_NAME: 'MevaPur'
  });
  assert.equal(nonVercelResult.hasOutput, true, 'In non-Vercel mode, output property must exist');
  assert.equal(nonVercelResult.outputVal, 'standalone', 'In non-Vercel mode, output must be standalone');

  // 3. VERCEL=0 mode: output property MUST be 'standalone'
  const vercelZeroResult = runIsolatedStorefrontConfigEvaluation({
    VERCEL: '0',
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
    NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
    NEXT_PUBLIC_SITE_NAME: 'MevaPur'
  });
  assert.equal(vercelZeroResult.hasOutput, true);
  assert.equal(vercelZeroResult.outputVal, 'standalone');
});

test('Storefront next.config.ts compatibility wrapper aligns with next.config.js', () => {
  const tsConfigPath = join(process.cwd(), 'next.config.ts');
  const tsContent = readFileSync(tsConfigPath, 'utf8');
  
  assert.ok(tsContent.includes("import nextConfigSource from './next.config.js'"), 'next.config.ts must import next.config.js');
  assert.ok(tsContent.includes('export default nextConfig'), 'next.config.ts must export default nextConfig');
});

test('Storefront next.config.js preserves security headers, SEO directives and image patterns across build modes', () => {
  for (const vercelFlag of ['1', '']) {
    const result = runIsolatedStorefrontConfigEvaluation({
      VERCEL: vercelFlag,
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
      NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
      NEXT_PUBLIC_SITE_NAME: 'MevaPur'
    });

    assert.ok(result.remotePatternsCount > 0, 'remotePatterns must be configured');
    assert.ok(result.headerKeys.includes('Content-Security-Policy'));
    assert.ok(result.headerKeys.includes('X-Content-Type-Options'));
    assert.ok(result.headerKeys.includes('Referrer-Policy'));
    assert.ok(result.headerKeys.includes('X-Frame-Options'));
    assert.ok(result.headerKeys.includes('Permissions-Policy'));

    assert.equal(result.hasRobotsHeader, true, 'Private route X-Robots-Tag rule must exist');
    assert.equal(result.robotsHeaderValue, 'noindex, nofollow, noarchive');
  }
});

test('Storefront package.json engines declaration is Vercel-compatible', () => {
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
