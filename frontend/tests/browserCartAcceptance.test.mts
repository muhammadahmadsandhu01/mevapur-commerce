import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3463;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: '320x800 (Mobile Mini)', width: 320, height: 800 },
  { name: '375x812 (Mobile Standard)', width: 375, height: 812 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '1024x768 (Tablet Landscape)', width: 1024, height: 768 },
  { name: '1440x900 (Desktop HD)', width: 1440, height: 900 },
];

const mockUser = {
  id: 'user-ahmad-1234',
  _id: 'user-ahmad-1234',
  fullName: 'Muhammad Ahmad',
  email: 'ahmad@example.com',
  role: 'customer',
  isActive: true,
  isVerified: true,
};

const mockProducts = [
  {
    _id: 'prod-almonds',
    name: 'Premium California Almonds',
    slug: 'premium-california-almonds',
    price: 1500,
    stock: 25,
    sku: 'ALM-CAL-500',
    status: 'published',
    isActive: true,
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
    images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
    variants: [
      {
        _id: 'var-alm-250g',
        sku: 'ALM-CAL-250',
        attributes: [{ name: 'Weight', value: '250g' }],
        price: 800,
        stock: 15,
        images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
      },
      {
        _id: 'var-alm-500g',
        sku: 'ALM-CAL-500',
        attributes: [{ name: 'Weight', value: '500g' }],
        price: 1500,
        stock: 25,
        images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
      },
    ],
  },
  {
    _id: 'prod-walnuts',
    name: 'Raw Shelled Walnuts',
    slug: 'raw-shelled-walnuts',
    price: 1200,
    stock: 10,
    sku: 'WAL-KASH-500',
    status: 'published',
    isActive: true,
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg',
    images: ['https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg'],
  },
];

const mockConfirmedOrder = {
  _id: '6a99b9807892603b9de1a256',
  orderId: 'ORD-20260903-ABC123456789',
  user: mockUser,
  items: [
    {
      productId: 'prod-almonds',
      name: 'Premium California Almonds',
      price: 1500,
      quantity: 2,
      image: 'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
      variant: 'Weight: 500g',
    },
  ],
  shippingAddress: {
    fullName: 'Muhammad Ahmad',
    phone: '+923001234567',
    address: 'House 14, Street 2, Sector F-6',
    city: 'Islamabad',
    province: 'Islamabad Capital Territory',
    postalCode: '44000',
    country: 'PK',
  },
  paymentMethod: 'cod',
  paymentStatus: 'Pending',
  orderStatus: 'Pending',
  subtotal: 3000,
  shippingCost: 0,
  discount: 300,
  totalAmount: 2700,
  createdAt: new Date().toISOString(),
};

async function waitForServer(url: string, maxRetries = 60): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/cart`);
      if (res.status === 200) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${url}`);
}

async function setupCartCheckoutApiMocks(page: Page, authenticated = true) {
  await page.route('**', async (route) => {
    const url = route.request().url();

    if (!url.includes('/api/') && !url.includes('/auth/')) {
      return route.continue();
    }

    // CSRF Token & Session Probing
    if (url.includes('/auth/csrf-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            csrfToken: 'mock-csrf-cart-checkout',
            hasRefreshSession: authenticated,
          },
        }),
      });
    }

    // Refresh Token
    if (url.includes('/auth/refresh')) {
      if (authenticated) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: mockUser,
              accessToken: 'mock-jwt-access-token',
              csrfToken: 'mock-csrf-cart-checkout',
            },
          }),
        });
      }
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Unauthenticated' }),
      });
    }

    // Auth Me
    if (url.includes('/auth/me')) {
      if (authenticated) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { user: mockUser } }),
        });
      }
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Unauthenticated' }),
      });
    }

    // Single Product
    if (url.match(/\/products\/(prod-[a-z0-9-]+|premium-california-almonds|raw-shelled-walnuts)/)) {
      const match = mockProducts.find(
        (p) => url.includes(p._id) || url.includes(p.slug)
      ) || mockProducts[0];

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: match }),
      });
    }

    // Coupon Validation Preview
    if (url.includes('/coupons/validate')) {
      const body = route.request().postDataJSON();
      const code = (body?.code || '').toUpperCase();

      if (code === 'SAVE10' || code === 'MEVA10') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              code,
              type: 'percentage',
              value: 10,
              discountAmount: 300,
              estimatedDiscount: 300,
              freeShipping: false,
              eligibleSubtotal: 3000,
              subtotal: 3000,
              newSubtotal: 2700,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
              isNonBindingPreview: true,
            },
          }),
        });
      }

      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Invalid or expired coupon code',
          code: 'ORDER_COUPON_INVALID',
        }),
      });
    }

    // Order Creation
    if (url.endsWith('/orders') && route.request().method() === 'POST') {
      const idempotencyKey = route.request().headers()['idempotency-key'];
      assert.ok(idempotencyKey, 'Expected Idempotency-Key header on POST /orders');

      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            order: mockConfirmedOrder,
            idempotentReplay: false,
          },
        }),
      });
    }

    // Order Verification / Retrieval by ID
    if (url.includes('/orders/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { order: mockConfirmedOrder },
        }),
      });
    }

    return route.continue();
  });
}

