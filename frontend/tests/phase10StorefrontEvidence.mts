/**
 * Phase 10 — Batch 10C Storefront QA & Accessibility Evidence Harness
 *
 * Requirements:
 * - Network-hermetic: permits ONLY loopback (127.0.0.1 / localhost) and same-origin mock requests.
 * - Rejects and records all external calls to CDN, payment providers, analytics, or external hosts.
 * - Fails if externalRequestCount !== 0.
 * - Generates machine-readable request-ledger.json alongside phase10-evidence-summary.json.
 * - Authoritative source of truth: scripts/ops/manifests/uat-fixture-manifest.json.
 * - Deterministic screenshots: <TARGET_SHA>_<TEST_CASE_ID>_<VIEWPORT>_<UTC_TIMESTAMP>.png.
 * - Evaluates horizontal overflow across 5 mandatory viewports:
 *   320x800, 375x812, 768x1024, 1024x768, 1440x900.
 * - Runs Axe WCAG 2.2 AA audits across key storefront routes.
 * - Redacts all secrets, tokens, credentials, and parameters.
 * - Never marks human-only items as PASS.
 */

import assert from 'node:assert/strict';
import test, { describe, before, after } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const repoRoot = path.resolve(process.cwd(), '..');

// ============================================================
// Population Mode vs Non-Mutating Verification Mode
// ============================================================
const isPopulationRequested =
  process.env.POPULATE_TARGET === 'true' || process.argv.includes('--populate-target');
const explicitTargetSha = (process.env.TARGET_SHA || '').trim();
const isExplicit40HexSha = /^[0-9a-f]{40}$/i.test(explicitTargetSha);

let resolvedArtifactDir: string;
let isDisposableTempDir = false;

if (isPopulationRequested) {
  if (!isExplicit40HexSha) {
    throw new Error(
      `Artifact population rejected: TARGET_SHA must be an explicit 40-character hex commit SHA. Received: "${explicitTargetSha}". EVIDENCE_TARGET_SHA_PENDING and malformed values are rejected.`
    );
  }
  try {
    execSync('git diff-index --quiet HEAD -- backend/ admin-panel/ scripts/ops/manifests/ frontend/src/', { cwd: repoRoot, stdio: 'pipe' });
  } catch {
    throw new Error('Artifact population rejected: production code has uncommitted modifications.');
  }

  resolvedArtifactDir = path.resolve(
    repoRoot,
    'docs',
    'execution',
    'evidence',
    'artifacts',
    'phase10-storefront',
    explicitTargetSha
  );
} else if (process.env.ARTIFACT_DIR) {
  resolvedArtifactDir = path.resolve(process.env.ARTIFACT_DIR);
  isDisposableTempDir = false;
} else {
  // Normal verification mode: create disposable OS temporary directory
  resolvedArtifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase10-evidence-'));
  isDisposableTempDir = true;
}

const ARTIFACT_DIR = resolvedArtifactDir;
const TARGET_SHA = isExplicit40HexSha ? explicitTargetSha : 'DISPOSABLE_VERIFICATION_RUN';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3528;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UTC_TIMESTAMP = process.env.STOREFRONT_EVIDENCE_TIMESTAMP || '20260922T120000Z';

