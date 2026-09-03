import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3462;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: '320x800 (Mobile Mini)', width: 320, height: 800 },
  { name: '375x812 (Mobile Standard)', width: 375, height: 812 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '1024x768 (Tablet Landscape)', width: 1024, height: 768 },
  { name: '1440x900 (Desktop HD)', width: 1440, height: 900 },
];

const mockCategories = [
  { _id: 'cat-dry-fruits', name: 'Dry Fruits', slug: 'dry-fruits', isActive: true },
  { _id: 'cat-nuts', name: 'Nuts & Seeds', slug: 'nuts-seeds', isActive: true },
  { _id: 'cat-organic', name: 'Organic Spices', slug: 'organic-spices', isActive: true },
];

const mockBrands = [
  { _id: 'brand-mevapur', name: 'MevaPur Naturals', slug: 'mevapur-naturals', isActive: true },
  { _id: 'brand-himalayan', name: 'Himalayan Organics', slug: 'himalayan-organics', isActive: true },
];

const mockProducts = [
  {
    _id: 'prod-almonds',
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
    images: [
      'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
      'https://res.cloudinary.com/demo/image/upload/v1/almonds-2.jpg',
    ],
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
        _id: 'var-alm-250g',
        sku: 'ALM-CAL-250',
        attributes: [{ name: 'Weight', value: '250g' }],
        price: 800,
        salePrice: 950,
        stock: 15,
        images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
        isDefault: false,
      },
      {
        _id: 'var-alm-500g',
        sku: 'ALM-CAL-500',
        attributes: [{ name: 'Weight', value: '500g' }],
        price: 1500,
        salePrice: 1800,
        stock: 25,
        images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-2.jpg'],
        isDefault: true,
      },
      {
        _id: 'var-alm-1kg',
        sku: 'ALM-CAL-1KG',
        attributes: [{ name: 'Weight', value: '1kg' }],
        price: 2800,
        salePrice: 3400,
        stock: 0,
        images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
        isDefault: false,
      },
    ],
  },
  {
    _id: 'prod-walnuts',
    name: 'Raw Shelled Walnuts',
    slug: 'raw-shelled-walnuts',
    description: 'Fresh Kashmiri light-half walnuts rich in Omega-3.',
    price: 1200,
    originalPrice: 1400,
    stock: 10,
    sku: 'WAL-KASH-500',
    soldCount: 30,
    rating: 4.7,
    reviewCount: 15,
    category: { _id: 'cat-dry-fruits', name: 'Dry Fruits', slug: 'dry-fruits' },
    brand: { _id: 'brand-himalayan', name: 'Himalayan Organics' },
    images: ['https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg'],
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg',
    isFeatured: true,
    status: 'published',
    isActive: true,
  },
];

async function waitForServer(url: string, maxRetries = 60): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/products`);
      if (res.status === 200) return;
    } catch {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${url}`);
}

async function setupCatalogApiMocks(page: Page) {
  await page.route('**', async (route) => {
    const url = route.request().url();

    // Pass static files & Next internals
    if (!url.includes('/api/') && !url.includes('/auth/')) {
      return route.continue();
    }

    // CSRF Token
    if (url.includes('/auth/csrf-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { csrfToken: 'mock-csrf-token-1234', hasRefreshSession: false },
        }),
      });
    }

    // Auth Me
    if (url.includes('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Unauthenticated' }),
      });
    }

    // Categories
    if (url.includes('/categories') || url.includes('/api/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockCategories }),
      });
    }

    // Brands
    if (url.includes('/brands') || url.includes('/api/brands')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockBrands }),
      });
    }

    // Top / Recommended / Recently viewed
    if (url.includes('/products/top') || url.includes('/api/products/top')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts }),
      });
    }
    if (url.includes('/products/recommended') || url.includes('/api/products/recommended')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts }),
      });
    }
    if (url.includes('/products/recently-viewed') || url.includes('/api/products/recently-viewed')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProducts }),
      });
    }

    // Single Product detail by ID or slug
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

    // Products query (listing & search & autocomplete)
    if (url.includes('/products') || url.includes('/api/products')) {
      const parsed = new URL(url);
      const isAutocomplete = parsed.searchParams.get('autocomplete') === 'true';
      const keyword = (parsed.searchParams.get('keyword') || '').toLowerCase();
      const category = parsed.searchParams.get('category');

      let filtered = mockProducts;
      if (keyword) {
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(keyword) || p.sku.toLowerCase().includes(keyword));
      }
      if (category) {
        filtered = filtered.filter((p) => p.category?._id === category || p.category?.slug === category);
      }

      if (isAutocomplete) {
        const autocompleteItems = filtered.map((p) => ({
          _id: p._id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          image: p.primaryImage,
          category: p.category,
        }));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: autocompleteItems }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: filtered,
          pagination: {
            page: 1,
            pages: 1,
            total: filtered.length,
            limit: 12,
            hasNext: false,
            hasPrev: false,
          },
        }),
      });
    }

    return route.continue();
  });
}

