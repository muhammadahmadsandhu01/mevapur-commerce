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

test('Production Standalone Server Runtime CSP and Browser Verification', async () => {
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

    // 1. Verify Response Headers from required routes
    const routesToTest = [
      '/',
      '/products',
      '/orders',
      '/payment-result',
      '/payment-instructions',
    ];

    for (const route of routesToTest) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`);
      const csp = res.headers.get('content-security-policy');
      assert.ok(csp, `Missing Content-Security-Policy header on ${route}`);

      // Verify production restrictions
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

    // 2. Launch Chromium against the production server
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
        if (text.includes('Content Security Policy') || text.includes('CSP')) {
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
