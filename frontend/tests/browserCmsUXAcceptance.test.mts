import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

import http from 'node:http';

const PORT = 3469;
const API_PORT = 5044;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const API_URL = `http://127.0.0.1:${API_PORT}`;
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

function createMockApiServer(): http.Server {
  return http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = req.url || '';

    if (url.includes('/api/content/slug/about-us')) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: {
          _id: 'page-about',
          type: 'page',
          title: 'About MevaPur',
          subtitle: 'Our Origin & Commitment to Pure Produce',
          slug: 'about-us',
          content: `# About MevaPur\n\nMevaPur connects authentic northern farmers with conscious consumers.\n\n## Our Standards\n- **100% Traceable**: Single-origin produce sourced from Gilgit-Baltistan.\n- **Zero Additives**: Free from artificial sulphur or preservatives.\n- **Ethical Commerce**: Fair compensation directly to harvesting families.\n\n> "Purity is not a feature, it is our founding promise."\n\nFor inquiries, visit our [Customer Support](/pages/faqs) or browse [All Products](/products).`,
          isActive: true,
          updatedAt: '2026-09-01T12:00:00.000Z',
          seo: {
            metaTitle: 'About MevaPur - Single-Origin Pure Produce',
            metaDescription: 'Discover the story behind MevaPur natural dried fruits and organic honey.',
          },
        },
      }));
      return;
    }

    if (url.includes('/api/content/slug/privacy-policy')) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: {
          _id: 'page-privacy',
          type: 'page',
          title: 'Privacy Policy',
          slug: 'privacy-policy',
          content: `# Privacy Policy\n\nYour personal information is protected under strict client isolation.\n\n1. We never sell your personal data.\n2. Payment credentials are handled through PCI-compliant gateways.\n3. Cookies are strictly utilized for session security.`,
          isActive: true,
          updatedAt: '2026-09-02T10:00:00.000Z',
        },
      }));
      return;
    }

    if (url.includes('/api/content/slug/server-error-slug')) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, message: 'Internal Database Connection Error' }));
      return;
    }

    if (url.includes('/api/content/slug/')) {
      res.writeHead(404);
      res.end(JSON.stringify({ success: false, message: 'Content not found' }));
      return;
    }

    if (url.includes('/api/content/public/slider')) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: [
          {
            _id: 'slider-1',
            type: 'slider',
            title: 'Fresh Himalayan Harvest',
            subtitle: 'Seasonal Specials',
            description: 'Sun-dried organic apricots and wild walnuts from Skardu.',
            image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d',
            button: { text: 'Shop Harvest', link: '/products?category=dry-fruits' },
            position: 1,
            isActive: true,
          },
          {
            _id: 'slider-2',
            type: 'slider',
            title: 'Pure Sidr Honey',
            subtitle: '100% Unpasteurized',
            description: 'Cold-extracted mountain honey with natural wellness properties.',
            image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38',
            button: { text: 'Discover Honey', link: '/products?category=organic-honey' },
            position: 2,
            isActive: true,
          },
        ],
      }));
      return;
    }

    if (url.includes('/api/content/public/banner')) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: [
          {
            _id: 'banner-1',
            type: 'banner',
            title: 'Free Express Shipping Nationwide',
            subtitle: 'On all orders above PKR 3,000',
            button: { text: 'View Details', link: '/pages/shipping-and-returns' },
            position: 1,
            isActive: true,
          },
        ],
      }));
      return;
    }

    if (url.includes('/api/settings/public')) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: {
          store: {
            store_name: 'MevaPur Natural Groceries',
            store_email: 'care@mevapur.com',
            store_phone: '+92 300 1234567',
            store_address: 'Main Boulevard, Gulberg III, Lahore, Pakistan',
            currency: 'PKR',
          },
          storeName: 'MevaPur',
        },
      }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: [] }));
  });
}

