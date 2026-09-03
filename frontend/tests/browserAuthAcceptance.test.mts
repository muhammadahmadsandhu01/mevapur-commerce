import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3461;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: '320x800 (Mobile Mini)', width: 320, height: 800 },
  { name: '375x812 (Mobile Standard)', width: 375, height: 812 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '1440x900 (Desktop HD)', width: 1440, height: 900 },
];

async function waitForServer(url: string, maxRetries = 60): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/login`);
      if (res.status === 200) return;
    } catch {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${url}`);
}

async function setupSyntheticApiMocks(page: Page) {
  await page.route('**', async (route) => {
    const url = route.request().url();

    if (!url.includes('/auth/') && !url.includes('/api/')) {
      return route.continue();
    }

    if (url.includes('/auth/csrf-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            csrfToken: 'synthetic-test-csrf-token',
            hasRefreshSession: false,
          },
        }),
      });
    }

    if (url.includes('/auth/me') || url.includes('/api/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: 'customer-001',
              fullName: 'Ahmad Sandhu',
              email: 'shopper@mevapur.test',
              role: 'customer',
              isVerified: true,
            },
          },
        }),
      });
    }

    if (url.includes('/auth/login') || url.includes('/api/auth/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: 'customer-001',
              fullName: 'Ahmad Sandhu',
              email: 'shopper@mevapur.test',
              role: 'customer',
            },
            accessToken: 'synthetic-jwt-customer-token',
            csrfToken: 'synthetic-test-csrf-token',
          },
          message: 'Login successful!',
        }),
      });
    }

    if (url.includes('/auth/register') || url.includes('/api/auth/register')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              _id: 'customer-002',
              fullName: 'New Customer',
              email: 'newcustomer@mevapur.test',
              role: 'customer',
            },
            accessToken: 'synthetic-jwt-new-token',
            csrfToken: 'synthetic-test-csrf-token',
          },
          message: 'Registration successful!',
        }),
      });
    }

    if (url.includes('/auth/forgot-password') || url.includes('/api/auth/forgot-password')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Password reset instructions have been sent',
        }),
      });
    }

    if (url.includes('/auth/reset-password') || url.includes('/api/auth/reset-password')) {
      const postData = route.request().postDataJSON?.() || {};
      if (postData.resetToken && postData.newPassword) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Password reset successful!',
          }),
        });
      }
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { message: 'Password reset failed. The token may be expired or invalid.' },
        }),
      });
    }

    return route.continue();
  });
}

