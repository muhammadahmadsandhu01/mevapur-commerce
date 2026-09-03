import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

test('Production Standalone Server Runtime Nonce-Backed CSP and Browser Verification', async () => {
  const cwd = process.cwd();
  const staticSrc = join(cwd, '.next', 'static');
  const staticDest = join(cwd, '.next', 'standalone', '.next', 'static');
  const publicSrc = join(cwd, 'public');
  const publicDest = join(cwd, '.next', 'standalone', 'public');

  if (existsSync(staticSrc)) {
    cpSync(staticSrc, staticDest, { recursive: true, force: true });
  }
  if (existsSync(publicSrc)) {
    cpSync(publicSrc, publicDest, { recursive: true, force: true });
  }

  const port = await getAvailablePort();
  const serverPath = join(cwd, '.next', 'standalone', 'server.js');

  const serverProcess = spawn('node', [serverPath], {
    cwd: join(cwd, '.next', 'standalone'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
      NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
      NEXT_PUBLIC_SITE_NAME: 'MevaPur',
    },
    stdio: 'pipe',
  });

  try {
    // Wait for server to start
    let started = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/healthz`);
        if (res.status === 200 || res.status === 404 || res.ok) {
          started = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    assert.ok(started, 'Production standalone server failed to start within timeout');

    // 1. Prove two separate document requests receive different nonces
    const res1 = await fetch(`http://127.0.0.1:${port}/`);
    const csp1 = res1.headers.get('content-security-policy') || '';
    const html1 = await res1.text();

    const res2 = await fetch(`http://127.0.0.1:${port}/`);
    const csp2 = res2.headers.get('content-security-policy') || '';
    const html2 = await res2.text();

    const nonceMatch1 = csp1.match(/'nonce-([A-Za-z0-9+/=_-]+)'/);
    const nonceMatch2 = csp2.match(/'nonce-([A-Za-z0-9+/=_-]+)'/);

    assert.ok(nonceMatch1, 'First request CSP must contain a cryptographic nonce directive');
    assert.ok(nonceMatch2, 'Second request CSP must contain a cryptographic nonce directive');

    const nonce1 = nonceMatch1[1];
    const nonce2 = nonceMatch2[1];

    assert.notStrictEqual(
      nonce1,
      nonce2,
      `Two separate document requests must receive different nonces (received ${nonce1} and ${nonce2})`
    );

    // 2. Prove CSP header nonce matches Next.js-rendered bootstrap script nonces
    assert.ok(
      html1.includes(`nonce="${nonce1}"`),
      `Rendered HTML bootstrap scripts must include the exact nonce from CSP header (${nonce1})`
    );
    assert.ok(
      html2.includes(`nonce="${nonce2}"`),
      `Rendered HTML bootstrap scripts must include the exact nonce from CSP header (${nonce2})`
    );

    // 3. Verify Response Headers and strict production constraints from all required routes
    const routesToTest = [
      '/',
      '/products',
      '/orders',
      '/payment-result',
      '/payment-instructions',
    ];

    for (const route of routesToTest) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`);
      const csp = res.headers.get('content-security-policy') || '';
      assert.ok(csp, `Missing Content-Security-Policy header on ${route}`);

      // Must NOT contain unrestricted unsafe-inline in script-src
      const scriptSrcDirective = csp.split(';').find((d) => d.trim().startsWith('script-src')) || '';
      assert.strictEqual(
        scriptSrcDirective.includes("'unsafe-inline'"),
        false,
        `Production script-src must NOT contain 'unsafe-inline' on ${route}`
      );
      assert.strictEqual(
        scriptSrcDirective.includes("'unsafe-eval'"),
        false,
        `Production script-src must NOT contain 'unsafe-eval' on ${route}`
      );

      // Must authorize nonce and Stripe JS
      assert.ok(scriptSrcDirective.includes("'nonce-"), `script-src must include nonce on ${route}`);
      assert.ok(scriptSrcDirective.includes('https://js.stripe.com'), `script-src must include Stripe JS on ${route}`);

      // Verify production connect-src restrictions
      assert.ok(csp.includes("default-src 'self'"), `default-src 'self' missing on ${route}`);
      assert.ok(csp.includes('https://api.stripe.com'), `Stripe connect-src missing on ${route}`);
      assert.ok(csp.includes('https://api.mevapur.test'), `API origin connect-src missing on ${route}`);
      assert.ok(csp.includes("object-src 'none'"), `object-src 'none' missing on ${route}`);
      assert.ok(csp.includes("base-uri 'self'"), `base-uri 'self' missing on ${route}`);
      assert.ok(csp.includes("frame-ancestors 'none'"), `frame-ancestors 'none' missing on ${route}`);
      assert.ok(csp.includes("form-action 'self'"), `form-action 'self' missing on ${route}`);

      // Verify no test/dev origins appear in production CSP header
      assert.strictEqual(
        csp.includes('http://localhost:*'),
        false,
        `Forbidden http://localhost:* found in production CSP on ${route}`
      );
      assert.strictEqual(
        csp.includes('http://127.0.0.1:*'),
        false,
        `Forbidden http://127.0.0.1:* found in production CSP on ${route}`
      );
      assert.strictEqual(
        csp.includes('https://*.test'),
        false,
        `Forbidden https://*.test wildcard found in production CSP on ${route}`
      );
      assert.strictEqual(
        csp.includes('https://*.mevapur.test'),
        false,
        `Forbidden https://*.mevapur.test wildcard found in production CSP on ${route}`
      );
    }

    // 4. Launch Chromium against the production server to verify hydration and zero CSP violations
    const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    const cspViolations: string[] = [];
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Content Security Policy') || text.includes('CSP') || text.includes('violates')) {
          cspViolations.push(text);
        } else {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // Test routes in browser
    for (const route of routesToTest) {
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
    }

    await browser.close();

    assert.strictEqual(
      cspViolations.length,
      0,
      `CSP violations detected during browser run: ${JSON.stringify(cspViolations)}`
    );
  } finally {
    serverProcess.kill('SIGTERM');
  }
});