async function setupCmsApiMocks(page: Page) {
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

    if (url.includes('/api/categories') || url.includes('/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { _id: 'cat-1', name: 'Dry Fruits', slug: 'dry-fruits', isActive: true },
            { _id: 'cat-2', name: 'Organic Honey', slug: 'organic-honey', isActive: true },
          ],
        }),
      });
    }

    if (url.includes('/api/products/top') || url.includes('/products/top')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'prod-1',
              name: 'Organic Gilgit Almonds',
              slug: 'organic-gilgit-almonds',
              price: 1500,
              rating: 5,
              reviewCount: 12,
              stock: 25,
              images: ['/images/placeholder.png'],
            },
          ],
        }),
      });
    }

    if (url.includes('/api/content/public/slider') || url.includes('/content/public/slider')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'slider-1',
              type: 'slider',
              title: 'Fresh Himalayan Harvest',
              subtitle: 'Seasonal Specials',
              description: 'Sun-dried organic apricots and wild walnuts from Skardu.',
              image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d',
              button: {
                text: 'Shop Harvest',
                link: '/products?category=dry-fruits',
              },
              position: 1,
              isActive: true,
            },
            {
              _id: 'slider-2',
              type: 'slider',
              title: 'Pure Sidr Honey',
              subtitle: '100% Unpasteurized',
              description: 'Cold-extracted mountain honey with natural wellness properties.',
              image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38',
              button: {
                text: 'Discover Honey',
                link: '/products?category=organic-honey',
              },
              position: 2,
              isActive: true,
            },
          ],
        }),
      });
    }

    if (url.includes('/api/content/public/banner') || url.includes('/content/public/banner')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'banner-1',
              type: 'banner',
              title: 'Free Express Shipping Nationwide',
              subtitle: 'On all orders above PKR 3,000',
              button: {
                text: 'View Details',
                link: '/pages/shipping-and-returns',
              },
              position: 1,
              isActive: true,
            },
          ],
        }),
      });
    }

    if (url.includes('/api/settings/public') || url.includes('/settings/public')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            store: {
              store_name: 'MevaPur Natural Groceries',
              store_email: 'care@mevapur.com',
              store_phone: '+92 300 1234567',
              store_address: 'Main Boulevard, Gulberg III, Lahore, Pakistan',
              currency: 'PKR',
            },
            storeName: 'MevaPur',
          },
        }),
      });
    }

    return route.continue();
  });
}

