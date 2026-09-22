/**
 * Phase 10 — Batch 10C Storefront QA & Accessibility Evidence Harness
 *
 * Requirements:
 * - Uses repository-installed Playwright and @axe-core/playwright packages.
 * - Accepts TARGET_SHA, BASE_URL, ARTIFACT_DIR, and STOREFRONT_EVIDENCE_TIMESTAMP via env.
 * - Uses exact Batch 10B fixture manifest IDs, slugs, and SKUs.
 * - Captures deterministic screenshots: <TARGET_SHA>_<TEST_CASE_ID>_<VIEWPORT>_<UTC_TIMESTAMP>.png
 * - Evaluates horizontal overflow across 5 mandatory viewports:
 *   320x800, 375x812, 768x1024, 1024x768, 1440x900.
 * - Runs Axe WCAG 2.2 AA audits across key storefront routes.
 * - Emits machine-readable phase10-evidence-summary.json alongside screenshots.
 * - Clearly labels mocked network results as MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE.
 * - Never records passwords, tokens, cookies, or secrets.
 * - Never marks human-only items as PASS.
 */

import assert from 'node:assert/strict';
import test, { describe, before, after } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const TARGET_SHA = process.env.TARGET_SHA || 'EVIDENCE_TARGET_SHA_PENDING';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3528;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UTC_TIMESTAMP = process.env.STOREFRONT_EVIDENCE_TIMESTAMP || '20260922T120000Z';

const repoRoot = path.resolve(process.cwd(), '..');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve(
  repoRoot,
  'docs',
  'execution',
  'evidence',
  'artifacts',
  'phase10-storefront',
  TARGET_SHA
);

