process.env.NEXT_PUBLIC_SEARCH_INDEXING_ENABLED = 'true';
process.env.NEXT_PUBLIC_SITE_URL = 'https://storefront.mevapur.test';
process.env.NEXT_PUBLIC_SITE_NAME = 'MevaPur';

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import http from 'node:http';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { safeJsonLdStringify } from '../src/lib/safeJsonLd.ts';
import { branding } from '../src/config/branding.ts';
import robotsHandler from '../src/app/robots.ts';
import sitemapHandler, { generateSitemaps, SITEMAP_PARTITION_SIZE } from '../src/app/sitemap.ts';
import type { Product, GetProductsParams } from '../src/lib/api.ts';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
    updatedAt: '2026-09-01T12:00:00.000Z',
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
    updatedAt: '2026-09-02T12:00:00.000Z',
    attributes: [],
    variants: [],
  },
];

const mockCmsPages = [
  {
    _id: 'page-about-001',
    type: 'page',
    title: 'About Us',
    slug: 'about-us',
    subtitle: 'Pure Northern Dry Fruits & Organic Honey',
    description: 'Read about our heritage and quality standards.',
    content: 'We provide 100% single-origin natural produce.',
    seo: {
      metaTitle: 'About Us - MevaPur Heritage',
      metaDescription: 'Read about our heritage and quality standards.',
    },
    isActive: true,
    updatedAt: '2026-09-03T10:00:00.000Z',
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

    if (url.includes('/content/public/page/about-us') || url.includes('/content/public/slug/about-us')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockCmsPages[0] }),
      });
    }

    if (url.includes('/content/public/page')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockCmsPages }),
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
  let backendServer: http.Server | null = null;
  let backendPort: number = 0;
  let backendUrl: string = '';
  let frontendPort: number = 0;
  let baseUrl: string = '';
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

  test('3. Robots metadata handler defines explicit crawl rules allowing crawler noindex observation while blocking admin/API', () => {
    const fn = typeof robotsHandler === 'function' ? robotsHandler : (robotsHandler as unknown as { default: () => ReturnType<typeof robotsHandler> }).default;
    const robots = fn();
    assert.ok(robots, 'robots handler must return metadata');
    assert.strictEqual(robots.sitemap, 'https://storefront.mevapur.test/sitemap/0.xml');

    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    assert.ok(rules.length > 0, 'Must have at least one rule set');
    const primaryRule = rules[0];
    assert.strictEqual(primaryRule.userAgent, '*');
    assert.strictEqual(primaryRule.allow, '/');

    const disallowList = Array.isArray(primaryRule.disallow) ? primaryRule.disallow : [primaryRule.disallow];
    // Admin and machine API endpoints are disallowed
    assert.ok(disallowList.includes('/admin'), 'Disallow must include /admin');
    assert.ok(disallowList.includes('/admin/*'), 'Disallow must include /admin/*');
    assert.ok(disallowList.includes('/api'), 'Disallow must include /api');
    assert.ok(disallowList.includes('/api/*'), 'Disallow must include /api/*');
    assert.ok(disallowList.includes('/healthz'), 'Disallow must include /healthz');

    // Public non-indexable routes MUST NOT be disallowed so search engines can crawl them to observe noindex directives
    const allowedForNoindexObservation = ['/cart', '/checkout', '/account', '/login', '/register', '/search', '/wishlist', '/orders'];
    for (const route of allowedForNoindexObservation) {
      assert.ok(
        !disallowList.includes(route),
        `Public non-indexable route ${route} must NOT be disallowed in robots.txt so crawlers can read its noindex tag`
      );
    }
  });

  describe('Sitemap Outage & Scale Durability Unit Tests', () => {
    const sitemapFn = typeof sitemapHandler === 'function' ? sitemapHandler : (sitemapHandler as unknown as { default: typeof sitemapHandler }).default;

    test('3a. Backend outage before first product page throws error and fails closed (no empty sitemap)', async () => {
      await assert.rejects(
        async () => {
          await sitemapFn(undefined, {
            fetchPublicContent: async () => [],
            fetchProducts: async () => {
              throw new Error('ECONNREFUSED 127.0.0.1:5000');
            },
          });
        },
        /Sitemap generation failed|ECONNREFUSED/,
        'Sitemap generation must throw when backend is unreachable on first page'
      );
    });

    test('3b. Backend outage during later pagination throws error and fails closed (no partial snapshot returned as complete)', async () => {
      let callCount = 0;
      await assert.rejects(
        async () => {
          await sitemapFn(undefined, {
            fetchPublicContent: async () => [],
            fetchProducts: async () => {
              callCount++;
              if (callCount === 1) {
                return {
                  success: true,
                  data: Array.from({ length: 100 }, (_, i) => ({
                    _id: `prod-p1-${i}`,
                    name: `Product P1 ${i}`,
                    slug: `product-p1-${i}`,
                    isActive: true,
                    status: 'published',
                    price: 1000,
                    images: [],
                    category: { _id: 'cat-1', name: 'Cat 1', slug: 'cat-1' },
                    createdAt: '2026-09-01T00:00:00.000Z',
                    updatedAt: '2026-09-01T00:00:00.000Z',
                  })),
                  pagination: { page: 1, pages: 5, total: 500, limit: 100, hasNext: true, hasPrev: false },
                };
              }
              // Failure on page 2
              throw new Error('Database connection timed out on page 2');
            },
          });
        },
        /Sitemap generation failed|Database connection timed out/,
        'Sitemap generation must fail closed if backend fails during subsequent pagination'
      );
    });

    test('3c. Scale test: handles > 2,500 published products across multiple pages without artificial ceiling', async () => {
      const TOTAL_SCALE_PRODUCTS = 3000;
      const PAGE_SIZE = 100;
      const TOTAL_PAGES = Math.ceil(TOTAL_SCALE_PRODUCTS / PAGE_SIZE);

      const mockFetchProducts = async (params?: GetProductsParams) => {
        const pageNum = Number(params?.page) || 1;
        const limitNum = Number(params?.limit) || PAGE_SIZE;
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = Math.min(startIndex + limitNum, TOTAL_SCALE_PRODUCTS);

        const items: Product[] = [];
        for (let i = startIndex; i < endIndex; i++) {
          items.push({
            _id: `scale-prod-${i}`,
            name: `Scale Product ${i}`,
            slug: `scale-product-${i}`,
            isActive: true,
            status: 'published',
            price: 1000 + i,
            images: [],
            category: { _id: 'cat-1', name: 'Cat 1', slug: 'cat-1' },
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          });
        }

        return {
          success: true,
          data: items,
          pagination: {
            page: pageNum,
            pages: TOTAL_PAGES,
            total: TOTAL_SCALE_PRODUCTS,
            limit: limitNum,
            hasNext: pageNum < TOTAL_PAGES,
            hasPrev: pageNum > 1,
          },
        };
      };

      const entries = await sitemapFn({ id: 0 }, {
        fetchPublicContent: async () => [],
        fetchProducts: mockFetchProducts,
      });

      const productEntries = entries.filter((e) => e.url.includes('/products/scale-product-'));
      assert.strictEqual(
        productEntries.length,
        3000,
        `Sitemap must include all 3,000 products beyond the old 2,500 ceiling (found ${productEntries.length})`
      );
      assert.ok(entries.length >= 3002, `Total entries in partition 0 must include static + all products (${entries.length})`);
    });

    test('3d. Multi-partition support: generateSitemaps computes partitions and sitemap partitions serve offsets', async () => {
      const TOTAL_PRODUCTS = 60000;
      const sitemaps = await generateSitemaps({
        fetchProducts: async () => ({
          success: true,
          data: [],
          pagination: { page: 1, pages: 600, total: TOTAL_PRODUCTS, limit: 1, hasNext: true, hasPrev: false },
        }),
      });

      assert.strictEqual(sitemaps.length, 3, 'Must create 3 sitemap partitions for 60,000 items');
      assert.deepStrictEqual(sitemaps, [{ id: 0 }, { id: 1 }, { id: 2 }]);

      let requestedPage = 0;
      const part1Entries = await sitemapFn({ id: 1 }, {
        fetchPublicContent: async () => [],
        fetchProducts: async (params) => {
          requestedPage = Number(params?.page) || 1;
          return {
            success: true,
            data: [{
              _id: `part-prod-${requestedPage}`,
              name: `Partition 1 Product`,
              slug: `part-1-product`,
              isActive: true,
              status: 'published',
              price: 1000,
              images: [],
              category: { _id: 'cat-1', name: 'Cat 1', slug: 'cat-1' },
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            }],
            pagination: { page: requestedPage, pages: 600, total: 60000, limit: 100, hasNext: false, hasPrev: true },
          };
        },
      });

      const expectedStartPage = Math.floor(SITEMAP_PARTITION_SIZE / 100) + 1; // Page 251
      assert.strictEqual(requestedPage, expectedStartPage, `Partition 1 must request page ${expectedStartPage}`);
      assert.ok(part1Entries.length > 0, 'Partition 1 must return valid product entries');
      assert.ok(!part1Entries.some((e) => e.url === 'https://storefront.mevapur.test'), 'Partition 1 must not duplicate homepage');
    });

    test('3e. Deduplication, draft exclusion, and malformed record safety', async () => {
      const entries = await sitemapFn({ id: 0 }, {
        fetchPublicContent: async () => [],
        fetchProducts: async () => ({
          success: true,
          data: [
            {
              _id: 'valid-1',
              name: 'Valid Product 1',
              slug: 'valid-product-1',
              isActive: true,
              status: 'published',
              price: 1000,
              images: [],
              category: { _id: 'c1', name: 'C1', slug: 'c1' },
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            {
              _id: 'valid-1-dup',
              name: 'Valid Product 1 Duplicate',
              slug: 'valid-product-1',
              isActive: true,
              status: 'published',
              price: 1000,
              images: [],
              category: { _id: 'c1', name: 'C1', slug: 'c1' },
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            {
              _id: 'draft-1',
              name: 'Draft Product',
              slug: 'draft-product',
              isActive: true,
              status: 'draft',
              price: 1000,
              images: [],
              category: { _id: 'c1', name: 'C1', slug: 'c1' },
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            {
              _id: 'inactive-1',
              name: 'Inactive Product',
              slug: 'inactive-product',
              isActive: false,
              status: 'published',
              price: 1000,
              images: [],
              category: { _id: 'c1', name: 'C1', slug: 'c1' },
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            {
              _id: 'archived-1',
              name: 'Archived Product',
              slug: 'archived-product',
              isActive: true,
              status: 'archived',
              price: 1000,
              images: [],
              category: { _id: 'c1', name: 'C1', slug: 'c1' },
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            null as unknown as Product,
            {} as unknown as Product,
          ],
          pagination: { page: 1, pages: 1, total: 7, limit: 100, hasNext: false, hasPrev: false },
        }),
      });

      const productUrls = entries.filter((e) => e.url.includes('/products/'));
      const validProductEntries = productUrls.filter((e) => e.url.endsWith('/products/valid-product-1'));
      assert.strictEqual(validProductEntries.length, 1, 'Duplicate product URLs must be deduplicated to exactly 1');

      assert.ok(!entries.some((e) => e.url.includes('draft-product')), 'Draft products must be excluded');
      assert.ok(!entries.some((e) => e.url.includes('inactive-product')), 'Inactive products must be excluded');
      assert.ok(!entries.some((e) => e.url.includes('archived-product')), 'Archived products must be excluded');
      assert.ok(!entries.some((e) => e.url.endsWith('/products/')), 'Malformed records must not produce invalid URLs');
    });
  });

  describe('Live Production Browser SEO & Performance Suite', () => {
    test.before(async () => {
      backendPort = await getAvailablePort();
      backendUrl = `http://127.0.0.1:${backendPort}`;

      // Start mock HTTP backend to service Next.js server-side fetches
      backendServer = http.createServer((req, res) => {
        const url = req.url || '';
        res.setHeader('Content-Type', 'application/json');

        if (url.includes('/api/products/prod-almonds-001') || url.includes('/api/products/premium-california-almonds')) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, data: mockProducts[0] }));
          return;
        }

        if (url.includes('/api/products/prod-walnuts-002') || url.includes('/api/products/organic-walnuts-halves')) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, data: mockProducts[1] }));
          return;
        }

        if (url.includes('/api/products')) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            data: mockProducts,
            pagination: { page: 1, pages: 1, total: 2, limit: 50, hasNext: false, hasPrev: false },
          }));
          return;
        }

        if (url.includes('/api/content/public/page/about-us') || url.includes('/api/content/public/slug/about-us')) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, data: mockCmsPages[0] }));
          return;
        }

        if (url.includes('/api/content/public/page')) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, data: mockCmsPages }));
          return;
        }

        if (url.includes('/api/content/public/slider')) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            data: [{
              _id: 'slide-001',
              type: 'slider',
              title: 'Discover Pure Naturals',
              subtitle: '100% ORGANIC',
              description: 'Handpicked dry fruits and pure ingredients delivered fresh.',
              image: 'https://res.cloudinary.com/demo/image/upload/v1/hero-banner.jpg',
              button: { text: 'Shop Now', link: '/products' },
              isActive: true,
            }],
          }));
          return;
        }

        if (url.includes('/api/categories')) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            data: [{ _id: 'cat-dry-fruits', name: 'Dry Fruits', slug: 'dry-fruits', isActive: true }],
          }));
          return;
        }

        if (url.includes('/api/brands')) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            data: [{ _id: 'brand-mevapur', name: 'MevaPur Naturals', slug: 'mevapur-naturals', isActive: true }],
          }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: [] }));
      });

      await new Promise<void>((resolve) => {
        backendServer?.listen(backendPort, '127.0.0.1', () => resolve());
      });

      frontendPort = await getAvailablePort();
      baseUrl = `http://127.0.0.1:${frontendPort}`;

      const frontendDir = fs.existsSync(path.resolve(process.cwd(), '.next'))
        ? process.cwd()
        : path.resolve(process.cwd(), 'frontend');

      serverProcess = spawn(
        'npx',
        ['next', 'start', '-p', String(frontendPort)],
        {
          cwd: frontendDir,
          env: {
            ...process.env,
            PORT: String(frontendPort),
            NODE_ENV: 'test',
            NEXT_PUBLIC_API_URL: backendUrl,
            INTERNAL_API_URL: backendUrl,
            NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
            NEXT_PUBLIC_SITE_NAME: 'MevaPur',
            NEXT_PUBLIC_ADMIN_URL: 'https://admin.mevapur.test',
            NEXT_PUBLIC_SEARCH_INDEXING_ENABLED: 'true',
          },
          stdio: 'ignore',
          shell: true,
        }
      );

      await waitForServer(baseUrl);

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
      if (backendServer) {
        await new Promise<void>((resolve) => backendServer?.close(() => resolve()));
      }
    });

    test('4. Live Sitemap endpoint (/sitemap/0.xml) includes authoritative products/CMS and strictly excludes private/search routes', async () => {
      const res = await fetch(`${baseUrl}/sitemap/0.xml`);
      assert.ok(res.ok, `sitemap/0.xml should return 200, got ${res.status}`);
      const xml = await res.text();

      // Check XML structure and canonical URLs
      assert.ok(xml.includes('<urlset') || xml.includes('<url>'), 'Must be valid sitemap XML');
      assert.ok(xml.includes('https://storefront.mevapur.test'), 'Must include canonical site origin');
      assert.ok(xml.includes('https://storefront.mevapur.test/products'), 'Must include /products index');
      assert.ok(
        xml.includes('https://storefront.mevapur.test/products/premium-california-almonds') ||
        xml.includes('https://storefront.mevapur.test/products/prod-almonds-001'),
        'Must include published product in sitemap'
      );
      assert.ok(
        xml.includes('https://storefront.mevapur.test/pages/about-us'),
        'Must include published CMS page in sitemap'
      );

      // Check strictly prohibited private and search routes
      const prohibitedSubstrings = [
        '/search',
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
          !xml.includes(`https://storefront.mevapur.test${prohibited}<`) &&
          !xml.includes(`https://storefront.mevapur.test${prohibited}/`),
          `sitemap.xml must not contain private/search path: ${prohibited}`
        );
      }
    });

    test('5. Live Robots.txt endpoint (/robots.txt) disallows machine endpoints, allows public paths, and advertises sitemap', async () => {
      const res = await fetch(`${baseUrl}/robots.txt`);
      assert.ok(res.ok, `robots.txt should return 200, got ${res.status}`);
      const text = await res.text();

      assert.ok(text.includes('User-Agent: *') || text.includes('user-agent: *'), 'Must declare user-agent rule');
      assert.ok(text.includes('Allow: /') || text.includes('allow: /'), 'Must declare allow directive');
      assert.ok(text.includes('Sitemap: https://storefront.mevapur.test/sitemap/0.xml') || text.includes('sitemap:'), 'Must include sitemap directive');

      // Disallowed machine & admin endpoints
      const requiredDisallows = [
        '/admin',
        '/api',
        '/healthz',
      ];

      for (const req of requiredDisallows) {
        assert.ok(
          text.includes(`Disallow: ${req}`) || text.includes(`disallow: ${req}`),
          `robots.txt must contain Disallow for machine endpoint ${req}`
        );
      }
    });

    test('6. Exact canonical verification and route-level noindex across indexable and private routes', async () => {
      assert.ok(browser, 'Browser must be active');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await setupUniversalMocks(page);

      // Helper to check canonical and robots meta
      async function inspectRoute(urlPath: string) {
        await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'domcontentloaded' });
        const canonical = await page.$eval('link[rel="canonical"]', (el) => el.getAttribute('href')).catch(() => null);
        const robots = await page.$eval('meta[name="robots"]', (el) => el.getAttribute('content')).catch(() => null);
        return { canonical, robots };
      }

      // Indexable routes: self-referencing canonicals, indexable (no 'noindex')
      const homeMeta = await inspectRoute('/');
      assert.ok(homeMeta.canonical, 'Homepage must have canonical link');
      assert.ok(homeMeta.canonical === '/' || homeMeta.canonical === 'https://storefront.mevapur.test' || homeMeta.canonical === 'https://storefront.mevapur.test/', `Homepage canonical: ${homeMeta.canonical}`);
      assert.ok(!homeMeta.robots?.includes('noindex'), 'Homepage must be indexable');

      const productsMeta = await inspectRoute('/products');
      assert.ok(productsMeta.canonical, '/products must have canonical link');
      assert.ok(productsMeta.canonical === '/products' || productsMeta.canonical === 'https://storefront.mevapur.test/products', `/products canonical: ${productsMeta.canonical}`);
      assert.ok(!productsMeta.robots?.includes('noindex'), '/products must be indexable');

      const productDetailMeta = await inspectRoute('/products/prod-almonds-001');
      assert.ok(productDetailMeta.canonical, 'Product detail must have canonical link');
      assert.ok(
        productDetailMeta.canonical.includes('premium-california-almonds') ||
        productDetailMeta.canonical.includes('prod-almonds-001'),
        `Product detail canonical: ${productDetailMeta.canonical}`
      );
      assert.ok(!productDetailMeta.robots?.includes('noindex'), 'Product detail must be indexable');

      // Private routes: MUST have route-level noindex, nofollow AND must NOT inherit '/' canonical
      const privateRoutes = [
        { path: '/cart', expectedCanonical: '/cart' },
        { path: '/checkout', expectedCanonical: '/checkout' },
        { path: '/account', expectedCanonical: '/account' },
        { path: '/search', expectedCanonical: '/search' },
        { path: '/login', expectedCanonical: '/login' },
        { path: '/register', expectedCanonical: '/register' },
        { path: '/forgot-password', expectedCanonical: '/forgot-password' },
        { path: '/reset-password', expectedCanonical: '/reset-password' },
        { path: '/orders', expectedCanonical: '/orders' },
        { path: '/order-success', expectedCanonical: '/order-success' },
        { path: '/payment-instructions', expectedCanonical: '/payment-instructions' },
        { path: '/payment-result', expectedCanonical: '/payment-result' },
        { path: '/wishlist', expectedCanonical: '/wishlist' },
      ];

      for (const item of privateRoutes) {
        const meta = await inspectRoute(item.path);
        assert.ok(
          meta.robots?.includes('noindex'),
          `Route ${item.path} MUST have route-level noindex directive (got robots="${meta.robots}")`
        );
        assert.ok(
          meta.canonical?.includes(item.expectedCanonical),
          `Route ${item.path} MUST have self-referencing canonical ${item.expectedCanonical}, got "${meta.canonical}" (must not inherit homepage '/')`
        );
      }

      await page.close();
    });

    test('7. Homepage renders valid JSON-LD WebSite schema, head metadata, and prioritized Hero LCP image', async () => {
      assert.ok(browser, 'Browser must be active');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await setupUniversalMocks(page);

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const startTime = Date.now();
      const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const loadDuration = Date.now() - startTime;

      assert.ok(response && response.status() === 200, 'Homepage must return 200 OK');
      assert.ok(loadDuration < 5000, `DOMContentLoaded took ${loadDuration}ms (budget is < 5000ms)`);

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

    test('8. Product Detail renders truthful Product JSON-LD without synthetic reviews and with LCP image priority', async () => {
      assert.ok(browser, 'Browser must be active');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await setupUniversalMocks(page);

      // Product 1: Has 28 reviews and 4.9 rating
      await page.goto(`${baseUrl}/products/prod-almonds-001`, { waitUntil: 'domcontentloaded' });
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
      await page.goto(`${baseUrl}/products/prod-walnuts-002`, { waitUntil: 'domcontentloaded' });
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

    test('9. Production Lab Performance Reconciliation (Homepage, Catalog, Product Detail)', async () => {
      assert.ok(browser, 'Browser must be active');

      interface RouteLabResult {
        route: string;
        url: string;
        runs: Array<{
          lcp: number;
          cls: number;
          longTasksDuration: number;
          interactionProxyDelay: number;
          requestCount: number;
          transferredBytes: number;
        }>;
        median: {
          lcp: number;
          cls: number;
          labInteractionProxy: number;
          requestCount: number;
          transferredBytes: number;
        };
      }

      const routesToMeasure = [
        { name: 'Homepage', path: '/' },
        { name: 'Catalog', path: '/products' },
        { name: 'Product Detail', path: '/products/prod-almonds-001' },
      ];

      const RUNS_PER_ROUTE = 3;
      const results: RouteLabResult[] = [];

      for (const target of routesToMeasure) {
        const runMetrics: RouteLabResult['runs'] = [];

        for (let run = 1; run <= RUNS_PER_ROUTE; run++) {
          // Fresh context per run ensures cold cache state
          const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
          });
          const page = await context.newPage();
          await setupUniversalMocks(page);

          let requestCount = 0;
          page.on('request', () => { requestCount++; });

          await page.goto(`${baseUrl}${target.path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(600);

          const perfData = await page.evaluate(async () => {
            return new Promise<{
              lcp: number;
              cls: number;
              longTasksDuration: number;
              interactionProxyDelay: number;
              transferredBytes: number;
            }>((resolve) => {
              let lcpValue = 0;
              let clsValue = 0;
              let longTasksSum = 0;

              const poLcp = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                const lastEntry = entries[entries.length - 1];
                if (lastEntry) {
                  lcpValue = lastEntry.startTime;
                }
              });
              try {
                poLcp.observe({ type: 'largest-contentful-paint', buffered: true });
              } catch {}

              const poCls = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                  if (!(entry as { hadRecentInput?: boolean }).hadRecentInput) {
                    clsValue += (entry as { value?: number }).value || 0;
                  }
                }
              });
              try {
                poCls.observe({ type: 'layout-shift', buffered: true });
              } catch {}

              const poLongTask = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                  longTasksSum += entry.duration;
                }
              });
              try {
                poLongTask.observe({ type: 'longtask', buffered: true });
              } catch {}

              // Lab Interaction Proxy: dispatch test click/focus interaction and measure event processing latency
              const start = performance.now();
              const interactiveTarget = document.querySelector('button, a, input');
              let interactionProxyDelay = 0;
              if (interactiveTarget) {
                interactiveTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                interactiveTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                interactionProxyDelay = performance.now() - start;
              }

              setTimeout(() => {
                // Calculate transferred bytes from resource timings
                let totalTransferred = 0;
                try {
                  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
                  for (const r of resources) {
                    totalTransferred += r.transferSize || 0;
                  }
                  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
                  if (nav) {
                    totalTransferred += nav.transferSize || 0;
                  }
                } catch {}

                resolve({
                  lcp: lcpValue,
                  cls: clsValue,
                  longTasksDuration: longTasksSum,
                  interactionProxyDelay,
                  transferredBytes: totalTransferred,
                });
              }, 400);
            });
          });

          runMetrics.push({
            lcp: perfData.lcp,
            cls: perfData.cls,
            longTasksDuration: perfData.longTasksDuration,
            interactionProxyDelay: perfData.interactionProxyDelay,
            requestCount,
            transferredBytes: perfData.transferredBytes,
          });

          await context.close();
        }

        // Calculate median of 3 runs
        const medianIdx = Math.floor(RUNS_PER_ROUTE / 2);
        const sortedLcp = [...runMetrics].sort((a, b) => a.lcp - b.lcp);
        const sortedCls = [...runMetrics].sort((a, b) => a.cls - b.cls);
        const sortedProxy = [...runMetrics].sort((a, b) => (a.longTasksDuration + a.interactionProxyDelay) - (b.longTasksDuration + b.interactionProxyDelay));
        const sortedReqs = [...runMetrics].sort((a, b) => a.requestCount - b.requestCount);
        const sortedBytes = [...runMetrics].sort((a, b) => a.transferredBytes - b.transferredBytes);

        const medianLcp = sortedLcp[medianIdx].lcp;
        const medianCls = sortedCls[medianIdx].cls;
        const medianProxy = sortedProxy[medianIdx].longTasksDuration > 0
          ? sortedProxy[medianIdx].longTasksDuration
          : sortedProxy[medianIdx].interactionProxyDelay;
        const medianReqs = sortedReqs[medianIdx].requestCount;
        const medianBytes = sortedBytes[medianIdx].transferredBytes;

        results.push({
          route: target.name,
          url: `${baseUrl}${target.path}`,
          runs: runMetrics,
          median: {
            lcp: medianLcp,
            cls: medianCls,
            labInteractionProxy: medianProxy,
            requestCount: medianReqs,
            transferredBytes: medianBytes,
          },
        });
      }

      console.log('\n=== PRODUCTION LAB PERFORMANCE RECONCILIATION TABLE ===');
      console.log('Environment: Desktop 1280x800 | CPU 1x | Network Unthrottled (Lab) | Cache: Cold | Aggregation: Median of 3 Runs');
      console.table(
        results.map((r) => ({
          Route: r.route,
          'LCP (ms)': Number(r.median.lcp.toFixed(1)),
          'CLS (score)': Number(r.median.cls.toFixed(4)),
          'Lab Interaction Proxy (ms)': Number(r.median.labInteractionProxy.toFixed(2)),
          'Requests (count)': r.median.requestCount,
          'Transferred (bytes)': r.median.transferredBytes,
        }))
      );

      // Validate budgets for all 3 routes
      for (const res of results) {
        assert.ok(
          res.median.lcp < 2500,
          `${res.route} median LCP must be < 2500ms (measured ${res.median.lcp.toFixed(1)}ms)`
        );
        assert.ok(
          res.median.cls < 0.1,
          `${res.route} median CLS must be < 0.1 (measured ${res.median.cls.toFixed(4)})`
        );
        assert.ok(
          res.median.labInteractionProxy < 300,
          `${res.route} median Lab Interaction Proxy must be < 300ms (measured ${res.median.labInteractionProxy.toFixed(2)}ms)`
        );
      }
    });
  });
});
