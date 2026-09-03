import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type Page, type Route } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 3472;
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

const mockOrder = {
  _id: 'ord-test-101',
  orderId: 'ORD-20260904-TEST01',
  orderStatus: 'Pending',
  paymentMethod: 'bank_transfer',
  paymentStatus: 'Pending',
  subtotal: 3000,
  shippingCost: 200,
  discount: 300,
  taxAmount: 0,
  totalAmount: 2900,
  createdAt: '2026-09-04T00:00:00.000Z',
  items: [
    {
      product: {
        _id: 'prod-almonds-1',
        name: 'California Almonds 500g',
        primaryImage: 'https://res.cloudinary.com/demo/image/upload/v1/almonds.jpg',
      },
      name: 'California Almonds 500g',
      price: 1500,
      quantity: 2,
      sku: 'ALM-500',
    },
  ],
  shippingAddress: {
    fullName: 'Muhammad Ahmad',
    phone: '03001234567',
    address: 'House 42, Street 5, Gulberg III',
    city: 'Lahore',
    province: 'Punjab',
    postalCode: '54000',
    country: 'Pakistan',
  },
  trackingNumber: 'TCS-987654321',
  courierCompany: 'TCS Express',
  statusTimeline: [
    { status: 'Order Placed', timestamp: '2026-09-04T00:00:00.000Z', note: 'Order placed by customer' },
  ],
};

const mockManualPayment = {
  _id: 'pay-test-999',
  order: 'ord-test-101',
  provider: 'bank_transfer',
  providerDisplayName: 'Direct Bank Transfer / IBFT',
  providerIntegrationVersion: '2.0.0',
  paymentType: 'manual',
  capabilities: { manualSubmission: true },
  providerPaymentId: 'bt-999',
  safeProviderReference: 'BT-REF-999',
  customerAction: {
    kind: 'bank_transfer',
    accountTitle: 'MevaPur Commerce PVT LTD',
    bankName: 'Meezan Bank Limited',
    accountReference: 'PK00MEZN00012345678901',
    message: 'Please transfer exact amount of PKR 2,900 to our Meezan Bank account.',
  },
  status: 'AwaitingCustomerPayment',
  amount: 2900,
  currency: 'PKR',
  paidAmount: 0,
  refundedAmount: 0,
  customerReferenceMasked: undefined as string | undefined,
  customerSubmittedAt: undefined as string | undefined,
};

async function waitForServer(url: string, maxRetries = 60): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/orders`);
      if (res.status === 200 || res.status === 307 || res.status === 308) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${url}`);
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  const origin = route.request().headers()['origin'] || BASE_URL;
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, Idempotency-Key',
  };

  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers });
  }

  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(data),
  });
}

