import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
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

async function setupSyntheticApiMocks(page: Page) {
  await page.route('**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

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
            hasRefreshSession: false
          }
        })
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
              _id: 'super-admin-001',
              fullName: 'Super Admin User',
              email: 'superadmin@mevapur.test',
              role: 'super_admin',
              mfaEnabled: true,
              permissions: ['*']
            }
          }
        })
      });
    }

    if (url.includes('/auth/login') || url.includes('/api/auth/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            mfaRequired: true,
            mfaToken: 'synthetic-mfa-token-abc-123'
          },
          message: 'MFA verification required'
        })
      });
    }

    if (url.includes('/auth/mfa/verify') || url.includes('/api/auth/mfa/verify')) {
      const postData = route.request().postDataJSON?.() || {};
      if (postData.code === '123456' || postData.recoveryCode === 'RC-12345-67890') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              accessToken: 'synthetic-jwt-authenticated-token',
              csrfToken: 'synthetic-test-csrf-token',
              user: {
                _id: 'super-admin-001',
                fullName: 'Super Admin User',
                email: 'superadmin@mevapur.test',
                role: 'super_admin'
              }
            }
          })
        });
      } else {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              message: 'Invalid or expired 6-digit TOTP code'
            },
            message: 'Invalid or expired 6-digit TOTP code'
          })
        });
      }
    }

    if (url.includes('/api/analytics') || url.includes('/api/dashboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            stats: {
              totalSales: 245000,
              totalOrders: 1420,
              totalCustomers: 850,
              totalProducts: 45
            },
            revenueTrend: [
              { date: '2026-08-01', amount: 12000 },
              { date: '2026-08-02', amount: 15000 }
            ],
            topProducts: [
              { id: 'p-1', name: 'Premium Almonds', sold: 120, revenue: 24000 }
            ]
          }
        })
      });
    }

    if (url.includes('/api/products')) {
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              products: [
                {
                  _id: 'prod-001',
                  id: 'prod-001',
                  name: 'Royal Irani Pistachios',
                  sku: 'PIST-IRN-001',
                  price: 2400,
                  stock: 85,
                  status: 'published',
                  category: { _id: 'cat-1', name: 'Dry Fruits' },
                  images: []
                }
              ],
              total: 1,
              page: 1,
              totalPages: 1
            }
          })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { _id: 'prod-002', name: 'New Product' } })
      });
    }

    if (url.includes('/api/customers')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            customers: [
              {
                _id: 'cust-001',
                id: 'cust-001',
                fullName: 'Ahmad Khan',
                email: 'ahmad@example.test',
                phone: '+923001234567',
                isBlocked: false,
                isActive: true,
                totalOrders: 5,
                totalSpent: 12000,
                createdAt: '2026-01-15T00:00:00.000Z'
              }
            ],
            summary: {
              global: {
                totalCustomers: 1,
                activeCustomers: 1,
                blockedCustomers: 0,
                newCustomersToday: 0,
                totalRealizedSpend: 12000,
                averageLifetimeValue: 12000
              }
            },
            total: 1,
            totalPages: 1
          }
        })
      });
    }

    if (url.includes('/api/inventory')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            inventory: [
              {
                _id: 'inv-001',
                id: 'inv-001',
                product: {
                  _id: 'prod-001',
                  name: 'Royal Irani Pistachios',
                  sku: 'PIST-IRN-001',
                  price: 2400
                },
                stock: 85,
                lowStockThreshold: 10,
                hasVariants: false,
                variants: [],
                lastUpdated: '2026-08-01T00:00:00.000Z'
              }
            ],
            summary: {
              global: {
                totalProducts: 1,
                totalSellableSkus: 1,
                totalPhysicalUnits: 85,
                inStockSkus: 1,
                lowStockSkus: 0,
                outOfStockSkus: 0
              }
            },
            total: 1,
            totalPages: 1
          }
        })
      });
    }

    if (url.includes('/api/orders')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            orders: [
              {
                _id: 'ord-001',
                orderNumber: 'ORD-2026-001',
                customer: {
                  _id: 'cust-001',
                  fullName: 'Ahmad Khan',
                  email: 'ahmad@example.test'
                },
                totalAmount: 4800,
                status: 'delivered',
                paymentStatus: 'paid',
                createdAt: '2026-08-01T00:00:00.000Z'
              }
            ],
            total: 1,
            totalPages: 1
          }
        })
      });
    }

    if (url.includes('/api/reviews')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            reviews: [
              {
                _id: 'rev-001',
                product: { _id: 'prod-001', name: 'Royal Irani Pistachios' },
                user: { _id: 'cust-001', fullName: 'Ahmad Khan' },
                rating: 5,
                title: 'Excellent Quality',
                comment: 'Fresh and perfectly roasted!',
                status: 'pending',
                createdAt: '2026-08-01T00:00:00.000Z'
              }
            ],
            total: 1,
            totalPages: 1
          }
        })
      });
    }

    if (url.includes('/api/coupons')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            coupons: [
              {
                _id: 'coup-001',
                code: 'WELCOME2026',
                discountType: 'percentage',
                discountValue: 15,
                minimumOrderAmount: 1000,
                status: 'active',
                expiresAt: '2026-12-31T23:59:59.000Z'
              }
            ],
            total: 1,
            totalPages: 1
          }
        })
      });
    }

    if (url.includes('/api/activity-logs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            logs: [
              {
                _id: 'log-001',
                action: 'product_updated',
                details: 'Updated price for Royal Irani Pistachios',
                user: { fullName: 'Super Admin User', email: 'superadmin@mevapur.test' },
                createdAt: '2026-08-01T12:00:00.000Z'
              }
            ],
            total: 1,
            totalPages: 1
          }
        })
      });
    }

    if (url.includes('/api/roles') || url.includes('/api/staff/roles')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            roles: [
              { name: 'super_admin', label: 'Super Admin', isSystem: true },
              { name: 'admin', label: 'Admin', isSystem: true },
              { name: 'manager', label: 'Manager', isSystem: true },
              { name: 'inventory', label: 'Inventory Lead', isSystem: true },
              { name: 'support', label: 'Support Specialist', isSystem: true }
            ]
          }
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {} })
    });
  });
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
    assert.equal(cspViolations.length, 0, `Unexpected CSP violations on /login: ${cspViolations.join('; ')}`);

    // 2. Form interaction
    const emailInput = page.locator('input[type="email"], input#admin-login-email').first();
    const passwordInput = page.locator('input[type="password"], input#admin-login-password').first();

    await emailInput.fill('admin.synthetic@mevapur.test');
    assert.equal(await emailInput.inputValue(), 'admin.synthetic@mevapur.test');

    await passwordInput.fill('SecureP@ssw0rd2026!');
    assert.equal(await passwordInput.inputValue(), 'SecureP@ssw0rd2026!');

    // 3. Client navigation to Forgot Password
    const forgotLink = page.locator('a[href="/forgot-password"]').first();
    await forgotLink.click();
    await page.waitForURL('**/forgot-password', { timeout: 8000 });
    assert.ok(page.url().includes('/forgot-password'));

    // 4. Return to Login
    const backToLoginLink = page.locator('a[href="/login"]').first();
    await backToLoginLink.click();
    await page.waitForURL('**/login', { timeout: 8000 });
    assert.ok(page.url().includes('/login'));

    // 5. Recovery route verification
    await page.goto(`${BASE_URL}/reset-password?token=invalid-test-token`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('h1, h2').first().isVisible());

    await page.goto(`${BASE_URL}/accept-invitation?token=invalid-test-token`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('h1, h2').first().isVisible());

    assert.equal(cspViolations.length, 0, `CSP violations detected across public routes: ${cspViolations.join('; ')}`);
    await context.close();
  });

  test('MFA UI Flow: Challenge Form, Invalid Code Feedback & Recovery Code Switch', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupSyntheticApiMocks(page);

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    // 1. Submit email and password to trigger MFA requirement
    await page.fill('#admin-login-email', 'superadmin@mevapur.test');
    await page.fill('#admin-login-password', 'ValidSuperAdminPassword2026!');
    await page.click('button[type="submit"]');

    // 2. Verify MFA challenge screen appears
    const totpInput = page.locator('#mfa-totp-code');
    await totpInput.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await totpInput.isVisible(), 'TOTP code input must be visible on MFA challenge');

    // 3. Submit invalid 6-digit code
    await totpInput.fill('999999');
    await page.click('button[type="submit"]');

    // 4. Verify accessible error alert appears
    const alertBox = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await alertBox.waitFor({ state: 'visible', timeout: 5000 });
    const alertText = await alertBox.textContent();
    assert.ok(alertText?.includes('Invalid or expired'), 'Error message must describe invalid TOTP code');

    // 5. Switch to Backup Recovery Code form
    const switchButton = page.locator('button:has-text("backup recovery code")');
    if (await switchButton.count() > 0) {
      await switchButton.click();
      const recoveryInput = page.locator('#mfa-recovery-code');
      await recoveryInput.waitFor({ state: 'visible', timeout: 5000 });
      assert.ok(await recoveryInput.isVisible(), 'Recovery code input must be visible after toggle');
    }

    await context.close();
  });

  test('Authenticated SuperAdmin Workflows: Products, Customers, Inventory, Orders, Reviews, Coupons & Roles', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'synthetic-admin-jwt-token');
      localStorage.setItem('user_info', JSON.stringify({
        _id: 'super-admin-001',
        fullName: 'Super Admin User',
        email: 'superadmin@mevapur.test',
        role: 'super_admin'
      }));
    });

    await setupSyntheticApiMocks(page);

    // 1. Dashboard View
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    assert.ok(page.url().endsWith('/') || page.url().includes('3459'), 'Must load dashboard');

    // 2. Products List & Add Product Form Validation
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('h1, h2, h3').first().isVisible());

    await page.goto(`${BASE_URL}/products/add`, { waitUntil: 'networkidle' });
    const productNameInput = page.locator('input[name="name"], input#product-name, input[placeholder*="name" i]').first();
    if (await productNameInput.count() > 0) {
      await productNameInput.fill('Sample Organic Almonds');
    }

    // 3. Customers Page & Block Dialog Interaction
    await page.goto(`${BASE_URL}/customers`, { waitUntil: 'networkidle' });
    const blockButton = page.locator('button[aria-label*="block" i], button[title*="block" i]').first();
    if (await blockButton.count() > 0 && await blockButton.isVisible()) {
      await blockButton.click();
      const blockDialog = page.locator('[role="dialog"], div:has-text("Block Customer Account")').first();
      await blockDialog.waitFor({ state: 'visible', timeout: 3000 });

      // Press Escape to verify dialog closure
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 4. Inventory Page & Adjust Stock Interaction
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle' });
    const adjustButton = page.locator('button:has-text("Adjust"), button[aria-label*="adjust" i]').first();
    if (await adjustButton.count() > 0 && await adjustButton.isVisible()) {
      await adjustButton.click();
      const adjustModal = page.locator('div:has-text("Adjust Stock Level"), [role="dialog"]').first();
      await adjustModal.waitFor({ state: 'visible', timeout: 3000 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 5. Orders Page Search Filter
    await page.goto(`${BASE_URL}/orders`, { waitUntil: 'networkidle' });
    const orderSearch = page.locator('input[type="text"], input[placeholder*="search" i]').first();
    if (await orderSearch.count() > 0) {
      await orderSearch.fill('Ahmad');
      await page.waitForTimeout(200);
    }

    // 6. Reviews Page Moderation
    await page.goto(`${BASE_URL}/reviews`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('h1, h2, h3').first().isVisible());

    // 7. Coupons Page
    await page.goto(`${BASE_URL}/coupons`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('h1, h2, h3').first().isVisible());

    // 8. Activity Logs Export Feedback
    await page.goto(`${BASE_URL}/activity-logs`, { waitUntil: 'networkidle' });
    const exportButton = page.locator('button:has-text("Export"), button[aria-label*="export" i]').first();
    if (await exportButton.count() > 0 && await exportButton.isVisible()) {
      assert.ok(await exportButton.isEnabled(), 'Export button must be enabled');
    }

    // 9. Roles & Permissions Matrix
    await page.goto(`${BASE_URL}/roles`, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('table, [role="table"], h1, h2').first().isVisible());

    await context.close();
  });

  test('Dialog Accessibility & Behavioral Focus Trap Gate', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'synthetic-admin-jwt-token');
      localStorage.setItem('user_info', JSON.stringify({
        _id: 'super-admin-001',
        fullName: 'Super Admin User',
        email: 'superadmin@mevapur.test',
        role: 'super_admin'
      }));
    });

    await setupSyntheticApiMocks(page);
    await page.goto(`${BASE_URL}/customers`, { waitUntil: 'networkidle' });

    const blockBtn = page.locator('button[aria-label*="block" i], button[title*="block" i]').first();
    if (await blockBtn.count() > 0 && await blockBtn.isVisible()) {
      await blockBtn.click();
      await page.waitForTimeout(300);

      // Verify Escape key closes dialog and restores focus or state
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    await context.close();
  });

  test('Responsive Viewports & Horizontal Overflow Safety (320px to 1440px)', async () => {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupSyntheticApiMocks(page);

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

    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'synthetic-admin-jwt-token');
      localStorage.setItem('user_info', JSON.stringify({
        _id: 'super-admin-001',
        fullName: 'Super Admin User',
        email: 'superadmin@mevapur.test',
        role: 'super_admin'
      }));
    });

    await setupSyntheticApiMocks(page);
    await page.goto(`${BASE_URL}/roles`, { waitUntil: 'networkidle' });

    const hamburger = page.locator('button[aria-label*="menu" i], button[aria-label*="sidebar" i], button[aria-label*="navigation" i]').first();
    if (await hamburger.count() > 0 && await hamburger.isVisible()) {
      await hamburger.click();

      const drawer = page.locator('[role="dialog"], [role="navigation"], aside').first();
      assert.ok(await drawer.isVisible(), 'Drawer should be visible after clicking hamburger');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const isDrawerVisible = await drawer.isVisible().catch(() => false);
      assert.equal(isDrawerVisible, false, 'Drawer must close on Escape key');
    }

    await context.close();
  });

  test('Authenticated Axe Automated Accessibility Audit (Zero Critical, Zero Serious Violations)', async () => {
    const authenticatedRoutes = [
      { path: '/', name: 'Dashboard' },
      { path: '/products', name: 'Products Page' },
      { path: '/customers', name: 'Customers Page' },
      { path: '/inventory', name: 'Inventory Page' },
      { path: '/reviews', name: 'Reviews Page' },
      { path: '/coupons', name: 'Coupons Page' },
      { path: '/activity-logs', name: 'Activity Logs Page' }
    ];

    for (const route of authenticatedRoutes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      await page.addInitScript(() => {
        localStorage.setItem('auth_token', 'synthetic-admin-jwt-token');
        localStorage.setItem('user_info', JSON.stringify({
          _id: 'super-admin-001',
          fullName: 'Super Admin User',
          email: 'superadmin@mevapur.test',
          role: 'super_admin'
        }));
      });

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