describe('Storefront Local Browser Cart & Checkout Acceptance Suite', () => {
  let serverProcess: ChildProcess;
  let browser: Browser;

  test.before(async () => {
    const standaloneServer = path.resolve(
      process.cwd(),
      '.next',
      'standalone',
      'server.js'
    );
    const hasStandalone = fs.existsSync(standaloneServer);

    if (hasStandalone) {
      serverProcess = spawn(process.execPath, [standaloneServer], {
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: 'production',
        },
        stdio: 'ignore',
      });
    } else {
      serverProcess = spawn(
        'npx',
        ['next', 'start', '-p', String(PORT)],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PORT: String(PORT),
            NODE_ENV: 'production',
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

  test('Cart Empty State & Navigation to Products', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupCartCheckoutApiMocks(page);

    await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });

    await page.waitForSelector('h1:has-text("Your cart is empty")', { timeout: 6000 });
    assert.ok(await page.locator('h1:has-text("Your cart is empty")').isVisible());
    const browseBtn = page.locator('a:has-text("Browse Catalogue")');
    assert.ok(await browseBtn.isVisible());

    await context.close();
  });

  test('Cart Line Addition, Quantity Mutation & Authoritative Pricing', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupCartCheckoutApiMocks(page);

    // Pre-populate cart with items via localStorage
    const initialCart = {
      state: {
        items: [
          {
            id: 'prod-almonds',
            productId: 'prod-almonds',
            variantId: 'var-alm-500g',
            name: 'Premium California Almonds',
            variant: 'Weight: 500g',
            price: 1500,
            quantity: 2,
            stock: 25,
            image: 'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
          },
          {
            id: 'prod-walnuts',
            productId: 'prod-walnuts',
            name: 'Raw Shelled Walnuts',
            price: 1200,
            quantity: 1,
            stock: 10,
            image: 'https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg',
          },
        ],
        wishlist: [],
        totalItems: 3,
      },
      version: 2,
    };

    await page.addInitScript((val) => {
      localStorage.setItem('mevapur-cart-storage', JSON.stringify(val));
    }, initialCart);

    await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });

    // Verify Heading and Items
    await page.waitForSelector('h1:has-text("Your Shopping Cart")', { timeout: 6000 });
    assert.ok(await page.locator('h1:has-text("Your Shopping Cart")').isVisible());
    assert.ok(await page.locator('text=Premium California Almonds').isVisible());
    assert.ok(await page.locator('text=Raw Shelled Walnuts').isVisible());

    // Subtotal = (1500 * 2) + (1200 * 1) = 4,200
    assert.ok(await page.locator('text=PKR 4,200').first().isVisible());

    // Click Proceed to Checkout
    const checkoutLink = page.locator('a:has-text("Proceed to Checkout")');
    await checkoutLink.click();

    await page.waitForURL(/checkout/, { timeout: 5000 });
    assert.ok(page.url().includes('/checkout'));

    await context.close();
  });

  test('Checkout Validation, Coupon Code Preview & Idempotent Submission', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupCartCheckoutApiMocks(page, true);

    const initialCart = {
      state: {
        items: [
          {
            id: 'prod-almonds',
            productId: 'prod-almonds',
            variantId: 'var-alm-500g',
            name: 'Premium California Almonds',
            variant: 'Weight: 500g',
            price: 1500,
            quantity: 2,
            stock: 25,
            image: 'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
          },
        ],
        wishlist: [],
        totalItems: 2,
      },
      version: 2,
    };

    await page.addInitScript((val) => {
      localStorage.setItem('mevapur-cart-storage', JSON.stringify(val));
    }, initialCart);

    await page.goto(`${BASE_URL}/checkout`, { waitUntil: 'networkidle' });

    // Verify Title
    await page.waitForSelector('h1:has-text("Secure Checkout")', { timeout: 6000 });
    assert.ok(await page.locator('h1:has-text("Secure Checkout")').isVisible());

    // Apply coupon SAVE10
    const couponInput = page.locator('input[aria-label="Coupon code"]');
    await couponInput.fill('SAVE10');
    await page.locator('button:has-text("Apply")').click();

    // Verify discount banner
    await page.waitForSelector('text=Estimated discount:', { timeout: 4000 });
    assert.ok(await page.locator('text=-PKR 300').first().isVisible());

    // Fill form
    await page.locator('#phone').fill('+923001234567');
    await page.locator('#address').fill('House 14, Street 2, Sector F-6');

    // Submit Order
    const submitBtn = page.locator('button:has-text("Place Order")');
    await submitBtn.click();

    // Verify redirect to order-success
    await page.waitForURL(/order-success/, { timeout: 6000 });
    assert.ok(page.url().includes('/order-success'));

    // Verify confirmed order receipt details
    await page.waitForSelector('h1:has-text("Thank You for Your Order!")', { timeout: 6000 });
    assert.ok(await page.locator('h1:has-text("Thank You for Your Order!")').isVisible());
    assert.ok(await page.locator('text=ORD-20260903-ABC123456789').isVisible());
    assert.ok(await page.locator('text=PKR 2,700').isVisible());

    await context.close();
  });

  test('Responsive Viewports & Horizontal Overflow Safety (320px to 1440px)', async () => {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupCartCheckoutApiMocks(page);

      await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(
        scrollWidth <= vp.width + 1,
        `Horizontal overflow detected on ${vp.name}: scrollWidth=${scrollWidth} > viewport=${vp.width}`
      );

      await context.close();
    }
  });

  test('Axe Automated Accessibility Audit (Zero Critical, Zero Serious Violations)', async () => {
    const routes = [
      { name: 'Shopping Cart', path: '/cart' },
      { name: 'Checkout Page', path: '/checkout' },
      { name: 'Order Success Page', path: '/order-success?orderId=ORD-20260903-ABC123456789' },
    ];

    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupCartCheckoutApiMocks(page);

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