async function setupOrderRoutes(page: Page) {
  let dynamicOrder = { ...mockOrder };
  let dynamicPayment = { ...mockManualPayment };

  await page.route('**', async (route) => {
    const url = route.request().url();

    if (route.request().method() === 'OPTIONS') {
      return fulfillJson(route, {});
    }

    if (!url.includes('/api/') && !url.includes('/auth/')) {
      return route.continue();
    }

    // CSRF Token
    if (url.includes('/auth/csrf-token')) {
      return fulfillJson(route, {
        success: true,
        data: {
          csrfToken: 'mock-csrf-token',
          hasRefreshSession: true,
        },
      });
    }

    // Refresh Token
    if (url.includes('/auth/refresh')) {
      return fulfillJson(route, {
        success: true,
        data: {
          user: mockUser,
          accessToken: 'mock-jwt-access-token',
          csrfToken: 'mock-csrf-token',
        },
      });
    }

    // Auth Me
    if (url.includes('/auth/me')) {
      return fulfillJson(route, { success: true, data: { user: mockUser } });
    }

    // Invoice endpoint (Specific)
    if (url.includes('/invoice')) {
      return fulfillJson(route, {
        success: true,
        data: {
          invoice: {
            orderNumber: dynamicOrder.orderId,
            date: dynamicOrder.createdAt,
            customer: { fullName: dynamicOrder.shippingAddress.fullName },
            shippingAddress: dynamicOrder.shippingAddress,
            items: [
              {
                name: 'California Almonds 500g',
                sku: 'ALM-500',
                quantity: 2,
                unitPrice: 1500,
                lineTotal: 3000,
              },
            ],
            subtotal: dynamicOrder.subtotal,
            discount: dynamicOrder.discount,
            shipping: dynamicOrder.shippingCost,
            tax: dynamicOrder.taxAmount,
            total: dynamicOrder.totalAmount,
            currency: 'PKR',
            paymentMethod: dynamicOrder.paymentMethod,
            paymentStatus: dynamicOrder.paymentStatus,
          },
        },
      });
    }

    // Order cancellation endpoint (Specific)
    if (url.includes('/cancel')) {
      const body = route.request().postDataJSON() || {};
      dynamicOrder = {
        ...dynamicOrder,
        orderStatus: 'Cancelled',
        cancelledAt: new Date().toISOString(),
        cancelReason: body.reason || 'Customer cancelled via web',
      };
      return fulfillJson(route, {
        success: true,
        data: { order: dynamicOrder },
      });
    }

    // My Orders list (Specific - MUST BE BEFORE generic /orders/)
    if (url.includes('/orders/my-orders')) {
      return fulfillJson(route, {
        success: true,
        data: {
          orders: [dynamicOrder],
          pagination: { page: 1, limit: 10, total: 1, pages: 1 },
        },
      });
    }

    // Payment for Order lookup (Specific)
    if (url.includes('/payments/order/')) {
      return fulfillJson(route, {
        success: true,
        data: { payment: dynamicPayment },
      });
    }

    // Manual reference submission (Specific)
    if (url.includes('/manual-submission')) {
      const postData = route.request().postDataJSON() || {};
      dynamicPayment = {
        ...dynamicPayment,
        status: 'AwaitingVerification',
        customerReferenceMasked: postData.transactionReference
          ? `****${postData.transactionReference.slice(-4)}`
          : '****4321',
        customerSubmittedAt: new Date().toISOString(),
      };
      return fulfillJson(route, {
        success: true,
        data: { payment: dynamicPayment },
      });
    }

    // Specific Order Details (General order lookup)
    if (url.includes('/orders/')) {
      return fulfillJson(route, {
        success: true,
        data: { order: dynamicOrder },
      });
    }

    // Payment summary by ID (General payment lookup)
    if (url.includes('/payments/')) {
      return fulfillJson(route, {
        success: true,
        data: { payment: dynamicPayment },
      });
    }

    if (url.includes('/account/profile')) {
      return fulfillJson(route, { success: true, data: { profile: mockUser } });
    }

    if (url.includes('/account/addresses')) {
      return fulfillJson(route, { success: true, data: { addresses: [] } });
    }

    if (url.includes('/account/returns')) {
      return fulfillJson(route, { success: true, data: { returns: [] } });
    }

    if (url.includes('/account/refunds')) {
      return fulfillJson(route, { success: true, data: { refunds: [] } });
    }

    if (url.includes('/account/notifications')) {
      return fulfillJson(route, { success: true, data: { notifications: [] } });
    }

    return route.continue();
  });
}