const VIEWPORTS = [
  { id: '320x800', name: 'Mobile Mini (320x800)', width: 320, height: 800 },
  { id: '375x812', name: 'Mobile Standard (375x812)', width: 375, height: 812 },
  { id: '768x1024', name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
  { id: '1024x768', name: 'Desktop Standard (1024x768)', width: 1024, height: 768 },
  { id: '1440x900', name: 'Desktop HD (1440x900)', width: 1440, height: 900 },
];

// Manifest-verified Batch 10B fixtures
const manifestCategory = {
  _id: '66f000000000000000000002',
  name: 'Dry Fruits & Nuts',
  slug: 'dry-fruits-nuts',
  isActive: true,
  isFeatured: true,
};

const manifestProducts = [
  {
    _id: '66f000000000000000000011',
    name: 'Almonds Roasted 500g',
    slug: 'almonds-roasted-500g',
    sku: 'SKU-ALM-500G',
    category: manifestCategory,
    shortDescription: 'Crispy roasted and lightly salted natural California almonds.',
    description: 'Premium handpicked roasted almonds in a vacuum sealed 500g pack.',
    price: 1500,
    stock: 100,
    status: 'published',
    isActive: true,
    allowCOD: true,
    weight: 500,
    images: ['https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg'],
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
    variants: [
      {
        _id: 'var-alm-500g',
        sku: 'SKU-ALM-500G',
        attributes: [{ name: 'Weight', value: '500g' }],
        price: 1500,
        stock: 100,
        isDefault: true,
      },
      {
        _id: 'var-alm-1000g',
        sku: 'SKU-ALM-1KG',
        attributes: [{ name: 'Weight', value: '1kg' }],
        price: 2900,
        stock: 50,
        isDefault: false,
      },
    ],
  },
  {
    _id: '66f000000000000000000012',
    name: 'Pistachios Saffron 250g',
    slug: 'pistachios-saffron-250g',
    sku: 'SKU-PIS-250G',
    category: manifestCategory,
    shortDescription: 'Saffron roasted premium Persian pistachios.',
    description: 'Finest saffron coated pistachios packed in protective 250g pouches.',
    price: 2200,
    stock: 5,
    status: 'published',
    isActive: true,
    allowCOD: true,
    weight: 250,
    images: ['https://res.cloudinary.com/demo/image/upload/v1/pistachios-1.jpg'],
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/pistachios-1.jpg',
    variants: [
      {
        _id: 'var-pis-250g',
        sku: 'SKU-PIS-250G',
        attributes: [{ name: 'Weight', value: '250g' }],
        price: 2200,
        stock: 5,
        isDefault: true,
      },
    ],
  },
  {
    _id: '66f000000000000000000013',
    name: 'Pine Nuts Chilgoza 250g',
    slug: 'pine-nuts-chilgoza-250g',
    sku: 'SKU-CHIL-250G',
    category: manifestCategory,
    shortDescription: 'Wild harvested roasted pine nuts (Chilgoza).',
    description: 'High altitude wild harvested organic pine nuts in 250g pack.',
    price: 4500,
    stock: 0,
    status: 'published',
    isActive: true,
    allowCOD: true,
    weight: 250,
    images: ['https://res.cloudinary.com/demo/image/upload/v1/chilgoza-1.jpg'],
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/chilgoza-1.jpg',
    variants: [
      {
        _id: 'var-chil-250g',
        sku: 'SKU-CHIL-250G',
        attributes: [{ name: 'Weight', value: '250g' }],
        price: 4500,
        stock: 0,
        isDefault: true,
      },
    ],
  },
  {
    _id: '66f000000000000000000014',
    name: 'Walnut Kernels Special 500g',
    slug: 'walnut-kernels-special-500g',
    sku: 'SKU-WAL-500G',
    category: manifestCategory,
    shortDescription: 'Natural light half walnut kernels promotional deal.',
    description: 'Extra light premium walnut kernels rich in Omega-3.',
    price: 1800,
    originalPrice: 2000,
    discount: 10,
    stock: 50,
    status: 'published',
    isActive: true,
    allowCOD: true,
    weight: 500,
    images: ['https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg'],
    primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/walnuts-1.jpg',
    variants: [
      {
        _id: 'var-wal-500g',
        sku: 'SKU-WAL-500G',
        attributes: [{ name: 'Weight', value: '500g' }],
        price: 1800,
        stock: 50,
        isDefault: true,
      },
    ],
  },
];

const manifestMarketConfig = {
  merchantCountry: 'PK',
  homeCountry: 'PK',
  baseCurrency: 'PKR',
  defaultCurrency: 'PKR',
  enabledCountries: ['PK', 'AE', 'GB', 'US', 'CA'],
  supportedCurrencies: ['PKR', 'AED', 'GBP', 'USD'],
  crossBorderCheckoutEnabled: true,
  maintenanceMode: false,
};

const manifestDeliveredOrder = {
  _id: '66f000000000000000000044',
  orderId: 'ORD-UAT-DELIVERED-004',
  orderStatus: 'delivered',
  paymentStatus: 'Paid',
  paymentMethod: 'cod',
  totalAmount: 1500,
  totalAmountExact: { currency: 'PKR', amountMinor: '150000', amountSubunits: 150000, formatted: 'PKR 1,500' },
  subtotal: 1500,
  subtotalExact: { currency: 'PKR', amountMinor: '150000', amountSubunits: 150000, formatted: 'PKR 1,500' },
  shippingCost: 0,
  shippingCostExact: { currency: 'PKR', amountMinor: '0', amountSubunits: 0, formatted: 'PKR 0' },
  taxAmount: 0,
  taxAmountExact: { currency: 'PKR', amountMinor: '0', amountSubunits: 0, formatted: 'PKR 0' },
  discount: 0,
  discountExact: { currency: 'PKR', amountMinor: '0', amountSubunits: 0, formatted: 'PKR 0' },
  items: [
    {
      product: manifestProducts[0],
      name: 'Almonds Roasted 500g',
      price: 1500,
      priceExact: { currency: 'PKR', amountMinor: '150000', amountSubunits: 150000, formatted: 'PKR 1,500' },
      quantity: 1,
      sku: 'SKU-ALM-500G',
      variant: '500g',
    },
  ],
  shippingAddress: {
    fullName: 'UAT Customer PK COD',
    phone: '+923001234567',
    address: 'House 12, Street 4, Sector F-7/2',
    city: 'Islamabad',
    province: 'Islamabad',
    postalCode: '44000',
    country: 'Pakistan',
  },
  createdAt: '2026-09-22T10:00:00.000Z',
  deliveredAt: '2026-09-22T10:20:00.000Z',
  statusTimeline: [
    { status: 'pending', timestamp: '2026-09-22T10:00:00.000Z' },
    { status: 'delivered', timestamp: '2026-09-22T10:20:00.000Z', note: 'Cash collected upon delivery' },
  ],
};

const manifestReceiptData = {
  orderNumber: 'ORD-UAT-DELIVERED-004',
  date: '2026-09-22T10:20:00.000Z',
  customer: {
    fullName: 'UAT Customer PK COD',
  },
  shippingAddress: {
    fullName: 'UAT Customer PK COD',
  phone: '+923001234567',
  address: 'House 12, Street 4, Sector F-7/2',
  city: 'Islamabad',
  province: 'Islamabad',
  postalCode: '44000',
  country: 'Pakistan',
  },
  items: [
    {
      name: 'Almonds Roasted 500g',
      sku: 'SKU-ALM-500G',
      quantity: 1,
      unitPrice: 1500,
      lineTotal: 1500,
    },
  ],
  subtotal: 1500,
  discount: 0,
  shipping: 0,
  tax: 0,
  total: 1500,
  currency: 'PKR',
  paymentMethod: 'cod',
  paymentStatus: 'Paid',
};

const manifestTaxInvoiceData = {
  ...manifestReceiptData,
  orderNumber: 'ORD-UAT-DELIVERED-004',
  tax: 255,
  total: 1755,
  paymentStatus: 'Paid',
};

const domesticPkQuote = {
  quoteToken: 'tok-uat-pk-quote-001',
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  currency: 'PKR',
  isDomestic: true,
  subtotalExact: { currency: 'PKR', amountMinor: '150000', amountSubunits: 150000, formatted: 'PKR 1,500' },
  shippingCostExact: { currency: 'PKR', amountMinor: '20000', amountSubunits: 20000, formatted: 'PKR 200' },
  taxAmountExact: { currency: 'PKR', amountMinor: '0', amountSubunits: 0, formatted: 'PKR 0' },
  dutiesExact: { currency: 'PKR', amountMinor: '0', amountSubunits: 0, formatted: 'PKR 0' },
  discountExact: { currency: 'PKR', amountMinor: '0', amountSubunits: 0, formatted: 'PKR 0' },
  totalAmountExact: { currency: 'PKR', amountMinor: '170000', amountSubunits: 170000, formatted: 'PKR 1,700' },
  eligiblePaymentMethods: [
    { code: 'cod', name: 'Cash on Delivery', description: 'Pay in cash upon delivery (Pakistan only)' },
    { code: 'stripe', name: 'Credit or Debit Card', description: 'Secure online card payment' },
  ],
  deliveryPromise: { minDays: 2, maxDays: 4, formattedRange: '2-4 business days' },
};

const intlAeQuote = {
  quoteToken: 'tok-uat-intl-quote-002',
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  currency: 'AED',
  isDomestic: false,
  subtotalExact: { currency: 'AED', amountMinor: '4500', amountSubunits: 4500, formatted: 'AED 45.00' },
  shippingCostExact: { currency: 'AED', amountMinor: '2500', amountSubunits: 2500, formatted: 'AED 25.00' },
  taxAmountExact: { currency: 'AED', amountMinor: '0', amountSubunits: 0, formatted: 'AED 0.00' },
  dutiesExact: { currency: 'AED', amountMinor: '0', amountSubunits: 0, formatted: 'AED 0.00' },
  discountExact: { currency: 'AED', amountMinor: '0', amountSubunits: 0, formatted: 'AED 0.00' },
  totalAmountExact: { currency: 'AED', amountMinor: '7000', amountSubunits: 7000, formatted: 'AED 70.00' },
  eligiblePaymentMethods: [
    { code: 'stripe', name: 'Credit or Debit Card', description: 'Prepaid card payment' },
  ],
  deliveryPromise: { minDays: 5, maxDays: 8, formattedRange: '5-8 international business days' },
};

async function waitForServer(url: string, maxRetries = 60): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.status === 200 || res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${url}`);
}

async function setupUniversalMocks(page: Page, options: { isAuthenticated?: boolean; isTaxInvoice?: boolean } = {}) {
  const { isAuthenticated = true, isTaxInvoice = false } = options;

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
          data: { csrfToken: 'p10-evidence-csrf', hasRefreshSession: isAuthenticated },
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
                id: '66f000000000000000000021',
                fullName: 'UAT Customer PK COD',
                email: 'customer-pk-cod@mevapur.test',
                role: 'customer',
                isVerified: true,
              },
              accessToken: 'synthetic-jwt-phase10-evidence',
              csrfToken: 'p10-evidence-csrf',
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

    if (url.includes('/market/config') || url.includes('/commerce/market')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: manifestMarketConfig }),
      });
    }

    if (url.includes('/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [manifestCategory] }),
      });
    }

    if (url.includes('/brands')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [{ _id: 'brand-mevapur', name: 'MevaPur Naturals', slug: 'mevapur-naturals' }] }),
      });
    }

    if (url.includes('/products/top') || url.includes('/products/recommended') || url.includes('/products/recently-viewed')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: manifestProducts }),
      });
    }

    for (const prod of manifestProducts) {
      if (url.includes(prod._id) || url.includes(prod.slug) || url.includes(prod.sku)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: prod }),
        });
      }
    }

    if (url.includes('/products')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: manifestProducts,
          pagination: { page: 1, pages: 1, total: 4, limit: 12, hasNext: false, hasPrev: false },
        }),
      });
    }

    if (url.includes('/payments/methods') || url.includes('/payment/methods')) {
      const isPk = url.includes('country=PK') || !url.includes('country=');
      if (isPk) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [
              { code: 'cod', name: 'Cash on Delivery', description: 'Pay in cash upon delivery (Pakistan only)' },
              { code: 'stripe', name: 'Credit or Debit Card', description: 'Pay with Card' },
            ],
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { code: 'stripe', name: 'Credit or Debit Card', description: 'Prepaid Card Payment' },
          ],
        }),
      });
    }

    if (url.includes('/checkout/quote') || url.includes('/orders/quote')) {
      const isIntl = url.includes('country=AE') || url.includes('country=GB');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          quote: isIntl ? intlAeQuote : domesticPkQuote,
        }),
      });
    }

    if (url.includes('/account/invoice') || url.includes('/invoice')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { invoice: isTaxInvoice ? manifestTaxInvoiceData : manifestReceiptData },
          invoice: isTaxInvoice ? manifestTaxInvoiceData : manifestReceiptData,
        }),
      });
    }

    if (url.includes('/orders/ORD-UAT-DELIVERED-004') || url.includes('/orders/66f000000000000000000044')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { order: manifestDeliveredOrder }, order: manifestDeliveredOrder }),
      });
    }

    if (url.includes('/account/orders') || url.includes('/orders')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [manifestDeliveredOrder],
          orders: [manifestDeliveredOrder],
          pagination: { page: 1, pages: 1, total: 1, limit: 10, hasNext: false, hasPrev: false },
        }),
      });
    }

    if (url.includes('/account/returns') || url.includes('/returns')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { returns: [] },
          returns: [],
        }),
      });
    }

    if (url.includes('/account/refunds') || url.includes('/refunds')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { refunds: [] },
          refunds: [],
        }),
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
              id: '66f000000000000000000021',
              fullName: 'UAT Customer PK COD',
              email: 'customer-pk-cod@mevapur.test',
              phone: '+923001234567',
              avatar: '',
              residenceCountry: 'PK',
              preferredMarketCountry: 'PK',
              isCountryComplete: true,
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

async function injectCartState(page: Page) {
  await page.evaluate((product) => {
    localStorage.setItem(
      'storefront-cart-storage',
      JSON.stringify({
        state: {
          items: [
            {
              id: product._id,
              productId: product._id,
              variantId: 'var-alm-500g',
              name: product.name,
              price: product.price,
              image: product.primaryImage,
              quantity: 1,
              stock: product.stock,
              sku: product.sku,
              variant: '500g',
            },
          ],
          totalItems: 1,
          wishlist: [],
        },
        version: 2,
      })
    );
  }, manifestProducts[0]);
}

describe('Phase 10 — Batch 10C Storefront QA & Accessibility Evidence Suite', () => {
  let serverProcess: ChildProcess;
  let browser: Browser;
  const executionSummary: {
    targetSha: string;
    utcTimestamp: string;
    browserVersion: string;
    evidenceType: string;
    viewports: typeof VIEWPORTS;
    artifacts: Record<string, string[]>;
    overflowChecks: Record<string, boolean>;
    axeAuditResults: Record<string, { criticalOrSeriousViolations: number; passesCount: number }>;
  } = {
    targetSha: TARGET_SHA,
    utcTimestamp: UTC_TIMESTAMP,
    browserVersion: 'Google Chrome 153.0.8010.50',
    evidenceType: 'MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE',
    viewports: VIEWPORTS,
    artifacts: {},
    overflowChecks: {},
    axeAuditResults: {},
  };

  before(async () => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

    const frontendDir = fs.existsSync(path.resolve(process.cwd(), '.next'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'frontend');

    const standaloneServer = path.resolve(frontendDir, '.next', 'standalone', 'server.js');
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
        },
        stdio: 'ignore',
      });
    } else {
      serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
        cwd: frontendDir,
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: 'production',
          NEXT_PUBLIC_API_URL: 'https://api.mevapur.test',
          NEXT_PUBLIC_SITE_URL: 'https://storefront.mevapur.test',
          NEXT_PUBLIC_SITE_NAME: 'MevaPur',
        },
        stdio: 'ignore',
        shell: true,
      });
    }

    await waitForServer(BASE_URL);

    browser = await chromium.launch({
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    executionSummary.browserVersion = browser.version();
  });

  after(async () => {
    if (browser) await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess.kill('SIGKILL');
    }

    // Write machine-readable summary
    const summaryPath = path.join(ARTIFACT_DIR, 'phase10-evidence-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(executionSummary, null, 2), 'utf8');
  });

  async function captureScreenshot(page: Page, testCaseId: string, viewportId: string): Promise<string> {
    const filename = `${TARGET_SHA}_${testCaseId}_${viewportId}_${UTC_TIMESTAMP}.png`;
    const fullPath = path.join(ARTIFACT_DIR, filename);
    await page.screenshot({ path: fullPath, fullPage: false });
    const relPath = `docs/execution/evidence/artifacts/phase10-storefront/${TARGET_SHA}/${filename}`;
    if (!executionSummary.artifacts[testCaseId]) {
      executionSummary.artifacts[testCaseId] = [];
    }
    executionSummary.artifacts[testCaseId].push(relPath);
    return relPath;
  }

  test('NAV-01: Homepage Navigation & Mobile Drawer (Desktop 1440x900 & Mobile 375x812)', async () => {
    // Desktop HD
    const ctxDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageDesktop = await ctxDesktop.newPage();
    await setupUniversalMocks(pageDesktop);
    await pageDesktop.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForTimeout(300);
    await captureScreenshot(pageDesktop, 'NAV-01', '1440x900');
    await ctxDesktop.close();

    // Mobile Standard
    const ctxMobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const pageMobile = await ctxMobile.newPage();
    await setupUniversalMocks(pageMobile);
    await pageMobile.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await pageMobile.waitForTimeout(300);
    const menuBtn = pageMobile.locator('button[aria-label="Open navigation menu"]');
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await pageMobile.waitForTimeout(300);
    }
    await captureScreenshot(pageMobile, 'NAV-01', '375x812');
    await ctxMobile.close();
  });

  test('CAT-01: Catalog Search & Filter Query State (/products)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page);
    await page.goto(`${BASE_URL}/products?search=almonds&sort=price_asc`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'CAT-01', '1440x900');
    await ctx.close();
  });

  test('PRD-01: Product Detail In-Stock & Out-of-Stock States', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page);

    // In stock: almonds-roasted-500g (66f000000000000000000011)
    await page.goto(`${BASE_URL}/products/almonds-roasted-500g`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'PRD-01-instock', '1440x900');

    // Out of stock: pine-nuts-chilgoza-250g (66f000000000000000000013)
    await page.goto(`${BASE_URL}/products/pine-nuts-chilgoza-250g`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'PRD-01-outofstock', '1440x900');

    await ctx.close();
  });

  test('CRT-01: Cart Persistence & Recalculation (/cart)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await injectCartState(page);
    await page.goto(`${BASE_URL}/cart`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'CRT-01', '1440x900');
    await ctx.close();
  });

  test('CHK-01 & CHK-02: Checkout COD & Prepaid Modal Coordinator (/checkout)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await injectCartState(page);
    await page.goto(`${BASE_URL}/checkout`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // Fill address
    const phoneInput = page.locator('input[name="phone"], #phone');
    if (await phoneInput.count() > 0) await phoneInput.first().fill('+923001234567');
    const addrInput = page.locator('input[name="address"], #address');
    if (await addrInput.count() > 0) await addrInput.first().fill('House 12, Street 4, Sector F-7/2');
    const cityInput = page.locator('input[name="city"], #city');
    if (await cityInput.count() > 0) await cityInput.first().fill('Islamabad');
    await page.waitForTimeout(400);

    // CHK-01 screenshot (COD selection)
    await captureScreenshot(page, 'CHK-01', '1440x900');

    // CHK-02 screenshot (Card option selected)
    const cardOption = page.locator('input[value="stripe"], label:has-text("Card")');
    if (await cardOption.count() > 0) {
      await cardOption.first().click();
      await page.waitForTimeout(300);
    }
    await captureScreenshot(page, 'CHK-02', '1440x900');

    await ctx.close();
  });

  test('ORD-01: Customer Orders List & Delivered Timeline', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page);

    // Order list
    await page.goto(`${BASE_URL}/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'ORD-01-list', '1440x900');

    // Order details timeline: ORD-UAT-DELIVERED-004
    await page.goto(`${BASE_URL}/orders/ORD-UAT-DELIVERED-004`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'ORD-01-timeline', '1440x900');

    await ctx.close();
  });

  test('DOC-01: Order Document Truthfulness & Print Root Sheet', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // Canonical invoice route requires MongoDB ObjectId
    await setupUniversalMocks(page, { isTaxInvoice: false });
    await page.goto(`${BASE_URL}/orders/66f000000000000000000044/invoice`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'DOC-01-receipt', '1440x900');

    // Tax invoice variant
    await setupUniversalMocks(page, { isTaxInvoice: true });
    await page.goto(`${BASE_URL}/orders/66f000000000000000000044/invoice`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'DOC-01-taxinvoice', '1440x900');

    await ctx.close();
  });

  test('RET-01: Customer Return-Request Flow (/account?tab=returns)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page);
    await page.goto(`${BASE_URL}/account?tab=returns`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await captureScreenshot(page, 'RET-01', '1440x900');
    await ctx.close();
  });

  test('A11Y-01: Keyboard Focus & Skip Link Navigation', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page, { isAuthenticated: false });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    await captureScreenshot(page, 'A11Y-01-skiplink', '1440x900');
    await ctx.close();
  });

  test('VIEW-01: 5-Viewport Responsive Layout Matrix & Zero Horizontal Overflow', async () => {
    const routes = ['/', '/products', '/cart', '/checkout', '/orders/ORD-UAT-DELIVERED-004'];

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await setupUniversalMocks(page);

      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await injectCartState(page);
      await captureScreenshot(page, `VIEW-01-${vp.id}`, vp.id);

      for (const r of routes) {
        await page.goto(`${BASE_URL}${r}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(150);

        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });

        const key = `${r}@${vp.id}`;
        executionSummary.overflowChecks[key] = hasOverflow;
        assert.equal(
          hasOverflow,
          false,
          `Unintended page-level horizontal overflow on ${r} at viewport ${vp.name}`
        );
      }

      await ctx.close();
    }
  });

  test('COD-ACC-01, 02A, 07: Domestic Serviceable, Foreign Rejection, and Control Case', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupUniversalMocks(page);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await injectCartState(page);
    await page.goto(`${BASE_URL}/checkout`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // COD-ACC-01: Domestic PK address (COD enabled)
    await captureScreenshot(page, 'COD-ACC-01', '1440x900');

    // COD-ACC-02A: Switch destination to AE (foreign country, COD excluded)
    const countrySelect = page.locator('select[name="country"], #country');
    if (await countrySelect.count() > 0) {
      await countrySelect.first().selectOption('AE');
      await page.waitForTimeout(500);
    }
    await captureScreenshot(page, 'COD-ACC-02', '1440x900');

    // COD-ACC-07: Switch back to PK (control case)
    if (await countrySelect.count() > 0) {
      await countrySelect.first().selectOption('PK');
      await page.waitForTimeout(500);
    }
    await captureScreenshot(page, 'COD-ACC-07', '1440x900');

    await ctx.close();
  });

  test('Axe WCAG 2.2 AA Audits Across All Key Routes', async () => {
    const auditPages = [
      { path: '/', name: 'Homepage' },
      { path: '/products', name: 'Catalog' },
      { path: '/products/almonds-roasted-500g', name: 'Product Detail' },
      { path: '/cart', name: 'Cart' },
      { path: '/checkout', name: 'Checkout' },
      { path: '/orders/ORD-UAT-DELIVERED-004', name: 'Order Detail' },
      { path: '/orders/66f000000000000000000044/invoice', name: 'Invoice Sheet' },
      { path: '/account', name: 'Account & Returns' },
      { path: '/login', name: 'Login' },
      { path: '/register', name: 'Register' },
      { path: '/forgot-password', name: 'Forgot Password' },
    ];

    for (const ap of auditPages) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await setupUniversalMocks(page);

      if (ap.path === '/cart' || ap.path === '/checkout') {
        await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
        await injectCartState(page);
      }

      await page.goto(`${BASE_URL}${ap.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const criticalOrSerious = axeResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      executionSummary.axeAuditResults[ap.path] = {
        criticalOrSeriousViolations: criticalOrSerious.length,
        passesCount: axeResults.passes.length,
      };

      assert.equal(
        criticalOrSerious.length,
        0,
        `Axe violations on ${ap.name} (${ap.path}): ${JSON.stringify(criticalOrSerious, null, 2)}`
      );

      await ctx.close();
    }
  });
});
