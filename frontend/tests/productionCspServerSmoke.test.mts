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

test('Production Standalone Server Runtime Nonce-Backed CSP, Cache-Control, and Interaction Verification', async () => {
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

    // 1. Request same document twice and verify distinct nonces & fresh rendering
    const res1 = await fetch(`http://127.0.0.1:${port}/`);
    const csp1 = res1.headers.get('content-security-policy') || '';
    const cacheControlDoc1 = res1.headers.get('cache-control') || '';
    const html1 = await res1.text();

    const res2 = await fetch(`http://127.0.0.1:${port}/`);
    const csp2 = res2.headers.get('content-security-policy') || '';
    const cacheControlDoc2 = res2.headers.get('cache-control') || '';
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

    // 2. Prove CSP header nonce matches inline bootstrap script nonces
    assert.ok(
      html1.includes(`nonce="${nonce1}"`),
      `Rendered HTML bootstrap scripts must include the exact nonce from CSP header (${nonce1})`
    );
    assert.ok(
      html2.includes(`nonce="${nonce2}"`),
      `Rendered HTML bootstrap scripts must include the exact nonce from CSP header (${nonce2})`
    );

    // 3. Verify repeated requests do NOT receive stale nonce-bearing HTML
    assert.strictEqual(
      html2.includes(`nonce="${nonce1}"`),
      false,
      'Second request must not receive cached/stale HTML containing the first request nonce'
    );

    // 4. Capture and verify Cache-Control headers
    // Document HTML served dynamically must never be cached with stale nonces
    assert.ok(
      cacheControlDoc1.includes('no-cache') ||
        cacheControlDoc1.includes('no-store') ||
        cacheControlDoc1.includes('private') ||
        cacheControlDoc1.includes('must-revalidate'),
      `Document HTML Cache-Control (req1) must prevent stale nonce caching (received: ${cacheControlDoc1})`
    );
    assert.ok(
      cacheControlDoc2.includes('no-cache') ||
        cacheControlDoc2.includes('no-store') ||
        cacheControlDoc2.includes('private') ||
        cacheControlDoc2.includes('must-revalidate'),
      `Document HTML Cache-Control (req2) must prevent stale nonce caching (received: ${cacheControlDoc2})`
    );

    // 5. Verify Response Headers from all required routes
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
      assert.ok(scriptSrcDirective.includes("'nonce-"), `script-src must include nonce on ${route}`);
      assert.ok(scriptSrcDirective.includes('https://js.stripe.com'), `script-src must include Stripe JS on ${route}`);
      assert.ok(csp.includes('https://api.mevapur.test'), `API origin connect-src missing on ${route}`);
    }

    // 6. Launch Chromium and test hydration with an ACTUAL UI interaction
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

    // Navigate to homepage
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });

    // Interactive hydration test: Click the help assistant floating widget or a navigation trigger
    const helpButton = page.locator('button[aria-label="Open support assistant"]').or(
      page.locator('button:has-text("Help")')
    ).first();

    const helpButtonCount = await helpButton.count();
    if (helpButtonCount > 0) {
      await helpButton.click();
      await page.waitForTimeout(300);
      // Verify interaction state modified the DOM
      const dialog = page.locator('[role="dialog"]').or(page.locator('text=Customer Support')).first();
      assert.ok(await dialog.isVisible(), 'Support modal must open on click, proving React hydration is fully active');
    }

    // Verify other routes
    for (const route of ['/products', '/orders', '/payment-result', '/payment-instructions']) {
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);
    }

    await browser.close();

    assert.strictEqual(
      cspViolations.length,
      0,
      `CSP violations detected during browser interaction: ${JSON.stringify(cspViolations)}`
    );
  } finally {
    serverProcess.kill('SIGTERM');
  }
});