describe('Storefront Phase 5: Browser Acceptance & Accessibility Suite', () => {
  let serverProcess: ChildProcess;
  let browser: Browser;

  test.before(async () => {
    const standaloneDir = path.resolve('.next/standalone');
    const serverScript = path.resolve(standaloneDir, 'server.js');

    const staticSrc = path.resolve('.next/static');
    const staticDst = path.resolve(standaloneDir, '.next/static');
    const publicSrc = path.resolve('public');
    const publicDst = path.resolve(standaloneDir, 'public');

    if (fs.existsSync(staticSrc)) {
      fs.mkdirSync(path.dirname(staticDst), { recursive: true });
      fs.cpSync(staticSrc, staticDst, { recursive: true });
    }
    if (fs.existsSync(publicSrc)) {
      fs.cpSync(publicSrc, publicDst, { recursive: true });
    }

    serverProcess = spawn(process.execPath, [serverScript], {
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT}`,
        NEXT_PUBLIC_SITE_NAME: 'MevaPur Commerce',
      },
      stdio: 'ignore',
    });

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

  test('Order History Page (/orders) renders orders and separate status badges', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupOrderRoutes(page);

    await page.goto(`${BASE_URL}/orders`);
    await page.waitForSelector('article', { timeout: 10000 });

    const content = await page.textContent('body');
    assert.match(content!, /ORD-20260904-TEST01/);
    assert.match(content!, /California Almonds/);
    assert.match(content!, /Pending/);

    // Axe audit
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    assert.equal(criticalViolations.length, 0, `Axe violations on /orders: ${JSON.stringify(criticalViolations)}`);

    await context.close();
  });

  test('Order Details Page (/orders/:id) supports cancellation flow with modal dialog', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupOrderRoutes(page);

    await page.goto(`${BASE_URL}/orders/ORD-20260904-TEST01`);
    await page.waitForSelector('h1', { timeout: 10000 });

    // Verify cancellation button is visible for Pending order
    const cancelBtn = page.getByRole('button', { name: /Cancel Order/i });
    assert.equal(await cancelBtn.isVisible(), true);

    // Click cancel button to open modal dialog
    await cancelBtn.click();
    await page.waitForSelector('#cancel-dialog-title', { timeout: 5000 });

    const dialogTitle = await page.textContent('#cancel-dialog-title');
    assert.match(dialogTitle!, /Cancel Order/);

    // Fill optional reason
    await page.fill('#cancelReasonInput', 'Found a better deal on almonds');

    // Submit cancellation
    const confirmBtn = page.getByRole('button', { name: /Confirm Cancellation/i });
    await confirmBtn.click();

    // Wait for cancellation update
    await page.waitForFunction(
      () => document.body.innerText.includes('Order Cancelled') || document.body.innerText.includes('Cancelled'),
      { timeout: 10000 }
    );

    const updatedText = await page.textContent('body');
    assert.match(updatedText!, /Cancelled/);

    // Axe audit
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    assert.equal(criticalViolations.length, 0, `Axe violations on /orders/:id: ${JSON.stringify(criticalViolations)}`);

    await context.close();
  });

  test('Invoice Page (/orders/:id/invoice) renders document with classification', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupOrderRoutes(page);

    await page.goto(`${BASE_URL}/orders/ORD-20260904-TEST01/invoice`);
    await page.waitForSelector('h1', { timeout: 10000 });

    const title = await page.textContent('h1');
    assert.match(title!, /Order Confirmation/);

    const bodyText = await page.textContent('body');
    assert.match(bodyText!, /ORD-20260904-TEST01/);
    assert.match(bodyText!, /Print Document/);

    // Axe audit
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    assert.equal(criticalViolations.length, 0, `Axe violations on /orders/:id/invoice: ${JSON.stringify(criticalViolations)}`);

    await context.close();
  });

  test('Payment Instructions Page (/payment-instructions) renders bank details and reference submission', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await setupOrderRoutes(page);

    await page.goto(`${BASE_URL}/payment-instructions?orderId=ORD-20260904-TEST01`);
    await page.waitForSelector('#transactionReference', { timeout: 10000 });

    const bodyText = await page.textContent('body');
    assert.match(bodyText!, /Meezan Bank/);
    assert.match(bodyText!, /PK00MEZN00012345678901/);

    // Fill transaction reference
    await page.fill('#transactionReference', 'FT26247987654321');
    const submitBtn = page.getByRole('button', { name: /Submit Reference/i });
    await submitBtn.click();

    // Verify transition to AwaitingVerification
    await page.waitForFunction(
      () => document.body.innerText.includes('Verification in Progress') || document.body.innerText.includes('Verification Pending'),
      { timeout: 10000 }
    );

    const updatedText = await page.textContent('body');
    assert.match(updatedText!, /Verification in Progress/);

    // Axe audit
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    assert.equal(criticalViolations.length, 0, `Axe violations on /payment-instructions: ${JSON.stringify(criticalViolations)}`);

    await context.close();
  });

  test('Responsive Viewports check across all 5 standard widths', async () => {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupOrderRoutes(page);

      await page.goto(`${BASE_URL}/orders`);
      await page.waitForSelector('article', { timeout: 10000 });

      // Check no horizontal scrollbar / overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      assert.equal(
        hasHorizontalScroll,
        false,
        `Horizontal overflow detected at viewport ${vp.name} (${vp.width}px)`
      );

      await context.close();
    }
  });
});