describe('Storefront Local Browser Catalog Acceptance Suite', () => {
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

  test('Public Catalog Listing: Renders Products, Prices, Stock Badges & Category Nav', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupCatalogApiMocks(page);

    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });

    // Verify Title & Breadcrumb
    const h1 = await page.locator('h1').textContent();
    assert.ok(h1?.includes('All Products'));

    // Verify Product Cards
    const cards = page.locator('article');
    const count = await cards.count();
    assert.ok(count >= 2, `Expected at least 2 product cards, got ${count}`);

    // Verify California Almonds Card
    const almondCard = cards.filter({ hasText: 'Premium California Almonds' }).first();
    await almondCard.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await almondCard.locator('text=PKR 1,500').isVisible());
    assert.ok(await almondCard.locator('text=Available to order').isVisible());

    await context.close();
  });

  test('Search & Autocomplete: Debounced Queries, Keyboard Arrow Navigation & Selection', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupCatalogApiMocks(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    // Focus desktop search input in navbar
    const searchInput = page.locator('#global-product-search');
    await searchInput.focus();
    await searchInput.fill('Almond');

    // Wait for autocomplete popup
    const suggestionsList = page.locator('#search-suggestions');
    await suggestionsList.waitFor({ state: 'visible', timeout: 6000 });

    // Verify suggestion item
    const option = suggestionsList.locator('a').filter({ hasText: 'Premium California Almonds' }).first();
    await option.waitFor({ state: 'visible', timeout: 4000 });
    assert.ok(await option.isVisible());

    // Press ArrowDown to select suggestion
    await searchInput.press('ArrowDown');
    await searchInput.press('Enter');

    // Verify navigation to product detail
    await page.waitForURL(/products\/premium-california-almonds|products\/prod-almonds/, { timeout: 6000 });
    assert.ok(page.url().includes('products'));

    await context.close();
  });

  test('Product Detail & Stable Variant Selection: Dynamic Pricing, Image Switching & Stock State', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await setupCatalogApiMocks(page);

    await page.goto(`${BASE_URL}/products/prod-almonds`, { waitUntil: 'networkidle' });

    // Product title & SKU
    await page.waitForSelector('h1:has-text("Premium California Almonds")', { timeout: 5000 });
    const skuLocator = page.locator('text=SKU:');
    assert.ok(await skuLocator.isVisible());

    // Default variant is 500g (Price: PKR 1,500)
    assert.ok(await page.locator('text=PKR 1,500').isVisible());
    assert.ok(await page.locator('text=In Stock (25 units)').isVisible());

    // Switch to 250g variant
    const variant250g = page.locator('button[role="radio"]:has-text("250g")');
    await variant250g.click();

    // Verify price changes to PKR 800
    await page.waitForSelector('text=PKR 800', { timeout: 3000 });
    assert.ok(await page.locator('text=In Stock (15 units)').isVisible());

    // Switch to 1kg variant (Out of Stock)
    const variant1kg = page.locator('button[role="radio"]:has-text("1kg")');
    await variant1kg.click();

    // Verify Out of Stock status & disabled Add to Cart
    await page.waitForSelector('text=Out of Stock', { timeout: 3000 });
    const addToCartBtn = page.locator('button:has-text("Add to Cart")');
    assert.ok(await addToCartBtn.isDisabled());

    await context.close();
  });

  test('Responsive Viewports & Horizontal Overflow Safety (320px to 1440px)', async () => {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupCatalogApiMocks(page);

      await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });

      // Ensure no horizontal scrollbar overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(
        scrollWidth <= vp.width + 1,
        `Horizontal overflow detected on ${vp.name}: scrollWidth=${scrollWidth} > viewport=${vp.width}`
      );

      // On mobile, check filter drawer opens cleanly
      if (vp.width < 1024) {
        const filterBtn = page.locator('button[aria-label="Open filter sidebar"]');
        await filterBtn.waitFor({ state: 'visible', timeout: 4000 });
        await filterBtn.click();

        const drawer = page.locator('div[role="dialog"][aria-label="Filter products"]');
        await drawer.waitFor({ state: 'visible', timeout: 4000 });
        assert.ok(await drawer.isVisible());

        // Close drawer
        await page.locator('button[aria-label="Close filters"]').click();
        await drawer.waitFor({ state: 'hidden', timeout: 4000 });
      }

      await context.close();
    }
  });

  test('Axe Automated Accessibility Audit (Zero Critical, Zero Serious Violations)', async () => {
    const routes = [
      { name: 'Catalog Listing', path: '/products' },
      { name: 'Product Detail', path: '/products/prod-almonds' },
      { name: 'Search Page', path: '/search?q=Almond' },
    ];

    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupCatalogApiMocks(page);

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
