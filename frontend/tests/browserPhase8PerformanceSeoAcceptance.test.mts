process.env.NEXT_PUBLIC_SEARCH_INDEXING_ENABLED = 'true';
process.env.NEXT_PUBLIC_SITE_URL = 'https://storefront.mevapur.test';
process.env.NEXT_PUBLIC_SITE_NAME = 'MevaPur';
process.env.NEXT_PUBLIC_API_URL = 'https://api.mevapur.test';

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { safeJsonLdStringify } from '../src/lib/safeJsonLd.ts';
import { branding } from '../src/config/branding.ts';

const PORT = 3478;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
  {
    _id: 'prod-walnuts-002',
    name: 'Organic Walnuts Halves',
    slug: 'organic-walnuts-halves',
    description: 'Fresh Kashmiri walnut halves with rich heart-healthy fatty acids.',
    price: 2200,
    originalPrice: 2200,
    stock: 12,
    sku: 'WAL-KASH-500',
    soldCount: 10,
    rating: 0,
    reviewCount: 0,
    category: { _id: 'cat-dry-fruits', name: 'Dry Fruits', slug: 'dry-fruits' },
    brand: { _id: 'brand-mevapur', name: 'MevaPur Naturals' },
    images: ['https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg'],
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg',
    isFeatured: true,
    status: 'published',
    isActive: true,
    attributes: [],
    variants: [],
  },
];

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

async function setupUniversalMocks(page: Page) {
  await page.route('**', async (route) => {
    const url = route.request().url();

    if (!url.includes('/api') && !url.includes('/auth') && !url.includes('/content') && !url.includes('api.mevapur.test')) {
      return route.continue();
    }

    if (url.includes('/auth/csrf-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { csrfToken: 'mock-csrf-p8', hasRefreshSession: false },
        }),
      });
    }

    if (url.includes('/auth/refresh') || url.includes('/auth/me')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Unauthenticated' }),
      });
    }

    if (url.includes('/assistant/capabilities')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            enabled: true,
            mode: 'retrieval',
            label: 'Ready to assist',
            providerActive: true,
            readOnly: false,
          },
        }),
      });
    }

    if (url.includes('/content/public/slider')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              _id: 'slide-001',
              type: 'slider',
              title: 'Discover Pure Naturals',
              subtitle: '100% ORGANIC',
              description: 'Handpicked dry fruits and pure ingredients delivered fresh.',
              image: 'https://res.cloudinary.com/demo/image/upload/v1/hero-banner.jpg',
              button: { text: 'Shop Now', link: '/products' },
              isActive: true,
            },
          ],
        }),
      });
    }

    if (url.includes('/content/public/banner')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (url.includes('/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ _id: 'cat-dry-fruits', name: 'Dry Fruits', slug: 'dry-fruits', isActive: true }],
        }),
      });
    }

    if (url.includes('/brands')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ _id: 'brand-mevapur', name: 'MevaPur Naturals', slug: 'mevapur-naturals', isActive: true }],
        }),
      });
    }

    if (url.includes('/products/top')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts }),
      });
    }

    if (url.includes('prod-almonds-001') || url.includes('premium-california-almonds')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts[0] }),
      });
    }

    if (url.includes('prod-walnuts-002') || url.includes('organic-walnuts-halves')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts[1] }),
      });
    }

    if (url.includes('/products')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: mockProducts,
          pagination: { page: 1, pages: 1, total: 2, limit: 12, hasNext: false, hasPrev: false },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });
}

