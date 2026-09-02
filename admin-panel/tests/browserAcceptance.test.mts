import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3459;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: '320x800 (Mobile Mini)', width: 320, height: 800 },
  { name: '375x812 (Mobile Standard)', width: 375, height: 812 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '1024x768 (Tablet Landscape)', width: 1024, height: 768 },
  { name: '1440x900 (Desktop HD)', width: 1440, height: 900 }
];

async function waitForServer(url: string, maxRetries = 40): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/login`);
      if (res.status === 200) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${url}`);
}

describe('Local Browser & Runtime Acceptance Suite (Chrome Chromium)', () => {
  let browser: Browser;
  let serverProcess: ChildProcess;

  test.before(async () => {
    // 1. Ensure static assets exist in standalone directory
    const standaloneStatic = path.resolve(process.cwd(), '.next/standalone/.next/static');
    const rootStatic = path.resolve(process.cwd(), '.next/static');
    if (!fs.existsSync(standaloneStatic) && fs.existsSync(rootStatic)) {
      fs.cpSync(rootStatic, standaloneStatic, { recursive: true });
    }

    const standalonePublic = path.resolve(process.cwd(), '.next/standalone/public');
    const rootPublic = path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(standalonePublic) && fs.existsSync(rootPublic)) {
      fs.cpSync(rootPublic, standalonePublic, { recursive: true });
    }

    // 2. Spawn standalone server
    const serverScript = path.resolve(process.cwd(), '.next/standalone/server.js');
    serverProcess = spawn(process.execPath, [serverScript], {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production'
      },
      stdio: 'pipe'
    });

    await waitForServer(BASE_URL);

    // 3. Launch Chrome browser
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
  });

  test.after(async () => {
    if (browser) {
      await browser.close();
    }
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test('Public Routes: Hydration, Interactions, Password Toggle & Client Navigation with Zero CSP Violations', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const cspViolations: string[] = [];
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Content Security Policy') || text.includes('CSP') || text.includes('violates')) {
        cspViolations.push(text);
      }
      if (msg.type() === 'error' && !text.includes('401') && !text.includes('404')) {
        consoleErrors.push(text);
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // 1. Visit /login
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    // Assert zero CSP violations during load and hydration
    assert.equal(cspViolations.length, 0, `Unexpected CSP violations on /login: ${cspViolations.join('; ')}`);

    // 2. Verify form hydration and interactive state binding
    const emailInput = page.locator('input[type="email"], input#email').first();
    const passwordInput = page.locator('input[type="password"], input#password').first();

    await emailInput.fill('admin.synthetic@mevapur.test');
    assert.equal(await emailInput.inputValue(), 'admin.synthetic@mevapur.test');

    await passwordInput.fill('SecureP@ssw0rd2026!');
    assert.equal(await passwordInput.inputValue(), 'SecureP@ssw0rd2026!');

    // 3. Verify password visibility toggle
    const toggleButton = page.locator('button[aria-label*="password" i], button[title*="password" i]').first();
    if (await toggleButton.count() > 0) {
      await toggleButton.click();
      const typeAfterToggle = await passwordInput.getAttribute('type');
      assert.equal(typeAfterToggle, 'text', 'Password input should switch to text type when toggled');

      await toggleButton.click();
      const typeAfterSecondToggle = await passwordInput.getAttribute('type');
      assert.equal(typeAfterSecondToggle, 'password', 'Password input should switch back to password type');
    }

    // 4. Test client-side navigation to Forgot Password
    const forgotLink = page.locator('a[href="/forgot-password"]').first();
    await forgotLink.click();
    await page.waitForURL('**/forgot-password', { timeout: 8000 });
    assert.ok(page.url().includes('/forgot-password'));

    // Verify /forgot-password interaction
    const forgotEmail = page.locator('input[type="email"]').first();
    await forgotEmail.fill('recovery@mevapur.test');
    assert.equal(await forgotEmail.inputValue(), 'recovery@mevapur.test');

    // 5. Navigate back to /login via link
    const backToLoginLink = page.locator('a[href="/login"]').first();
    await backToLoginLink.click();
    await page.waitForURL('**/login', { timeout: 8000 });
    assert.ok(page.url().includes('/login'));

    // 6. Verify safe error state on /reset-password with invalid token
    await page.goto(`${BASE_URL}/reset-password?token=invalid-test-token`, { waitUntil: 'networkidle' });
    const resetHeading = page.locator('h1, h2').first();
    assert.ok(await resetHeading.isVisible(), 'Reset password heading must be visible');

    // 7. Verify safe error state on /accept-invitation with invalid token
    await page.goto(`${BASE_URL}/accept-invitation?token=invalid-test-token`, { waitUntil: 'networkidle' });
    const invitationHeading = page.locator('h1, h2').first();
    assert.ok(await invitationHeading.isVisible(), 'Accept invitation heading must be visible');

    // Assert zero CSP violations across all navigations
    assert.equal(cspViolations.length, 0, `CSP violations detected across public routes: ${cspViolations.join('; ')}`);

    await context.close();
  });

  test('Protected Route Enforcement: Unauthenticated Navigation Redirects to /login', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Visit dashboard root
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/login', { timeout: 8000 });
    assert.ok(page.url().includes('/login'), 'Unauthenticated user on root / must redirect to /login');

    // Visit /products
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/login', { timeout: 8000 });
    assert.ok(page.url().includes('/login'), 'Unauthenticated user on /products must redirect to /login');

    // Visit /roles
    await page.goto(`${BASE_URL}/roles`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/login', { timeout: 8000 });
    assert.ok(page.url().includes('/login'), 'Unauthenticated user on /roles must redirect to /login');

    await context.close();
  });

  test('Responsive Viewports & Horizontal Overflow Safety (320px to 1440px)', async () => {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      // Check horizontal overflow
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      assert.equal(hasHorizontalOverflow, false, `Horizontal overflow detected at viewport ${vp.name}`);

      await context.close();
    }
  });

  test('Mobile Navigation Drawer & Accessibility Behaviors (375px)', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    // Authenticate with synthetic local session
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'synthetic-test-jwt-token');
      localStorage.setItem('user_info', JSON.stringify({
        _id: 'test-admin-id',
        fullName: 'Test SuperAdmin',
        email: 'superadmin@mevapur.test',
        role: 'super_admin'
      }));
    });

    await page.goto(`${BASE_URL}/roles`, { waitUntil: 'networkidle' });

    // Look for hamburger menu button on mobile
    const hamburger = page.locator('button[aria-label*="menu" i], button[aria-label*="sidebar" i], button[aria-label*="navigation" i]').first();
    if (await hamburger.count() > 0 && await hamburger.isVisible()) {
      await hamburger.click();

      // Verify drawer or modal navigation opens
      const drawer = page.locator('[role="dialog"], [role="navigation"], aside').first();
      assert.ok(await drawer.isVisible(), 'Drawer should be visible after clicking hamburger');

      // Test Escape key closes drawer
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Verify focus is returned or drawer is closed
      const isDrawerVisible = await drawer.isVisible().catch(() => false);
      assert.equal(isDrawerVisible, false, 'Drawer must close on Escape key');
    }

    await context.close();
  });

  test('Axe Automated Accessibility Audit (Zero Critical, Zero Serious Violations)', async () => {
    const routesToAudit = [
      { path: '/login', name: 'Login Page' },
      { path: '/forgot-password', name: 'Forgot Password Page' },
      { path: '/accept-invitation?token=synthetic-test-token', name: 'Accept Invitation Page' },
      { path: '/reset-password?token=synthetic-test-token', name: 'Reset Password Page' }
    ];

    for (const route of routesToAudit) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle' });

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const criticalViolations = axeResults.violations.filter((v) => v.impact === 'critical');
      const seriousViolations = axeResults.violations.filter((v) => v.impact === 'serious');

      assert.equal(
        criticalViolations.length,
        0,
        `Axe found ${criticalViolations.length} CRITICAL accessibility violations on ${route.name}: ${JSON.stringify(criticalViolations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length })))}`
      );

      assert.equal(
        seriousViolations.length,
        0,
        `Axe found ${seriousViolations.length} SERIOUS accessibility violations on ${route.name}: ${JSON.stringify(seriousViolations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length })))}`
      );

      await context.close();
    }
  });
});