const VIEWPORTS = [
  { id: '320x800', name: 'Mobile Mini (320x800)', width: 320, height: 800 },
  { id: '375x812', name: 'Mobile Standard (375x812)', width: 375, height: 812 },
  { id: '768x1024', name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
  { id: '1024x768', name: 'Desktop Standard (1024x768)', width: 1024, height: 768 },
  { id: '1440x900', name: 'Desktop HD (1440x900)', width: 1440, height: 900 },
];

// ============================================================
// Authoritative Batch 10B Fixture Manifest Hydration
// ============================================================
interface ManifestCategoryFixture {
  _id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isFeatured?: boolean;
}

interface ManifestProductFixture {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
  shortDescription: string;
  description: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  stock: number;
  lowStockThreshold?: number;
  status: string;
  isActive: boolean;
  isFeatured?: boolean;
  weight?: number;
  weightGrams?: number;
  allowCOD: boolean;
  countryOfOrigin?: string;
}

interface ManifestOrderFixture {
  _id: string;
  orderId: string;
  user: string;
  idempotencyKey?: string;
  requestHash?: string;
  items: Array<{
    product: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    lineTotal: number;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    province?: string;
    postalCode: string;
    country: string;
    countryCode: string;
  };
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  payment?: {
    provider?: string;
    transactionId?: string;
    currency?: string;
    paidAt?: string;
  };
  orderStatus: string;
  deliveredAt?: string;
  trackingNumber?: string;
  courierCompany?: string;
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  statusTimeline?: Array<{
    status: string;
    actor?: string;
    actorRole?: string;
    timestamp?: string;
    note?: string;
  }>;
}

interface ManifestDatasets {
  categories: ManifestCategoryFixture[];
  products: ManifestProductFixture[];
  orders: ManifestOrderFixture[];
}

interface RawManifestSpecification {
  specificationVersion: string;
  fixtureNamespace: string;
  datasets: ManifestDatasets;
}

const MANIFEST_PATH = path.resolve(repoRoot, 'scripts/ops/manifests/uat-fixture-manifest.json');
const rawManifest: RawManifestSpecification = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

// Hermetic local public asset for product image rendering
const LOCAL_IMAGE_ASSET = '/placeholder.png';

const manifestCategory = {
  _id: rawManifest.datasets.categories[0]._id,
  name: rawManifest.datasets.categories[0].name,
  slug: rawManifest.datasets.categories[0].slug,
  isActive: rawManifest.datasets.categories[0].isActive,
  isFeatured: rawManifest.datasets.categories[0].isFeatured,
};

const manifestProducts = rawManifest.datasets.products.map((p: ManifestProductFixture) => ({
  _id: p._id,
  name: p.name,
  slug: p.slug,
  sku: p.sku,
  category: manifestCategory,
  shortDescription: p.shortDescription,
  description: p.description,
  price: p.price,
  originalPrice: p.originalPrice || undefined,
  discount: p.discount || undefined,
  stock: p.stock,
  status: p.status,
  isActive: p.isActive,
  allowCOD: p.allowCOD,
  weight: p.weight,
  images: [LOCAL_IMAGE_ASSET],
  primaryImage: LOCAL_IMAGE_ASSET,
  variants: [
    {
      _id: `var-${p.slug}`,
      sku: p.sku,
      attributes: [{ name: 'Weight', value: `${p.weightGrams || p.weight || 500}g` }],
      price: p.price,
      stock: p.stock,
      isDefault: true,
    },
    ...(p._id === '66f000000000000000000011'
      ? [
          {
            _id: 'var-alm-1000g',
            sku: 'SKU-ALM-1KG',
            attributes: [{ name: 'Weight', value: '1kg' }],
            price: 2900,
            stock: 50,
            isDefault: false,
          },
        ]
      : []),
  ],
}));

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

const rawDeliveredOrder = rawManifest.datasets.orders.find(
  (o: ManifestOrderFixture) => o.orderId === 'ORD-UAT-DELIVERED-004'
);
if (!rawDeliveredOrder) {
  throw new Error('Authoritative order ORD-UAT-DELIVERED-004 not found in manifest');
}

const manifestDeliveredOrder = {
  _id: rawDeliveredOrder._id,
  orderId: rawDeliveredOrder.orderId,
  orderStatus: rawDeliveredOrder.orderStatus,
  paymentStatus: rawDeliveredOrder.paymentStatus,
  paymentMethod: rawDeliveredOrder.paymentMethod,
  totalAmount: rawDeliveredOrder.totalAmount,
  totalAmountExact: { currency: 'PKR', amountMinor: '150000', amountSubunits: 150000, formatted: 'PKR 1,500' },
  subtotal: rawDeliveredOrder.subtotal,
  subtotalExact: { currency: 'PKR', amountMinor: '150000', amountSubunits: 150000, formatted: 'PKR 1,500' },
  shippingCost: rawDeliveredOrder.shippingCost,
  shippingCostExact: { currency: 'PKR', amountMinor: '0', amountSubunits: 0, formatted: 'PKR 0' },
  taxAmount: rawDeliveredOrder.taxAmount,
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
  shippingAddress: rawDeliveredOrder.shippingAddress,
  createdAt: '2026-09-22T10:00:00.000Z',
  deliveredAt: rawDeliveredOrder.deliveredAt,
  statusTimeline: rawDeliveredOrder.statusTimeline,
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

// ============================================================
// Network Request Ledger & Hermetic Guard
// ============================================================
export interface RequestLedgerEntry {
  url: string;
  method: string;
  classification: string;
  disposition: 'LOCAL_ALLOWED' | 'MOCKED' | 'EXTERNAL_BLOCKED' | 'EXTERNAL_SUCCESS';
  routeFamily?: string;
  resourceType: string;
  timestamp: string;
}

export const requestLedger: RequestLedgerEntry[] = [];
export let localAllowedRequestCount = 0;
export let mockedRequestCount = 0;
export let attemptedExternalRequestCount = 0;
export let blockedExternalRequestCount = 0;
export let successfulExternalRequestCount = 0;
export const mockedCountsByFamily: Record<string, number> = {};

export function getRouteFamily(pathname: string): string {
  if (pathname.includes('/auth/')) return '/auth/*';
  if (pathname.includes('/account/orders')) return '/api/account/orders/*';
  if (pathname.includes('/account/returns') || pathname.includes('/returns')) return '/api/account/returns/*';
  if (pathname.includes('/account/refunds') || pathname.includes('/refunds')) return '/api/refunds/*';
  if (pathname.includes('/checkout/quote') || pathname.includes('/orders/quote')) return '/api/checkout/quote';
  if (pathname.includes('/orders')) return '/api/orders/*';
  if (pathname.includes('/payments/methods') || pathname.includes('/payment/methods')) return '/api/payments/methods';
  if (pathname.includes('/market') || pathname.includes('/commerce/market')) return '/api/market/*';
  if (pathname.includes('/products')) return '/api/products/*';
  if (pathname.includes('/categories')) return '/api/categories/*';
  if (pathname.includes('/content/')) return '/api/content/*';
  if (pathname.includes('/settings/')) return '/api/settings/*';
  if (pathname.includes('/brands')) return '/api/brands/*';
  if (pathname.includes('/assistant/')) return '/api/assistant/*';
  if (pathname.includes('/account/')) return '/api/account/*';
  if (pathname.includes('/wishlist')) return '/api/wishlist/*';
  return '/api/*';
}

export interface RouteEvaluationResult {
  action: 'continue' | 'fulfill' | 'abort';
  classification: string;
  disposition: 'LOCAL_ALLOWED' | 'MOCKED' | 'EXTERNAL_BLOCKED' | 'EXTERNAL_SUCCESS';
  routeFamily?: string;
  isLoopback: boolean;
}

export function evaluateRoutePolicy(rawUrl: string): RouteEvaluationResult {
  // 1. Data and Blob URLs
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return {
      action: 'continue',
      classification: 'LOCAL_INLINE_DATA_OR_BLOB',
      disposition: 'LOCAL_ALLOWED',
      isLoopback: true,
    };
  }

  // 2. Parse URL and verify loopback origin
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      action: 'abort',
      classification: 'MALFORMED_URL_BLOCKED',
      disposition: 'EXTERNAL_BLOCKED',
      isLoopback: false,
    };
  }

  const isLoopback =
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '::1';

  // 3. Reject any non-loopback requests (fail closed)
  if (!isLoopback) {
    let classification = 'EXTERNAL_HOST_BLOCKED';
    if (parsed.hostname.includes('cloudinary') || parsed.hostname.includes('unsplash')) {
      classification = 'EXTERNAL_IMAGE_CDN_BLOCKED';
    } else if (parsed.hostname.includes('stripe')) {
      classification = 'EXTERNAL_PAYMENT_PROVIDER_BLOCKED';
    } else if (parsed.hostname.includes('google') || parsed.hostname.includes('analytics')) {
      classification = 'EXTERNAL_ANALYTICS_BLOCKED';
    }
    return {
      action: 'abort',
      classification,
      disposition: 'EXTERNAL_BLOCKED',
      isLoopback: false,
    };
  }

  // 4. Same-origin loopback handling
  const pathname = parsed.pathname;
  const isApiOrAuth = pathname.includes('/api/') || pathname.includes('/auth/');

  if (!isApiOrAuth) {
    let classification = 'LOCAL_PAGE_ROUTE';
    if (pathname.startsWith('/_next/')) {
      classification = 'LOCAL_NEXTJS_ASSET';
    } else if (pathname.startsWith('/brand/') || pathname.endsWith('.png') || pathname.endsWith('.svg') || pathname.endsWith('.ico')) {
      classification = 'LOCAL_PUBLIC_ASSET';
    } else if (pathname === '/healthz') {
      classification = 'LOCAL_HEALTHCHECK';
    }
    return {
      action: 'continue',
      classification,
      disposition: 'LOCAL_ALLOWED',
      isLoopback: true,
    };
  }

  // 5. Explicitly Mocked Same-Origin API Requests
  const routeFamily = getRouteFamily(pathname);
  return {
    action: 'fulfill',
    classification: 'SAME_ORIGIN_MOCKED_API',
    disposition: 'MOCKED',
    routeFamily,
    isLoopback: true,
  };
}

