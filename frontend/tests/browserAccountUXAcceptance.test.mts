import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3467;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: '320x800 (Mobile Mini)', width: 320, height: 800 },
  { name: '375x812 (Mobile Standard)', width: 375, height: 812 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '1024x768 (Desktop Standard)', width: 1024, height: 768 },
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

async function setupAccountApiMocks(page: Page) {
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
            hasRefreshSession: true,
          },
        }),
      });
    }

    if (url.includes('/auth/refresh')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'customer-001',
              fullName: 'Ahmad Sandhu',
              email: 'shopper@mevapur.test',
              role: 'customer',
              isVerified: true,
            },
            accessToken: 'synthetic-jwt-access-token',
            csrfToken: 'synthetic-test-csrf-token',
          },
        }),
      });
    }

    if (url.includes('/api/account/profile') || url.includes('/account/profile')) {
      if (method === 'PATCH') {
        const postData = route.request().postDataJSON() || {};
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              profile: {
                id: 'customer-001',
                fullName: postData.fullName || 'Ahmad Sandhu',
                email: 'shopper@mevapur.test',
                phone: postData.phone || '03001234567',
                avatar: postData.avatar || '',
                isVerified: true,
              },
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            profile: {
              id: 'customer-001',
              fullName: 'Ahmad Sandhu',
              email: 'shopper@mevapur.test',
              phone: '03001234567',
              avatar: '',
              isVerified: true,
            },
          },
        }),
      });
    }

    if (url.includes('/api/account/addresses') || url.includes('/account/addresses')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            addresses: [
              {
                id: 'addr-001',
                fullName: 'Ahmad Sandhu',
                phone: '03001234567',
                address: '123 Pine Valley Road',
                addressLine2: 'Suite 4B',
                city: 'Lahore',
                province: 'Punjab',
                postalCode: '54000',
                country: 'PK',
                isDefault: true,
              },
            ],
          },
        }),
      });
    }

    if (url.includes('/api/commerce/market') || url.includes('/commerce/market')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            homeCountry: 'PK',
            enabledCountries: ['PK'],
            defaultCurrency: 'PKR',
            enabledCurrencies: ['PKR'],
          },
        }),
      });
    }

    if (url.includes('/api/account/reviews') || url.includes('/account/reviews')) {
      if (url.includes('/product/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              reviews: [
                {
                  id: 'rev-pub-1',
                  rating: 5,
                  title: 'Excellent Quality',
                  comment: 'Very fresh and fast delivery.',
                  createdAt: new Date().toISOString(),
                  isVerifiedPurchase: true,
                  user: { fullName: 'Ali Khan' },
                  adminReply: 'Thank you for shopping with MevaPur!',
                  repliedAt: new Date().toISOString(),
                },
              ],
              summary: { count: 1, averageRating: 5 },
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            reviews: [
              {
                id: 'rev-001',
                product: {
                  id: 'prod-almonds',
                  name: 'Organic Gilgit Almonds',
                  slug: 'organic-gilgit-almonds',
                  price: 1500,
                  salePrice: 1200,
                  images: ['/images/placeholder.png'],
                  stock: 50,
                  hasVariants: false,
                },
                rating: 5,
                title: 'Exceptional Quality',
                comment: 'The almonds were super crunchy and sweet. Will buy again!',
                status: 'approved',
                isVerifiedPurchase: true,
                adminReply: 'Thank you for your generous feedback!',
                repliedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'rev-002',
                product: {
                  id: 'prod-walnuts',
                  name: 'Kaghan Shelled Walnuts',
                  slug: 'kaghan-shelled-walnuts',
                  price: 2200,
                  images: ['/images/placeholder.png'],
                  stock: 20,
                  hasVariants: true,
                },
                rating: 4,
                title: 'Good taste',
                comment: 'Fresh walnuts, arrived nicely packed.',
                status: 'pending',
                isVerifiedPurchase: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            total: 2,
            page: 1,
            limit: 8,
          },
        }),
      });
    }

    if (url.includes('/auth/sessions') || url.includes('/api/auth/sessions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            sessions: [
              {
                id: 'sess-current',
                ipAddress: '192.168.1.100',
                isCurrent: true,
                createdAt: new Date().toISOString(),
                deviceInfo: { browser: 'Chrome 128', os: 'Windows 11', device: 'desktop' },
              },
              {
                id: 'sess-mobile',
                ipAddress: '192.168.1.105',
                isCurrent: false,
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                deviceInfo: { browser: 'Safari Mobile', os: 'iOS 17', device: 'mobile' },
              },
            ],
          },
        }),
      });
    }

    if (url.includes('/auth/change-password') || url.includes('/api/auth/change-password')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Password changed successfully',
        }),
      });
    }

    if (url.includes('/auth/logout-all') || url.includes('/api/auth/logout-all')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'All sessions revoked',
        }),
      });
    }

    if (url.includes('/api/account/notifications') || url.includes('/account/notifications')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            notifications: [
              {
                id: 'notif-001',
                type: 'order',
                title: 'Order Dispatched',
                message: 'Your order ORD-9921 has been shipped via Courier.',
                isRead: false,
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
            unreadCount: 1,
          },
        }),
      });
    }

    if (url.includes('/api/account/returns') || url.includes('/account/returns')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            returns: [],
            total: 0,
          },
        }),
      });
    }

    if (url.includes('/api/account/refunds') || url.includes('/account/refunds')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            refunds: [],
            total: 0,
          },
        }),
      });
    }

    if (url.includes('/api/account/wishlist') || url.includes('/account/wishlist')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: 'wish-1',
                product: {
                  id: 'prod-var-1',
                  _id: 'prod-var-1',
                  name: 'Himalayan Dried Apricots',
                  slug: 'himalayan-dried-apricots',
                  price: 850,
                  stock: 30,
                  hasVariants: true,
                  variants: [{ sku: 'APR-250G', price: 850, stock: 15 }],
                  images: ['/images/placeholder.png'],
                },
              },
              {
                id: 'wish-2',
                product: {
                  id: 'prod-simple-1',
                  _id: 'prod-simple-1',
                  name: 'Pure Honey Jar 500g',
                  slug: 'pure-honey-jar-500g',
                  price: 1200,
                  stock: 10,
                  hasVariants: false,
                  variants: [],
                  images: ['/images/placeholder.png'],
                },
              },
            ],
          },
        }),
      });
    }

    return route.continue();
  });
}

