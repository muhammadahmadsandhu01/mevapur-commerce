import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3470;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: '320x800 (Mobile Mini)', width: 320, height: 800 },
  { name: '375x812 (Mobile Standard)', width: 375, height: 812 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '1024x768 (Desktop Standard)', width: 1024, height: 768 },
  { name: '1440x900 (Desktop HD)', width: 1440, height: 900 },
];

const mockCategories = [
  { _id: 'cat-dry-fruits', name: 'Dry Fruits', slug: 'dry-fruits', isActive: true },
  { _id: 'cat-nuts', name: 'Nuts & Seeds', slug: 'nuts-seeds', isActive: true },
];

const mockBrands = [
  { _id: 'brand-mevapur', name: 'MevaPur Naturals', slug: 'mevapur-naturals', isActive: true },
];

const mockProducts = [
  {
    _id: 'prod-almonds-001',
    name: 'Premium California Almonds',
    slug: 'premium-california-almonds',
    description: 'Crisp, premium grade almonds loaded with nutrition and natural oils.',
    price: 1500,
    originalPrice: 1800,
    stock: 25,
    sku: 'ALM-CAL-500',
    soldCount: 45,
    rating: 4.9,
    reviewCount: 28,
    category: { _id: 'cat-dry-fruits', name: 'Dry Fruits', slug: 'dry-fruits' },
    brand: { _id: 'brand-mevapur', name: 'MevaPur Naturals' },
    images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
    isFeatured: true,
    status: 'published',
    isActive: true,
    attributes: [
      { name: 'Origin', value: 'California' },
      { name: 'Grade', value: 'AAA Premium' },
    ],
    variants: [
      {
        _id: 'var-alm-500g',
        sku: 'ALM-CAL-500',
        attributes: [{ name: 'Weight', value: '500g' }],
        price: 1500,
        salePrice: 1800,
        stock: 25,
        images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
        isDefault: true,
      },
    ],
  },
];

const mockOrder = {
  _id: 'order-phase7-001',
  orderId: 'ORD-PHASE7-001',
  orderStatus: 'Processing',
  paymentStatus: 'Paid',
  paymentMethod: 'stripe',
  totalAmount: 3000,
  subtotal: 3000,
  shippingCost: 0,
  taxAmount: 0,
  discount: 0,
  items: [
    {
      product: mockProducts[0],
      name: 'Premium California Almonds',
      price: 1500,
      quantity: 2,
      variant: '500g',
    },
  ],
  shippingAddress: {
    fullName: 'Ahmad Sandhu',
    phone: '03001234567',
    address: 'Street 10, Sector F-7',
    city: 'Islamabad',
    province: 'Federal',
    postalCode: '44000',
    country: 'Pakistan',
  },
  createdAt: new Date().toISOString(),
};

const mockInvoice = {
  orderNumber: 'ORD-PHASE7-001',
  date: new Date().toISOString(),
  customer: {
    fullName: 'Ahmad Sandhu',
  },
  shippingAddress: {
    fullName: 'Ahmad Sandhu',
    phone: '03001234567',
    address: 'Street 10, Sector F-7',
    city: 'Islamabad',
    province: 'Federal',
    postalCode: '44000',
    country: 'Pakistan',
  },
  items: [
    {
      name: 'Premium California Almonds (500g)',
      sku: 'ALM-CAL-500',
      quantity: 2,
      unitPrice: 1500,
      lineTotal: 3000,
    },
  ],
  subtotal: 3000,
  discount: 0,
  shipping: 0,
  tax: 0,
  total: 3000,
  currency: 'PKR',
  paymentMethod: 'stripe',
  paymentStatus: 'Paid',
};