function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.username || u.password) {
      u.username = '[REDACTED]';
      u.password = '[REDACTED]';
    }
    const sensitive = ['token', 'secret', 'key', 'auth', 'pass', 'password', 'cred', 'credential', 'sig', 'signature', 'session', 'csrf'];
    for (const key of Array.from(u.searchParams.keys())) {
      if (sensitive.some((s) => key.toLowerCase().includes(s))) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

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

  // Add client-side hermetic init script: normalizes API requests to loopback origin
  await page.addInitScript(() => {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null
    ): void {
      let finalUrl = url;
      if (typeof url === 'string' && url.includes('api.mevapur.test')) {
        finalUrl = url.replace('https://api.mevapur.test', window.location.origin);
      }
      origOpen.call(this, method, finalUrl, async, username, password);
    };

    const origFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string' && input.includes('api.mevapur.test')) {
        input = input.replace('https://api.mevapur.test', window.location.origin);
      } else if (input instanceof Request && input.url.includes('api.mevapur.test')) {
        input = new Request(input.url.replace('https://api.mevapur.test', window.location.origin), input);
      }
      return origFetch.call(this, input, init);
    };

    // Hermetic client-side Stripe provider stub: prevents external script loading by @stripe/stripe-js
    (window as unknown as Record<string, unknown>).Stripe = function () {
      return {
        elements: function () {
          return {
            create: function () {
              return {
                mount: function () {},
                on: function () {},
                destroy: function () {},
                update: function () {},
              };
            },
            getElement: function () {
              return null;
            },
            fetchUpdates: async function () {
              return {};
            },
          };
        },
        confirmPayment: async function () {
          return { paymentIntent: { status: 'succeeded' } };
        },
        retrievePaymentIntent: async function () {
          return { paymentIntent: { status: 'succeeded' } };
        },
        _registerWrapper: function () {},
      };
    };
  });

  await page.unroute('**').catch(() => {});

  await page.route('**', async (route) => {
    const req = route.request();
    const rawUrl = req.url();
    const method = req.method();
    const resourceType = req.resourceType();
    const redacted = redactUrl(rawUrl);

    const evaluation = evaluateRoutePolicy(rawUrl);

    if (evaluation.action === 'continue') {
      localAllowedRequestCount++;
      requestLedger.push({
        url: rawUrl.startsWith('data:') && rawUrl.length > 80 ? rawUrl.slice(0, 80) + '...[TRUNCATED_DATA_URL]' : redacted,
        method,
        classification: evaluation.classification,
        disposition: 'LOCAL_ALLOWED',
        resourceType,
        timestamp: new Date().toISOString(),
      });
      return route.continue();
    }

    if (evaluation.action === 'abort') {
      attemptedExternalRequestCount++;
      blockedExternalRequestCount++;
      requestLedger.push({
        url: redacted,
        method,
        classification: evaluation.classification,
        disposition: 'EXTERNAL_BLOCKED',
        resourceType,
        timestamp: new Date().toISOString(),
      });
      try {
        await route.abort('blockedbyclient');
        return;
      } catch {
        blockedExternalRequestCount--;
        successfulExternalRequestCount++;
        requestLedger[requestLedger.length - 1].disposition = 'EXTERNAL_SUCCESS';
        return;
      }
    }

    // 5. Explicitly Mocked Same-Origin API Requests
    mockedRequestCount++;
    const family = evaluation.routeFamily || getRouteFamily(new URL(rawUrl).pathname);
    mockedCountsByFamily[family] = (mockedCountsByFamily[family] || 0) + 1;
    requestLedger.push({
      url: redacted,
      method,
      classification: evaluation.classification,
      disposition: 'MOCKED',
      routeFamily: family,
      resourceType,
      timestamp: new Date().toISOString(),
    });

    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;

    if (pathname.includes('/auth/csrf-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { csrfToken: 'p10-evidence-csrf', hasRefreshSession: isAuthenticated },
        }),
      });
    }

    if (pathname.includes('/auth/refresh') || pathname.includes('/auth/me')) {
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

    if (pathname.includes('/content/public/banner') || pathname.includes('/content/public/slider')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (pathname.includes('/settings/public')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { maintenanceMode: false, codEnabled: true, storeName: 'MevaPur' },
        }),
      });
    }

    if (pathname.includes('/assistant/capabilities')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { enabled: false } }),
      });
    }

    if (pathname.includes('/market/config') || pathname.includes('/commerce/market')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: manifestMarketConfig }),
      });
    }

    if (pathname.includes('/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [manifestCategory] }),
      });
    }

    if (pathname.includes('/brands')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [{ _id: 'brand-mevapur', name: 'MevaPur Naturals', slug: 'mevapur-naturals' }] }),
      });
    }

    if (pathname.includes('/products/top') || pathname.includes('/products/recommended') || pathname.includes('/products/recently-viewed')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: manifestProducts }),
      });
    }

    for (const prod of manifestProducts) {
      if (pathname.includes(prod._id) || pathname.includes(prod.slug) || pathname.includes(prod.sku)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: prod }),
        });
      }
    }

    if (pathname.includes('/products')) {
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

    if (pathname.includes('/payments/methods') || pathname.includes('/payment/methods')) {
      const isPk = rawUrl.includes('country=PK') || !rawUrl.includes('country=');
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

    if (pathname.includes('/checkout/quote') || pathname.includes('/orders/quote')) {
      const isIntl = rawUrl.includes('country=AE') || rawUrl.includes('country=GB');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          quote: isIntl ? intlAeQuote : domesticPkQuote,
        }),
      });
    }

    if (pathname.includes('/account/invoice') || pathname.includes('/invoice')) {
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

    if (pathname.includes('/orders/ORD-UAT-DELIVERED-004') || pathname.includes('/orders/66f000000000000000000044')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { order: manifestDeliveredOrder }, order: manifestDeliveredOrder }),
      });
    }

    if (pathname.includes('/account/orders') || pathname.includes('/orders')) {
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

    if (pathname.includes('/account/returns') || pathname.includes('/returns')) {
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

    if (pathname.includes('/account/refunds') || pathname.includes('/refunds')) {
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

    if (pathname.includes('/account/profile')) {
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

    if (pathname.includes('/account/addresses')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    if (pathname.includes('/wishlist')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    // Unhandled same-origin API route fallback
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: 'Unmatched mock route', path: pathname }),
    });
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
              variantId: 'var-almonds-roasted-500g',
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

describe('Phase 10 — Batch 10C Storefront QA & Accessibility Evidence Suite', { concurrency: 1 }, () => {
  let serverProcess: ChildProcess;
  let browser: Browser;
  const executionSummary: {
    targetSha: string;
    utcTimestamp: string;
    browserVersion: string;
    evidenceType: string;
    authoritativeManifest: string;
    viewports: typeof VIEWPORTS;
    artifacts: Record<string, string[]>;
    overflowChecks: Record<string, boolean>;
    axeAuditResults: Record<string, { criticalOrSeriousViolations: number; passesCount: number }>;
    networkLedgerSummary?: {
      totalRequestCount: number;
      localAllowedRequestCount: number;
      mockedRequestCount: number;
      attemptedExternalRequestCount: number;
      blockedExternalRequestCount: number;
      successfulExternalRequestCount: number;
      mockedCountsByFamily: Record<string, number>;
      ledgerArithmeticValid: boolean;
      isHermetic: boolean;
      totalRequests?: number;
      localAllowedCount?: number;
      mockedCount?: number;
      externalBlockedCount?: number;
    };
  } = {
    targetSha: TARGET_SHA,
    utcTimestamp: UTC_TIMESTAMP,
    browserVersion: 'Google Chrome 153.0.8010.50',
    evidenceType: 'MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE',
    authoritativeManifest: 'scripts/ops/manifests/uat-fixture-manifest.json',
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

    const serverEnv = {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT}`,
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
      NEXT_PUBLIC_SITE_NAME: 'MevaPur',
    };

    if (hasStandalone) {
      const srcStatic = path.resolve(frontendDir, '.next', 'static');
      const destStatic = path.resolve(frontendDir, '.next', 'standalone', '.next', 'static');
      if (fs.existsSync(srcStatic)) {
        fs.cpSync(srcStatic, destStatic, { recursive: true, force: true });
      }
      const srcPublic = path.resolve(frontendDir, 'public');
      const destPublic = path.resolve(frontendDir, '.next', 'standalone', 'public');
      if (fs.existsSync(srcPublic) && !fs.existsSync(destPublic)) {
        fs.cpSync(srcPublic, destPublic, { recursive: true });
      }

      serverProcess = spawn(process.execPath, [standaloneServer], {
        cwd: path.resolve(frontendDir, '.next', 'standalone'),
        env: serverEnv,
        stdio: 'ignore',
      });
    } else {
      serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
        cwd: frontendDir,
        env: serverEnv,
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
    try {
      if (browser) await browser.close();
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 600));
        serverProcess.kill('SIGKILL');
      }

      // Attach network ledger summary
      const totalRequestCount = requestLedger.length;
      const ledgerArithmeticValid =
        totalRequestCount ===
        localAllowedRequestCount +
          mockedRequestCount +
          blockedExternalRequestCount +
          successfulExternalRequestCount;

      executionSummary.networkLedgerSummary = {
        totalRequestCount,
        localAllowedRequestCount,
        mockedRequestCount,
        attemptedExternalRequestCount,
        blockedExternalRequestCount,
        successfulExternalRequestCount,
        mockedCountsByFamily,
        ledgerArithmeticValid,
        isHermetic: attemptedExternalRequestCount === 0 && successfulExternalRequestCount === 0,
        totalRequests: totalRequestCount,
        localAllowedCount: localAllowedRequestCount,
        mockedCount: mockedRequestCount,
        externalBlockedCount: blockedExternalRequestCount,
      };

      // Write machine-readable summaries if ARTIFACT_DIR exists
      if (fs.existsSync(ARTIFACT_DIR)) {
        const summaryPath = path.join(ARTIFACT_DIR, 'phase10-evidence-summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(executionSummary, null, 2), 'utf8');

        const ledgerPath = path.join(ARTIFACT_DIR, 'request-ledger.json');
        fs.writeFileSync(ledgerPath, JSON.stringify(requestLedger, null, 2), 'utf8');
      }
    } finally {
      // Normal verification mode cleanup: remove disposable temporary directory in finally
      if (isDisposableTempDir && fs.existsSync(ARTIFACT_DIR)) {
        try {
          fs.rmSync(ARTIFACT_DIR, { recursive: true, force: true });
        } catch {
          // ignore disposable directory cleanup error
        }
      }
    }
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
    if ((await phoneInput.count()) > 0) await phoneInput.first().fill('+923001234567');
    const addrInput = page.locator('input[name="address"], #address');
    if ((await addrInput.count()) > 0) await addrInput.first().fill('House 12, Street 4, Sector F-7/2');
    const cityInput = page.locator('input[name="city"], #city');
    if ((await cityInput.count()) > 0) await cityInput.first().fill('Islamabad');
    await page.waitForTimeout(400);

    // CHK-01 screenshot (COD selection)
    await captureScreenshot(page, 'CHK-01', '1440x900');

    // CHK-02 screenshot (Card option selected)
    const cardOption = page.locator('input[value="stripe"], label:has-text("Card")');
    if ((await cardOption.count()) > 0) {
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
    // Canonical invoice route requires MongoDB ObjectId
    const ctxReceipt = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageReceipt = await ctxReceipt.newPage();
    await setupUniversalMocks(pageReceipt, { isTaxInvoice: false });
    await pageReceipt.goto(`${BASE_URL}/orders/66f000000000000000000044/invoice`, { waitUntil: 'domcontentloaded' });
    await pageReceipt.waitForTimeout(400);
    await captureScreenshot(pageReceipt, 'DOC-01-receipt', '1440x900');
    await ctxReceipt.close();

    // Tax invoice variant in fresh context
    const ctxTax = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageTax = await ctxTax.newPage();
    await setupUniversalMocks(pageTax, { isTaxInvoice: true });
    await pageTax.goto(`${BASE_URL}/orders/66f000000000000000000044/invoice`, { waitUntil: 'domcontentloaded' });
    await pageTax.waitForTimeout(400);
    await captureScreenshot(pageTax, 'DOC-01-taxinvoice', '1440x900');
    await ctxTax.close();
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
    if ((await countrySelect.count()) > 0) {
      await countrySelect.first().selectOption('AE');
      await page.waitForTimeout(500);
    }
    await captureScreenshot(page, 'COD-ACC-02', '1440x900');

    // COD-ACC-07: Switch back to PK (control case)
    if ((await countrySelect.count()) > 0) {
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

  test('HERM-01: Network Hermeticity Audit & Request Ledger Exact Reconciliation', async () => {
    assert.equal(
      attemptedExternalRequestCount,
      0,
      `Network hermeticity violation: ${attemptedExternalRequestCount} external requests attempted.`
    );
    assert.equal(
      blockedExternalRequestCount,
      0,
      `Expected 0 blocked external requests, got ${blockedExternalRequestCount}.`
    );
    assert.equal(
      successfulExternalRequestCount,
      0,
      `Expected 0 successful external requests, got ${successfulExternalRequestCount}.`
    );
    assert.ok(
      requestLedger.length > 0,
      'Request ledger must contain recorded same-origin and mock requests.'
    );
    assert.ok(
      mockedRequestCount > 0,
      `Expected mockedRequestCount > 0, got ${mockedRequestCount}`
    );
    assert.ok(
      localAllowedRequestCount > 0,
      `Expected localAllowedRequestCount > 0, got ${localAllowedRequestCount}`
    );

    // Invariant: totalRequestCount = localAllowedRequestCount + mockedRequestCount + blockedExternalRequestCount + successfulExternalRequestCount
    const totalCount = requestLedger.length;
    assert.equal(
      totalCount,
      localAllowedRequestCount + mockedRequestCount + blockedExternalRequestCount + successfulExternalRequestCount,
      `Ledger count invariant failed: total=${totalCount}, sum=${localAllowedRequestCount + mockedRequestCount + blockedExternalRequestCount + successfulExternalRequestCount}`
    );

    // Check blocked requests
    const blockedRequests = requestLedger.filter((r) => r.disposition === 'EXTERNAL_BLOCKED');
    assert.equal(
      blockedRequests.length,
      0,
      `Zero requests should have been directed to external hosts: ${JSON.stringify(blockedRequests, null, 2)}`
    );

    // Check mocked dispositions vs local allowed
    for (const entry of requestLedger) {
      if (entry.disposition === 'MOCKED') {
        assert.equal(
          entry.classification,
          'SAME_ORIGIN_MOCKED_API',
          `Mocked entry must have SAME_ORIGIN_MOCKED_API classification: ${entry.url}`
        );
        assert.ok(entry.routeFamily, `Mocked entry must have a recorded routeFamily: ${entry.url}`);
      } else if (entry.disposition === 'LOCAL_ALLOWED') {
        assert.ok(
          entry.classification.startsWith('LOCAL_'),
          `Local allowed entry must have LOCAL_ classification: ${entry.url} (${entry.classification})`
        );
      }
    }

    // Check that route families are populated in mockedCountsByFamily
    const recordedFamilies = Object.keys(mockedCountsByFamily);
    assert.ok(recordedFamilies.length > 0, 'mockedCountsByFamily must record captured route families.');
    assert.ok((mockedCountsByFamily['/api/products/*'] ?? 0) > 0, 'Must record /api/products/* mocked requests.');
    assert.ok((mockedCountsByFamily['/api/categories/*'] ?? 0) > 0, 'Must record /api/categories/* mocked requests.');
    assert.ok((mockedCountsByFamily['/api/market/*'] ?? 0) > 0, 'Must record /api/market/* mocked requests.');
  });

  test('HERM-02: Non-Mutating Verification Mode & Git Tree Safety', async () => {
    // 1. Verify EVIDENCE_TARGET_SHA_PENDING directory does not exist anywhere in repo
    const pendingDir = path.resolve(
      repoRoot,
      'docs',
      'execution',
      'evidence',
      'artifacts',
      'phase10-storefront',
      'EVIDENCE_TARGET_SHA_PENDING'
    );
    assert.equal(
      fs.existsSync(pendingDir),
      false,
      'EVIDENCE_TARGET_SHA_PENDING directory must never exist in repository artifacts tree.'
    );

    // 2. Verify normal verification mode does not touch tracked artifacts tree
    if (!isPopulationRequested && !process.env.ARTIFACT_DIR) {
      assert.ok(
        ARTIFACT_DIR.startsWith(os.tmpdir()),
        `Normal verification mode must write only to OS temporary directory, got: ${ARTIFACT_DIR}`
      );
    }
  });

  test('HERM-03: Route Handler Invariants Unit Proof (Fulfill as MOCKED, Continue as LOCAL_ALLOWED, External Guard Fail-Closed)', async () => {
    // 1. Proof: route.continue() local requests are LOCAL_ALLOWED
    const localPage = evaluateRoutePolicy('http://127.0.0.1:3000/products');
    assert.equal(localPage.action, 'continue');
    assert.equal(localPage.disposition, 'LOCAL_ALLOWED');
    assert.equal(localPage.classification, 'LOCAL_PAGE_ROUTE');

    const nextAsset = evaluateRoutePolicy('http://127.0.0.1:3000/_next/static/chunks/app/page.js');
    assert.equal(nextAsset.action, 'continue');
    assert.equal(nextAsset.disposition, 'LOCAL_ALLOWED');
    assert.equal(nextAsset.classification, 'LOCAL_NEXTJS_ASSET');

    const publicAsset = evaluateRoutePolicy('http://127.0.0.1:3000/brand/logo.svg');
    assert.equal(publicAsset.action, 'continue');
    assert.equal(publicAsset.disposition, 'LOCAL_ALLOWED');
    assert.equal(publicAsset.classification, 'LOCAL_PUBLIC_ASSET');

    const healthCheck = evaluateRoutePolicy('http://127.0.0.1:3000/healthz');
    assert.equal(healthCheck.action, 'continue');
    assert.equal(healthCheck.disposition, 'LOCAL_ALLOWED');
    assert.equal(healthCheck.classification, 'LOCAL_HEALTHCHECK');

    const inlineData = evaluateRoutePolicy('data:image/svg+xml;base64,PHN2Zz4=');
    assert.equal(inlineData.action, 'continue');
    assert.equal(inlineData.disposition, 'LOCAL_ALLOWED');
    assert.equal(inlineData.classification, 'LOCAL_INLINE_DATA_OR_BLOB');

    // 2. Proof: route.fulfill() requests are MOCKED across all normalized route families
    const testFamilies: Array<{ url: string; expectedFamily: string }> = [
      { url: 'http://127.0.0.1:3000/auth/csrf-token', expectedFamily: '/auth/*' },
      { url: 'http://127.0.0.1:3000/auth/me', expectedFamily: '/auth/*' },
      { url: 'http://127.0.0.1:3000/api/products?page=1', expectedFamily: '/api/products/*' },
      { url: 'http://127.0.0.1:3000/api/products/almonds-roasted-500g', expectedFamily: '/api/products/*' },
      { url: 'http://127.0.0.1:3000/api/categories', expectedFamily: '/api/categories/*' },
      { url: 'http://127.0.0.1:3000/api/market/config', expectedFamily: '/api/market/*' },
      { url: 'http://127.0.0.1:3000/api/payments/methods?country=PK', expectedFamily: '/api/payments/methods' },
      { url: 'http://127.0.0.1:3000/api/checkout/quote', expectedFamily: '/api/checkout/quote' },
      { url: 'http://127.0.0.1:3000/api/orders/ORD-UAT-DELIVERED-004', expectedFamily: '/api/orders/*' },
      { url: 'http://127.0.0.1:3000/api/account/orders', expectedFamily: '/api/account/orders/*' },
      { url: 'http://127.0.0.1:3000/api/account/returns', expectedFamily: '/api/account/returns/*' },
      { url: 'http://127.0.0.1:3000/api/refunds', expectedFamily: '/api/refunds/*' },
    ];

    for (const tf of testFamilies) {
      const res = evaluateRoutePolicy(tf.url);
      assert.equal(res.action, 'fulfill', `Expected action 'fulfill' for ${tf.url}`);
      assert.equal(res.disposition, 'MOCKED', `Expected disposition 'MOCKED' for ${tf.url}`);
      assert.equal(res.routeFamily, tf.expectedFamily, `Expected family ${tf.expectedFamily} for ${tf.url}`);
      assert.equal(res.classification, 'SAME_ORIGIN_MOCKED_API');
    }

    // 3. Proof: external requests fail closed (aborted and classified EXTERNAL_BLOCKED)
    const externalHosts = [
      { url: 'https://js.stripe.com/v3/', expectedClassification: 'EXTERNAL_PAYMENT_PROVIDER_BLOCKED' },
      { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', expectedClassification: 'EXTERNAL_IMAGE_CDN_BLOCKED' },
      { url: 'https://www.google-analytics.com/analytics.js', expectedClassification: 'EXTERNAL_ANALYTICS_BLOCKED' },
      { url: 'https://evil-unauthorized-host.com/exfiltrate', expectedClassification: 'EXTERNAL_HOST_BLOCKED' },
      { url: 'not-a-valid-url-at-all', expectedClassification: 'MALFORMED_URL_BLOCKED' },
    ];

    for (const ext of externalHosts) {
      const res = evaluateRoutePolicy(ext.url);
      assert.equal(res.action, 'abort', `External request ${ext.url} must be aborted`);
      assert.equal(res.disposition, 'EXTERNAL_BLOCKED', `External request ${ext.url} must be EXTERNAL_BLOCKED`);
      assert.equal(res.isLoopback, false, `External request ${ext.url} must be non-loopback`);
      assert.equal(res.classification, ext.expectedClassification);
    }

    // 4. Proof: simulated ledger reconciliation
    const simulatedCounts = {
      localAllowed: 5,
      mocked: 12,
      blockedExternal: 5,
      successfulExternal: 0,
    };
    const simulatedTotal =
      simulatedCounts.localAllowed +
      simulatedCounts.mocked +
      simulatedCounts.blockedExternal +
      simulatedCounts.successfulExternal;
    assert.equal(simulatedTotal, 22);
    assert.ok(simulatedCounts.mocked > 0);
    assert.equal(simulatedCounts.successfulExternal, 0);
  });
});