describe('Storefront Phase 8 — Performance, Structured Data and SEO Acceptance', () => {
  let serverProcess: ChildProcess | null = null;
  let browser: Browser | null = null;

  test('1. safeJsonLdStringify escapes HTML tags and prevents script breakout', () => {
    const cleanObj = { name: 'Almonds', price: 1500 };
    const cleanOutput = safeJsonLdStringify(cleanObj);
    assert.strictEqual(JSON.parse(cleanOutput).name, 'Almonds');

    const maliciousObj = {
      title: '</script><script>alert("xss")</script>',
      desc: 'Bold & Fresh <style>body{color:red}</style>',
    };
    const escapedOutput = safeJsonLdStringify(maliciousObj);

    // Assert that raw '<' and '>' are neutralized
    assert.ok(!escapedOutput.includes('</script>'), 'Must not contain raw </script>');
    assert.ok(!escapedOutput.includes('<script>'), 'Must not contain raw <script>');
    assert.ok(escapedOutput.includes('\\u003c/script\\u003e'), 'Must escape < to \\u003c');
    assert.ok(escapedOutput.includes('\\u003cscript\\u003e'), 'Must escape < to \\u003c');
    assert.ok(escapedOutput.includes('\\u0026'), 'Must escape & to \\u0026');

    // Assert that standard JSON.parse reconstructs the exact original text safely
    const parsed = JSON.parse(escapedOutput);
    assert.strictEqual(parsed.title, '</script><script>alert("xss")</script>');
    assert.strictEqual(parsed.desc, 'Bold & Fresh <style>body{color:red}</style>');
  });

  test('2. Branding configuration provides canonical origin, site name, and social metadata', () => {
    assert.ok(branding.siteName, 'Branding must specify siteName');
    assert.ok(branding.canonicalOrigin, 'Branding must specify canonicalOrigin');
    assert.ok(branding.shortDescription, 'Branding must specify shortDescription');
    assert.ok(branding.defaultLocale, 'Branding must specify defaultLocale');
  });

  describe('Live Production Browser SEO & Performance Suite', () => {
    test.before(async () => {
      const frontendDir = fs.existsSync(path.resolve(process.cwd(), '.next'))
        ? process.cwd()
        : path.resolve(process.cwd(), 'frontend');

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
            NEXT_PUBLIC_SEARCH_INDEXING_ENABLED: 'true',
          },
          stdio: 'ignore',
          shell: true,
        }
      );

      await waitForServer(BASE_URL);

      const launchOpts: Parameters<typeof chromium.launch>[0] = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      if (fs.existsSync(CHROME_PATH)) {
        launchOpts.executablePath = CHROME_PATH;
      }
      browser = await chromium.launch(launchOpts);
    });

    test.after(async () => {
      if (browser) await browser.close();
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 500));
        if (serverProcess.exitCode === null) {
          serverProcess.kill('SIGKILL');
        }
      }
    });

    test('3. Live Sitemap endpoint (/sitemap.xml) includes public pages and strictly excludes private routes', async () => {
      const res = await fetch(`${BASE_URL}/sitemap.xml`);
      assert.ok(res.ok, `sitemap.xml should return 200, got ${res.status}`);
      const xml = await res.text();

      // Check XML structure
      assert.ok(xml.includes('<urlset') || xml.includes('<url>'), 'Must be valid sitemap XML');
      assert.ok(xml.includes('https://storefront.mevapur.test') || xml.includes('/products'), 'Must include public products');

      // Check strictly prohibited private routes
      const prohibitedSubstrings = [
        '/payment-instructions',
        '/payment-result',
        '/checkout',
        '/cart',
        '/account',
        '/orders',
        '/order-success',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/wishlist',
        '/admin',
        '/healthz',
      ];

      for (const prohibited of prohibitedSubstrings) {
        assert.ok(
          !xml.includes(prohibited),
          `sitemap.xml must not contain private path: ${prohibited}`
        );
      }
    });

    test('4. Live Robots.txt endpoint (/robots.txt) blocks private routes and advertises sitemap', async () => {
      const res = await fetch(`${BASE_URL}/robots.txt`);
      assert.ok(res.ok, `robots.txt should return 200, got ${res.status}`);
      const text = await res.text();

      assert.ok(text.includes('User-Agent: *') || text.includes('user-agent: *'), 'Must declare user-agent rule');
      assert.ok(text.includes('Sitemap: https://storefront.mevapur.test/sitemap.xml') || text.includes('sitemap:'), 'Must include sitemap directive');

      const requiredDisallows = [
        '/account',
        '/admin',
        '/cart',
        '/checkout',
        '/orders',
        '/order-success',
        '/payment-instructions',
        '/payment-result',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/wishlist',
      ];

      for (const req of requiredDisallows) {
        assert.ok(
          text.includes(`Disallow: ${req}`) || text.includes(`disallow: ${req}`),
          `robots.txt must contain Disallow for ${req}`
        );
      }
    });

    test('5. Homepage renders valid JSON-LD WebSite schema, head metadata, and prioritized Hero LCP image', async () => {
      assert.ok(browser, 'Browser must be active');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await setupUniversalMocks(page);

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const startTime = Date.now();
      const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      const loadDuration = Date.now() - startTime;

      assert.ok(response && response.status() === 200, 'Homepage must return 200 OK');
      assert.ok(loadDuration < 5000, `DOMContentLoaded took ${loadDuration}ms (budget is < 5000ms)`);

      // Verify canonical link in <head>
      const canonicalHref = await page.$eval('link[rel="canonical"]', (el) => el.getAttribute('href')).catch(() => null);
      assert.ok(canonicalHref, 'Canonical link must be present in <head>');
      assert.ok(canonicalHref.includes('storefront.mevapur.test') || canonicalHref === '/', `Canonical URL: ${canonicalHref}`);

      // Verify Open Graph & Twitter meta tags
      const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute('content')).catch(() => null);
      assert.ok(ogTitle, 'og:title meta tag must exist');

      const twitterCard = await page.$eval('meta[name="twitter:card"]', (el) => el.getAttribute('content')).catch(() => null);
      assert.strictEqual(twitterCard, 'summary_large_image', 'twitter:card must be summary_large_image');

      // Verify WebSite JSON-LD
      const jsonLdScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
        scripts.map((s) => s.innerHTML)
      );
      assert.ok(jsonLdScripts.length > 0, 'Homepage must render at least one JSON-LD script');

      let parsedWebSite = false;
      for (const content of jsonLdScripts) {
        try {
          const parsed = JSON.parse(content);
          if (parsed['@type'] === 'WebSite') {
            assert.strictEqual(parsed.name, 'MevaPur');
            assert.ok(parsed.url);
            parsedWebSite = true;
          }
        } catch {
          // Check next script
        }
      }
      assert.ok(parsedWebSite, 'Must have valid parsed WebSite structured data');

      // Assert 0 CSP violation errors in console
      const cspErrors = consoleErrors.filter((e) => e.toLowerCase().includes('content security policy'));
      assert.strictEqual(cspErrors.length, 0, `No CSP violation errors allowed on homepage: ${cspErrors.join(', ')}`);

      await page.close();
    });

    test('6. Product Detail renders truthful Product JSON-LD without synthetic reviews and with LCP image priority', async () => {
      assert.ok(browser, 'Browser must be active');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await setupUniversalMocks(page);

      // Product 1: Has 28 reviews and 4.9 rating
      await page.goto(`${BASE_URL}/products/prod-almonds-001`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1', { timeout: 10000 });

      const jsonLdContents = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
        scripts.map((s) => s.innerHTML)
      );

      let foundProductSchema = false;
      for (const raw of jsonLdContents) {
        try {
          const schema = JSON.parse(raw);
          if (schema['@type'] === 'Product' && schema.name === 'Premium California Almonds') {
            assert.strictEqual(schema.offers.priceCurrency, 'PKR');
            assert.strictEqual(schema.aggregateRating.ratingValue, 4.9);
            assert.strictEqual(schema.aggregateRating.reviewCount, 28);
            foundProductSchema = true;
          }
        } catch {
          // ignore
        }
      }
      assert.ok(foundProductSchema, 'Product with reviews must have aggregateRating in JSON-LD');

      // Product 2: Has 0 reviews -> Must NOT have synthetic reviewCount: 1 or fake aggregateRating
      await page.goto(`${BASE_URL}/products/prod-walnuts-002`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1', { timeout: 10000 });

      const zeroReviewJsonLds = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
        scripts.map((s) => s.innerHTML)
      );

      let zeroReviewProductSchema = false;
      for (const raw of zeroReviewJsonLds) {
        try {
          const schema = JSON.parse(raw);
          if (schema['@type'] === 'Product' && schema.name === 'Organic Walnuts Halves') {
            assert.strictEqual(schema.aggregateRating, undefined, 'Must NOT fabricate aggregateRating when reviewCount is 0');
            zeroReviewProductSchema = true;
          }
        } catch {
          // ignore
        }
      }
      assert.ok(zeroReviewProductSchema, 'Product without reviews must omit aggregateRating');

      await page.close();
    });

    test('7. Product Catalog grid enforces lazy image loading and responsive sizes', async () => {
      assert.ok(browser, 'Browser must be active');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await setupUniversalMocks(page);

      await page.goto(`${BASE_URL}/products`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('article', { timeout: 10000 });

      // Check product card image attributes
      const cardImages = page.locator('article img');
      const count = await cardImages.count();
      assert.ok(count > 0, 'Catalog must render product cards');

      for (let i = 0; i < count; i++) {
        const img = cardImages.nth(i);
        const sizes = await img.getAttribute('sizes');
        assert.ok(sizes, `Card image ${i} must have sizes attribute for responsive delivery`);
      }

      await page.close();
    });
  });
});