describe('Storefront CMS UX Acceptance & Dynamic Content Verification', () => {
  let nextServer: ChildProcess | null = null;
  let apiServer: http.Server | null = null;
  let browser: Browser | null = null;

  test.before(async () => {
    // Start mock backend HTTP server for server-side Next.js SSR requests
    apiServer = createMockApiServer();
    await new Promise<void>((resolve) => {
      apiServer?.listen(API_PORT, '127.0.0.1', () => resolve());
    });

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
          INTERNAL_API_URL: API_URL,
          NEXT_PUBLIC_API_URL: API_URL,
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
            INTERNAL_API_URL: API_URL,
            NEXT_PUBLIC_API_URL: API_URL,
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
    try {
      if (apiServer) {
        apiServer.close();
      }
    } catch {
      // ignore
    }
  });

  test('Hero slider displays dynamic slides, navigates via buttons and keyboard', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupCmsApiMocks(page);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Assert initial slide
    await page.waitForSelector('text=Fresh Himalayan Harvest');
    const title1 = await page.locator('h1').first().textContent();
    assert.ok(title1?.includes('Fresh Himalayan Harvest'));

    // Navigate to next slide
    const nextBtn = page.getByRole('button', { name: 'Next slide' });
    await nextBtn.click();

    await page.waitForSelector('text=Pure Sidr Honey');
    const title2 = await page.locator('h1').first().textContent();
    assert.ok(title2?.includes('Pure Sidr Honey'));

    // Navigate back to previous slide via Left Arrow key
    const carouselRegion = page.getByRole('region', { name: 'Featured highlights' });
    await carouselRegion.focus();
    await page.keyboard.press('ArrowLeft');

    await page.waitForSelector('text=Fresh Himalayan Harvest');
    assert.ok(await page.locator('text=Fresh Himalayan Harvest').isVisible());

    // Toggle pause rotation button
    const pauseBtn = page.getByRole('button', { name: 'Pause slide rotation' });
    await pauseBtn.click();
    assert.ok(await page.getByRole('button', { name: 'Resume slide rotation' }).isVisible());

    await context.close();
  });

  test('Promotional announcement banner renders dynamic banner and dismisses', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupCmsApiMocks(page);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Verify announcement banner is present
    await page.waitForSelector('text=Free Express Shipping Nationwide');
    assert.ok(await page.locator('text=Free Express Shipping Nationwide').isVisible());
    assert.ok(await page.locator('text=On all orders above PKR 3,000').isVisible());

    // Dismiss banner
    const closeBtn = page.getByRole('button', { name: 'Dismiss announcement banner' });
    await closeBtn.click();

    // Verify banner is dismissed
    await page.waitForTimeout(300);
    const bannerVisible = await page.locator('text=Free Express Shipping Nationwide').isVisible();
    assert.equal(bannerVisible, false);

    await context.close();
  });

  test('CMS dynamic page renders rich safe content at /pages/about-us', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupCmsApiMocks(page);

    await page.goto(`${BASE_URL}/pages/about-us`, { waitUntil: 'networkidle' });

    // Check title and subtitle
    await page.waitForSelector('h1:has-text("About MevaPur")');
    assert.ok(await page.locator('text=Our Origin & Commitment to Pure Produce').isVisible());

    // Check breadcrumbs
    assert.ok(await page.locator('nav[aria-label="Breadcrumb"]').isVisible());

    // Check rich elements rendered safely
    assert.ok(await page.locator('h2:has-text("Our Standards")').isVisible());
    assert.ok(await page.locator('strong:has-text("100% Traceable")').isVisible());
    assert.ok(await page.locator('blockquote').isVisible());
    assert.ok(await page.locator('a:has-text("Customer Support")').isVisible());

    await context.close();
  });

  test('CMS unpublished/nonexistent page returns truthful 404 state', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupCmsApiMocks(page);

    await page.goto(`${BASE_URL}/pages/nonexistent-draft-policy`, { waitUntil: 'networkidle' });

    await page.waitForSelector('text=Page Not Found');
    assert.ok(await page.locator('text=The page you are looking for does not exist').isVisible());
    assert.ok(await page.getByRole('link', { name: 'Return to Storefront' }).isVisible());

    await context.close();
  });

  test('CMS server outage displays error with retry button', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupCmsApiMocks(page);

    await page.goto(`${BASE_URL}/pages/server-error-slug`, { waitUntil: 'networkidle' });

    await page.waitForSelector('text=Unable to load page');
    assert.ok(await page.getByRole('button', { name: 'Retry' }).isVisible());

    await context.close();
  });

  test('Footer displays CMS policy links and dynamic contact information', async () => {
    assert.ok(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupCmsApiMocks(page);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Check footer policy links
    await page.waitForSelector('footer');
    assert.ok(await page.getByRole('link', { name: 'About Us' }).isVisible());
    assert.ok(await page.getByRole('link', { name: 'Privacy Policy' }).isVisible());
    assert.ok(await page.getByRole('link', { name: 'Terms & Conditions' }).isVisible());
    assert.ok(await page.getByRole('link', { name: 'Shipping & Returns' }).isVisible());
    assert.ok(await page.getByRole('link', { name: 'FAQs & Help' }).isVisible());

    // Check store contact info
    assert.ok(await page.locator('footer >> text=care@mevapur.com').isVisible());
    assert.ok(await page.locator('footer >> text=+92 300 1234567').isVisible());

    await context.close();
  });

  for (const vp of VIEWPORTS) {
    test(`Axe accessibility audit passes on Homepage and CMS page at ${vp.name}`, async () => {
      assert.ok(browser);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupCmsApiMocks(page);

      // Audit Homepage
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForSelector('h1');
      const homeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const homeViolations = homeResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );
      assert.equal(
        homeViolations.length,
        0,
        `Homepage at ${vp.name} must have 0 critical/serious violations: ${JSON.stringify(homeViolations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ html: n.html, target: n.target, failureSummary: n.failureSummary })) })))}`
      );

      // Audit CMS Page
      await page.goto(`${BASE_URL}/pages/about-us`, { waitUntil: 'networkidle' });
      await page.waitForSelector('h1:has-text("About MevaPur")');
      const cmsResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const cmsViolations = cmsResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );
      assert.equal(
        cmsViolations.length,
        0,
        `CMS Page at ${vp.name} must have 0 critical/serious violations: ${JSON.stringify(cmsViolations.map((v) => ({ id: v.id, impact: v.impact, description: v.description })))}`
      );

      await context.close();
    });
  }
});