describe('Storefront Customer Account UX Acceptance & Accessibility', () => {
  let nextServer: ChildProcess | null = null;
  let browser: Browser | null = null;

  test.before(async () => {
    const standaloneServer = path.resolve(
      process.cwd(),
      '.next',
      'standalone',
      'server.js'
    );
    const hasStandalone = fs.existsSync(standaloneServer);

    if (hasStandalone) {
      nextServer = spawn(process.execPath, [standaloneServer], {
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: 'production',
        },
        stdio: 'ignore',
      });
    } else {
      nextServer = spawn(
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

    await waitForServer(BASE_URL, 60);

    const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined;
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  test.after(async () => {
    try {
      if (browser) await browser.close();
    } catch {
      // ignore
    }
    try {
      if (nextServer) {
        nextServer.kill('SIGTERM');
        nextServer.kill('SIGKILL');
      }
    } catch {
      // ignore
    }
  });

  test('Account Dashboard tab navigation renders all authorized sections', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupAccountApiMocks(page);

    await page.goto(`${BASE_URL}/account`, { waitUntil: 'load', timeout: 15000 });

    // Verify header and user greeting
    await page.waitForSelector('text=Ahmad Sandhu', { timeout: 10000 });
    assert.ok(await page.isVisible('text=shopper@mevapur.test'));

    // Verify tabs
    assert.ok(await page.isVisible('role=tab[name*="Personal Profile"]'));
    assert.ok(await page.isVisible('role=tab[name*="Address Book"]'));
    assert.ok(await page.isVisible('role=tab[name*="Orders & Returns"]'));
    assert.ok(await page.isVisible('role=tab[name*="My Reviews"]'));
    assert.ok(await page.isVisible('role=tab[name*="Security & Sessions"]'));
    assert.ok(await page.isVisible('role=tab[name*="Notifications"]'));

    await context.close();
  });

  test('My Reviews tab displays moderation badges and edit/withdrawal interactions', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupAccountApiMocks(page);

    await page.goto(`${BASE_URL}/account?tab=reviews`, { waitUntil: 'load', timeout: 15000 });

    // Verify own reviews list
    await page.waitForSelector('text=Organic Gilgit Almonds', { timeout: 10000 });
    assert.ok(await page.isVisible('text=Approved'));
    assert.ok(await page.isVisible('text=Pending Review'));
    assert.ok(await page.isVisible('text=Kaghan Shelled Walnuts'));

    // Open Edit Review Modal and verify re-moderation notice
    await page.click('button:has-text("Edit Review") >> nth=0');
    await page.waitForSelector('text=Important Moderation Notice', { timeout: 5000 });
    assert.ok(await page.isVisible('text=Pending Moderation'));

    // Cancel edit modal
    await page.click('button:has-text("Cancel")');

    // Open Withdraw Review Modal and verify permanent withdrawal notice
    await page.click('button:has-text("Withdraw") >> nth=0');
    await page.waitForSelector('text=Withdraw Review?', { timeout: 5000 });
    assert.ok(await page.isVisible('text=Withdrawn reviews cannot be re-edited'));

    // Close modal
    await page.click('button:has-text("Keep Review")');

    await context.close();
  });

  test('Security tab shows 12-char password meter and active sessions table', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupAccountApiMocks(page);

    await page.goto(`${BASE_URL}/account?tab=security`, { waitUntil: 'load', timeout: 15000 });

    // Verify Password Policy Meter
    await page.waitForSelector('text=Change Password', { timeout: 10000 });
    await page.fill('#new-password', 'MevaPur#Secure2026');
    await page.waitForSelector('text=7 / 7 requirements met', { timeout: 5000 });

    // Verify Active Sessions Table
    await page.waitForSelector('text=Active Sessions', { timeout: 5000 });
    assert.ok(await page.isVisible('text=Current Device'));
    assert.ok(await page.isVisible('text=Revoke Access'));

    await context.close();
  });

  test('Address Book displays delivery addresses and only authoritative market-enabled countries', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupAccountApiMocks(page);

    await page.goto(`${BASE_URL}/account?tab=addresses`, { waitUntil: 'load', timeout: 15000 });

    await page.waitForSelector('text=123 Pine Valley Road', { timeout: 10000 });
    assert.ok(await page.isVisible('text=Default'));

    // Open add address form
    await page.click('button:has-text("Add New Address")');
    await page.waitForSelector('#addr-country', { timeout: 5000 });

    // Verify country selector has only market-enabled countries (e.g. PK)
    const options = await page.$$eval('#addr-country option', (opts) => opts.map((o) => o.value));
    assert.deepEqual(options, ['PK']);

    await context.close();
  });

  test('Wishlist page distinguishes variable products with Choose Options and simple products with Add to Cart', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupAccountApiMocks(page);

    await page.goto(`${BASE_URL}/wishlist`, { waitUntil: 'load', timeout: 15000 });

    await page.waitForSelector('text=Himalayan Dried Apricots', { timeout: 10000 });
    // Variable product has Choose Options linking to product page
    assert.ok(await page.isVisible('a:has-text("Choose Options")'));

    // Simple product has Add to Cart button
    assert.ok(await page.isVisible('button:has-text("Add to cart")'));

    await context.close();
  });

  test('Account and Wishlist pages pass Axe accessibility check with zero critical/serious violations across viewports', async () => {
    assert.ok(browser);

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupAccountApiMocks(page);

      await page.goto(`${BASE_URL}/account`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('text=Ahmad Sandhu', { timeout: 10000 });
      const axeAccount = await new AxeBuilder({ page }).analyze();
      const accountViolations = axeAccount.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      assert.equal(accountViolations.length, 0, `Account page Axe violations at ${vp.name}: ${JSON.stringify(accountViolations)}`);

      await page.goto(`${BASE_URL}/wishlist`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('text=Himalayan Dried Apricots', { timeout: 10000 });
      const axeWishlist = await new AxeBuilder({ page }).analyze();
      const wishlistViolations = axeWishlist.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      assert.equal(wishlistViolations.length, 0, `Wishlist page Axe violations at ${vp.name}: ${JSON.stringify(wishlistViolations)}`);

      await context.close();
    }
  });
});
