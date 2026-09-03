import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  roundMoney,
  formatMoney,
  calculateLineTotal,
  calculateSubtotal,
  calculateEstimatedDiscount,
} from '../src/lib/money.ts';
import {
  getCartLineKey,
  MAX_LINES,
  MAX_QUANTITY_PER_LINE,
  type CartItem,
} from '../src/store/cartStore.ts';
import {
  revalidateCart,
} from '../src/lib/cartRevalidation.ts';
import {
  generateIdempotencyKey,
  computeCheckoutFingerprint,
  serializeCheckoutPayload,
} from '../src/lib/checkoutService.ts';

describe('Storefront Money & Currency Safety', () => {
  test('strictly adheres to backend rounding semantics', () => {
    assert.equal(roundMoney(10.005), 10.01);
    assert.equal(roundMoney(10.004), 10);
    assert.equal(roundMoney('1500.50'), 1500.5);
    assert.equal(roundMoney(null), 0);
    assert.equal(roundMoney(undefined), 0);
    assert.equal(roundMoney(NaN), 0);
    assert.equal(roundMoney(Infinity), 0);
  });

  test('strictly preserves legitimate numeric zeros for price and subtotal', () => {
    assert.equal(roundMoney(0), 0);
    assert.equal(formatMoney(0), 'PKR 0');
    assert.equal(calculateLineTotal(0, 5), 0);
    assert.equal(calculateSubtotal([{ price: 0, quantity: 10 }]), 0);
  });

  test('prevents negative totals and floating-point drift', () => {
    const items = [
      { price: 19.99, quantity: 3 },
      { price: 5.5, quantity: 2 },
    ];
    // (19.99 * 3 = 59.97) + (5.5 * 2 = 11.00) = 70.97
    assert.equal(calculateSubtotal(items), 70.97);

    // Negative prevention
    assert.equal(calculateEstimatedDiscount(-50), 0);
  });

  test('formats money with configurable currency symbol', () => {
    assert.equal(formatMoney(1500), 'PKR 1,500');
    assert.equal(formatMoney(1500.75, 'USD'), 'USD 1,500.75');
  });
});

describe('Storefront Cart Line Identity & Bounds', () => {
  test('builds canonical line key separating simple products from specific variants', () => {
    const simpleKey = getCartLineKey('prod-123');
    const variantAKey = getCartLineKey('prod-123', 'var-456');
    const variantBKey = getCartLineKey('prod-123', 'var-789');

    assert.equal(simpleKey, 'prod-123:default');
    assert.equal(variantAKey, 'prod-123:var-456');
    assert.equal(variantBKey, 'prod-123:var-789');

    assert.notEqual(simpleKey, variantAKey);
    assert.notEqual(variantAKey, variantBKey);
  });

  test('enforces max quantity bounds per line (20) and max lines (50)', () => {
    assert.equal(MAX_LINES, 50);
    assert.equal(MAX_QUANTITY_PER_LINE, 20);
  });
});

describe('Storefront Checkout Payload Allowlist & Idempotency', () => {
  test('generates cryptographically strong UUID v4 idempotency keys', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();

    assert.ok(typeof key1 === 'string' && key1.length >= 32);
    assert.ok(typeof key2 === 'string' && key2.length >= 32);
    assert.notEqual(key1, key2);
    assert.match(
      key1,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  test('computes checkout fingerprint matching material intent', () => {
    const items: CartItem[] = [
      { id: 'prod-1', productId: 'prod-1', name: 'Almonds', price: 1000, quantity: 2, image: '/a.png' },
    ];
    const address = {
      fullName: 'Ahmad Khan',
      phone: '03001234567',
      address: '123 Main Street',
      city: 'Lahore',
      province: 'Punjab',
      country: 'PK',
    };

    const fp1 = computeCheckoutFingerprint(items, address, 'cod', 'SAVE10');
    const fp2 = computeCheckoutFingerprint(items, address, 'cod', 'SAVE10');
    const fpModified = computeCheckoutFingerprint(items, address, 'cod', 'SAVE20');

    assert.equal(fp1, fp2);
    assert.notEqual(fp1, fpModified);
  });

  test('serializes checkout payload through strict allowlist omitting forbidden fields', () => {
    const dirtyItems: CartItem[] = [
      {
        id: '6a99b9807892603b9de1a256',
        productId: '6a99b9807892603b9de1a256',
        variantId: '6a99b9807892603b9de1a257',
        name: 'Cashews',
        price: 1200,
        quantity: 2,
        image: '/cashews.png',
        isUnavailable: false,
      },
    ];

    const address = {
      fullName: 'Muhammad Ahmad',
      phone: '03001234567',
      address: 'House 14, Street 2, Sector F-6',
      city: 'Islamabad',
      province: 'Islamabad Capital Territory',
      postalCode: '44000',
      country: 'PK',
      extraMaliciousField: 'exploit',
    };

    const payload = serializeCheckoutPayload(
      dirtyItems,
      address,
      'cod',
      'MEVA10',
      'Handle with care'
    );

    // Verify allowed fields
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].productId, '6a99b9807892603b9de1a256');
    assert.equal(payload.items[0].variantId, '6a99b9807892603b9de1a257');
    assert.equal(payload.items[0].quantity, 2);

    assert.equal(payload.shippingAddress.fullName, 'Muhammad Ahmad');
    assert.equal(payload.shippingAddress.phone, '03001234567');
    assert.equal(payload.paymentMethod, 'cod');
    assert.equal(payload.couponCode, 'MEVA10');
    assert.equal(payload.customerNote, 'Handle with care');

    // Forbidden fields must be absent
    const rawPayload = payload as Record<string, unknown>;
    assert.equal(rawPayload.userId, undefined);
    assert.equal(rawPayload.role, undefined);
    assert.equal(rawPayload.subtotal, undefined);
    assert.equal(rawPayload.totalAmount, undefined);
    assert.equal(rawPayload.discount, undefined);
    assert.equal((rawPayload.shippingAddress as Record<string, unknown>).extraMaliciousField, undefined);
  });
});

describe('Storefront Authoritative Cart Revalidation', () => {
  test('handles empty cart safely without network requests', async () => {
    const result = await revalidateCart([]);
    assert.equal(result.items.length, 0);
    assert.equal(result.summary.hasChanges, false);
    assert.equal(result.summary.hasUnavailableItems, false);
  });
});