describe('Storefront Local Browser & Runtime Acceptance Suite (Chrome Chromium)', () => {
  let serverProcess: ChildProcess;
  let browser: Browser;

  test.before(async () => {
    const standaloneDir = path.resolve('.next/standalone');
    const serverScript = path.resolve(standaloneDir, 'server.js');

    const staticSrc = path.resolve('.next/static');
    const staticDst = path.resolve(standaloneDir, '.next/static');
    const publicSrc = path.resolve('public');
    const publicDst = path.resolve(standaloneDir, 'public');

    if (fs.existsSync(staticSrc) && !fs.existsSync(staticDst)) {
      fs.mkdirSync(path.dirname(staticDst), { recursive: true });
      fs.cpSync(staticSrc, staticDst, { recursive: true });
    }
    if (fs.existsSync(publicSrc) && !fs.existsSync(publicDst)) {
      fs.cpSync(publicSrc, publicDst, { recursive: true });
    }

    serverProcess = spawn(process.execPath, [serverScript], {
      env: {
        ...process.env,
        PORT: PORT.toString(),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT}`,
        NEXT_PUBLIC_SITE_NAME: 'MevaPur Commerce',
      },
      stdio: 'pipe',
    });

    serverProcess.stderr?.on('data', (d) => {
      const msg = d.toString();
      if (!msg.includes('ExperimentalWarning')) {
        console.error(`[Server stderr]: ${msg}`);
      }
    });

    await waitForServer(BASE_URL);

    browser = await chromium.launch({
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  });

  test.after(async () => {
    if (browser) await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  test('Public Auth Routes: Hydration, Password Toggle & Zero Console Errors', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('404')) {
          consoleErrors.push(text);
        }
      }
    });

    await setupSyntheticApiMocks(page);

    // 1. Visit Login Page
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    // Verify Brand Logo or Title
    const brandElement = page.locator('h1, h2, img, svg').first();
    assert.ok(await brandElement.isVisible(), 'Brand element must be visible');

    // Password input and toggle button
    const passwordInput = page.locator('input[type="password"]').first();
    if ((await passwordInput.count()) > 0) {
      await passwordInput.fill('TestPassword123!');
      const toggleButton = page.locator('button[aria-label*="password" i]').first();
      if ((await toggleButton.count()) > 0) {
        await toggleButton.click();
        const inputType = await page.locator('input[value="TestPassword123!"]').first().getAttribute('type');
        assert.equal(inputType, 'text', 'Password toggle should switch input type to text');
      }
    }

    assert.equal(
      consoleErrors.filter(e => !e.includes('ERR_NAME_NOT_RESOLVED')).length,
      0,
      `There must be zero unexpected console errors on login route: ${JSON.stringify(consoleErrors)}`
    );

    await context.close();
  });

  test('Forgot Password: Anti-Enumeration Request & Success State', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupSyntheticApiMocks(page);

    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: 'networkidle' });

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('shopper@mevapur.test');

    const submitButton = page.getByRole('button', { name: 'Send Reset Link' });
    await submitButton.click();

    // Verify Success State
    const successTitle = page.locator('h1:has-text("Check Your Email")');
    await successTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await successTitle.isVisible(), 'Success state heading must be displayed');

    const resendButton = page.locator('button:has-text("Resend Email")');
    assert.ok(await resendButton.isVisible(), 'Resend button must be visible');

    await context.close();
  });

  test('Reset Password: Missing Token Renders Safe Alert', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupSyntheticApiMocks(page);

    // Navigate to /reset-password without token
    await page.goto(`${BASE_URL}/reset-password`, { waitUntil: 'networkidle' });

    const invalidTitle = page.locator('h2:has-text("Invalid or Missing Token")');
    await invalidTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await invalidTitle.isVisible(), 'Invalid token alert must be displayed');

    const requestLink = page.locator('a:has-text("Request Recovery Link")');
    assert.ok(await requestLink.isVisible(), 'Request recovery link button must be present');
    assert.equal(await requestLink.getAttribute('href'), '/forgot-password');

    await context.close();
  });

  test('Reset Password: Valid Token, Policy Checklist & Form Submission', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupSyntheticApiMocks(page);

    // Navigate to /reset-password with token
    await page.goto(`${BASE_URL}/reset-password?token=synthetic-valid-token-123`, {
      waitUntil: 'networkidle',
    });

    const heading = page.locator('h1:has-text("Reset Your Password")');
    await heading.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await heading.isVisible(), 'Reset password heading must be visible');

    // Fill new password and confirm password
    const newPasswordInput = page.locator('#reset-new-password');
    const confirmPasswordInput = page.locator('#reset-confirm-password');

    await newPasswordInput.fill('Secure#Pass2026!');
    await confirmPasswordInput.fill('Secure#Pass2026!');

    const submitBtn = page.getByRole('button', { name: 'Set New Password' });
    await submitBtn.click();

    // Verify Success Screen
    const completeHeading = page.locator('h2:has-text("Password Reset Complete")');
    await completeHeading.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await completeHeading.isVisible(), 'Password reset complete heading must be visible');

    const loginBtn = page.locator('button:has-text("Proceed to Login")');
    assert.ok(await loginBtn.isVisible(), 'Proceed to Login button must be visible');

    await context.close();
  });

  test('Responsive Viewports & Horizontal Overflow Safety (320px to 1440px)', async () => {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupSyntheticApiMocks(page);

      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      assert.equal(
        hasHorizontalOverflow,
        false,
        `Horizontal overflow detected at viewport ${vp.name} on /login`
      );

      await context.close();
    }
  });

  test('Axe Automated Accessibility Audit (Zero Critical, Zero Serious Violations)', async () => {
    const routesToAudit = [
      { path: '/login', name: 'Login Page' },
      { path: '/register', name: 'Register Page' },
      { path: '/forgot-password', name: 'Forgot Password Page' },
      { path: '/reset-password?token=synthetic-valid-token-123', name: 'Reset Password Page' },
    ];

    for (const route of routesToAudit) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupSyntheticApiMocks(page);

      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle' });

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const criticalViolations = axeResults.violations.filter((v) => v.impact === 'critical');
      const seriousViolations = axeResults.violations.filter((v) => v.impact === 'serious');

      assert.equal(
        criticalViolations.length,
        0,
        `Critical accessibility violations found on ${route.name}: ${JSON.stringify(criticalViolations.map((v) => v.description))}`
      );
      assert.equal(
        seriousViolations.length,
        0,
        `Serious accessibility violations found on ${route.name}: ${JSON.stringify(seriousViolations.map((v) => v.description))}`
      );

      await context.close();
    }
  });
});