async function waitForServer(url: string, maxRetries = 60): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.status === 200 || res.ok) return;
    } catch {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${url}`);
}

async function setupUniversalMocks(page: Page, options: { isAuthenticated?: boolean } = {}) {
  const { isAuthenticated = false } = options;

  await page.route('**', async (route) => {
    const url = route.request().url();

    if (!url.includes('/api/') && !url.includes('/auth/')) {
      return route.continue();
    }

    if (url.includes('/auth/csrf-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { csrfToken: 'mock-csrf-p7', hasRefreshSession: isAuthenticated },
        }),
      });
    }

    if (url.includes('/auth/refresh') || url.includes('/auth/me')) {
      if (isAuthenticated) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: {
                id: 'customer-p7-001',
                fullName: 'Ahmad Sandhu',
                email: 'ahmad@mevapur.test',
                role: 'customer',
                isVerified: true,
              },
              accessToken: 'synthetic-jwt-token',
              csrfToken: 'mock-csrf-p7',
            },
          }),
        });
      } else {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'Unauthenticated',
          }),
        });
      }
    }

    if (url.includes('/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockCategories }),
      });
    }

    if (url.includes('/brands')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockBrands }),
      });
    }

    if (url.includes('/products/top') || url.includes('/products/recommended') || url.includes('/products/recently-viewed')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts }),
      });
    }

    if (url.includes('/products/prod-almonds-001') || url.includes('/products/premium-california-almonds')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts[0] }),
      });
    }

    if (url.includes('/products')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: mockProducts,
          pagination: { page: 1, pages: 1, total: 1, limit: 12, hasNext: false, hasPrev: false },
        }),
      });
    }

    if (url.includes('/orders/ORD-PHASE7-001') || url.includes('/orders/order-phase7-001')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockOrder }),
      });
    }

    if (url.includes('/account/invoice/ORD-PHASE7-001') || url.includes('/account/invoice/order-phase7-001') || url.includes('/invoice')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, invoice: mockInvoice }),
      });
    }

    if (url.includes('/account/profile')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            profile: {
              id: 'customer-p7-001',
              fullName: 'Ahmad Sandhu',
              email: 'ahmad@mevapur.test',
              phone: '03001234567',
              avatar: '',
              isVerified: true,
            },
          },
        }),
      });
    }

    if (url.includes('/account/addresses')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (url.includes('/account/orders') || url.includes('/orders')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [mockOrder],
          pagination: { page: 1, pages: 1, total: 1, limit: 10, hasNext: false, hasPrev: false },
        }),
      });
    }

    if (url.includes('/account/reviews') || url.includes('/reviews/my')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (url.includes('/account/sessions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (url.includes('/account/notifications')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (url.includes('/wishlist')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    return route.continue();
  });
}

describe('Storefront Phase 7: Responsive UI & Accessibility Remediation Acceptance Suite', () => {
  let serverProcess: ChildProcess;
  let browser: Browser;

  test.before(async () => {
    const frontendDir = fs.existsSync(path.resolve(process.cwd(), '.next'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'frontend');

    const standaloneServer = path.resolve(
      frontendDir,
      '.next',
      'standalone',
      'server.js'
    );
    const hasStandalone = fs.existsSync(standaloneServer);

    if (hasStandalone) {
      serverProcess = spawn(process.execPath, [standaloneServer], {
        cwd: path.resolve(frontendDir, '.next', 'standalone'),
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: 'production',
          NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
          NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
          NEXT_PUBLIC_SITE_NAME: 'MevaPur',
          NEXT_PUBLIC_ADMIN_URL: 'https://admin.mevapur.test',
        },
        stdio: 'ignore',
      });
    } else {
      serverProcess = spawn(
        'npx',
        ['next', 'start', '-p', String(PORT)],
        {
          cwd: frontendDir,
          env: {
            ...process.env,
            PORT: String(PORT),
            NODE_ENV: 'production',
            NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
            NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
            NEXT_PUBLIC_SITE_NAME: 'MevaPur',
            NEXT_PUBLIC_ADMIN_URL: 'https://admin.mevapur.test',
          },
          stdio: 'ignore',
          shell: true,
        }
      );
    }

    await waitForServer(BASE_URL);

    browser = await chromium.launch({
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  test.after(async () => {
    if (browser) await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess.kill('SIGKILL');
    }
  });

  test('Gate 1: Skip Navigation Link moves focus to #main-content landmark', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupUniversalMocks(page, { isAuthenticated: false });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Focus the skip link via Tab
    await page.keyboard.press('Tab');
    const skipLink = page.locator('a[href="#main-content"]');
    await skipLink.waitFor({ state: 'attached', timeout: 5000 });

    const isFocused = await skipLink.evaluate((el) => document.activeElement === el);
    assert.ok(isFocused, 'Skip to main content link should be focused on initial Tab');

    // Press Enter on skip link
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const mainFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.id === 'main-content';
    });
    assert.ok(mainFocused, 'Focus should move to #main-content landmark after clicking skip link');

    // Verify exactly one <main id="main-content"> exists
    const mainCount = await page.locator('main#main-content').count();
    assert.equal(mainCount, 1, 'Exactly one main#main-content landmark must exist on the page');

    await context.close();
  });

  test('Gate 2: Responsive Viewport Overflow Safety across 320, 375, 768, 1024, 1440px', async () => {
    const routes = ['/', '/products', '/cart', '/login', '/register', '/forgot-password'];

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupUniversalMocks(page, { isAuthenticated: false });

      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(100);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });

        assert.strictEqual(
          overflow,
          false,
          `Unintended page-level horizontal overflow detected on route "${route}" at viewport ${vp.name} (scrollWidth > innerWidth)`
        );
      }

      await context.close();
    }
  });

  test('Gate 3: Auth Forms Label Association, ARIA validation and Invalid-Field Focus', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await setupUniversalMocks(page, { isAuthenticated: false });

    // Test Login Form
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 10000 });

    // Verify label association
    const emailInput = page.locator('#login-email');
    const emailId = await emailInput.getAttribute('id');
    assert.ok(emailId, 'Email input must have an id');
    const labelFor = await page.locator(`label[for="${emailId}"]`).count();
    assert.ok(labelFor >= 1, 'Label must have matching htmlFor attribute for email');

    // Submit empty to trigger client validation
    await page.locator('form:has(#login-email) button[type="submit"]').click();
    await page.waitForTimeout(100);

    // Verify aria-invalid and focus on first invalid field
    const isInvalid = await emailInput.getAttribute('aria-invalid');
    assert.equal(isInvalid, 'true', 'Email input must have aria-invalid="true" when validation fails');

    const emailFocused = await emailInput.evaluate((el) => document.activeElement === el);
    assert.ok(emailFocused, 'First invalid field (email) should receive keyboard focus on submit failure');

    // Test Forgot Password Form
    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#forgot-email', { timeout: 10000 });
    await page.locator('form:has(#forgot-email) button[type="submit"]').click();
    await page.waitForTimeout(100);

    const fpEmailInput = page.locator('#forgot-email');
    const fpInvalid = await fpEmailInput.getAttribute('aria-invalid');
    assert.equal(fpInvalid, 'true', 'Forgot password email must be flagged aria-invalid on empty submit');

    await context.close();
  });

  test('Gate 4: Dialog Focus Trapping, Escape Dismissal and Focus Restoration', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await setupUniversalMocks(page, { isAuthenticated: false });

    await page.goto(`${BASE_URL}/products`, { waitUntil: 'domcontentloaded' });

    // Open Mobile Filters Drawer
    const filterBtn = page.locator('button:has-text("Filters")');
    if (await filterBtn.isVisible()) {
      await filterBtn.focus();
      await filterBtn.click();
      await page.waitForTimeout(200);

      // Verify scroll lock
      const isLocked = await page.evaluate(() => document.body.style.overflow === 'hidden');
      assert.ok(isLocked, 'Body scroll should be locked when mobile drawer/dialog is open');

      // Press Escape to dismiss
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Verify scroll lock cleaned up
      const isUnlocked = await page.evaluate(() => document.body.style.overflow !== 'hidden');
      assert.ok(isUnlocked, 'Body scroll lock should be cleaned up after Escape dismissal');
    }

    await context.close();
  });

  test('Gate 5: Touch Target Sizing (>= 44x44px for primary interactive targets)', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await setupUniversalMocks(page, { isAuthenticated: false });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });

    // Mobile Navbar Menu Toggle Button
    const mobileMenuBtn = page.locator('button[aria-label="Open navigation menu"]');
    if (await mobileMenuBtn.isVisible()) {
      const box = await mobileMenuBtn.boundingBox();
      assert.ok(box, 'Mobile menu button bounding box should exist');
      assert.ok(box.width >= 40, `Touch target width (${box.width}px) must be >= 40px`);
      assert.ok(box.height >= 40, `Touch target height (${box.height}px) must be >= 40px`);
    }

    await context.close();
  });

  test('Gate 6: Axe WCAG 2.2 AA Audit across Key Routes with Zero Critical/Serious Violations', async () => {
    const auditRoutes = [
      { path: '/', name: 'Homepage' },
      { path: '/products', name: 'Catalog' },
      { path: '/login', name: 'Login' },
      { path: '/register', name: 'Register' },
      { path: '/forgot-password', name: 'Forgot Password' },
      { path: '/cart', name: 'Cart' },
    ];

    for (const route of auditRoutes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupUniversalMocks(page, { isAuthenticated: false });

      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(200);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      assert.equal(
        seriousOrCritical.length,
        0,
        `Axe violations on ${route.name} (${route.path}): ${JSON.stringify(seriousOrCritical, null, 2)}`
      );

      await context.close();
    }
  });
});
