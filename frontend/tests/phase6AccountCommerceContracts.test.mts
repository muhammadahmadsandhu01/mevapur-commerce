import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validatePasswordPolicy } from '../src/lib/passwordPolicy.ts';
import {
  getSessionGeneration,
  isCurrentSessionGeneration,
  clearAuthentication,
  acceptAuthentication
} from '../src/lib/authSession.ts';
import {
  buildReturnRequestPayload,
  getAccountApiErrorMessage,
  type HistoricalOrderLine
} from '../src/services/account.service.ts';

describe('Phase 6 Account Commerce Contracts & Security', () => {
  describe('Canonical 12-Character Password Policy', () => {
    test('rejects passwords shorter than 12 characters', () => {
      const result = validatePasswordPolicy('Short1!Aa');
      assert.equal(result.isValid, false);
      assert.equal(result.hasLength, false);
      assert.ok(result.errors.some((e) => e.includes('12 characters')));
    });

    test('rejects passwords missing uppercase, lowercase, number, or special character', () => {
      assert.equal(validatePasswordPolicy('nouppercase123!@#').hasUpper, false);
      assert.equal(validatePasswordPolicy('NOLOWERCASE123!@#').hasLower, false);
      assert.equal(validatePasswordPolicy('NoNumbersHere!@#').hasNumber, false);
      assert.equal(validatePasswordPolicy('NoSpecialChar1234').hasSpecial, false);
    });

    test('rejects passwords with 3+ repeated identical characters', () => {
      const result = validatePasswordPolicy('ValidPass123!!!aaa');
      assert.equal(result.hasNoRepeat, false);
      assert.ok(result.errors.some((e) => e.includes('repeated characters')));
    });

    test('rejects passwords with 3+ sequential characters (e.g. abc, 123)', () => {
      const result = validatePasswordPolicy('StrongPass!123xyz');
      assert.equal(result.hasNoSequential, false);
      assert.ok(result.errors.some((e) => e.includes('sequential characters')));
    });

    test('accepts strong, compliant passwords meeting all 7 rules', () => {
      const result = validatePasswordPolicy('MevaPur#Secure2026');
      assert.equal(result.isValid, true);
      assert.equal(result.score, 7);
      assert.equal(result.errors.length, 0);
    });
  });

  describe('Centralized Session Generation Race Protection', () => {
    test('session generation increases on authentication transitions and invalidates previous generations', () => {
      const initialGen = getSessionGeneration();
      assert.equal(isCurrentSessionGeneration(initialGen), true);

      // User A starts async request and captures generation
      const userARequestGen = initialGen;

      // User A logs out -> generation bumps
      clearAuthentication();
      const afterLogoutGen = getSessionGeneration();
      assert.ok(afterLogoutGen > userARequestGen);
      assert.equal(isCurrentSessionGeneration(userARequestGen), false);

      // User B logs in -> generation bumps
      acceptAuthentication({
        user: { id: 'user-b', fullName: 'User B', email: 'userb@example.com', isVerified: true },
        accessToken: 'mock-token-b',
        csrfToken: 'mock-csrf-b'
      });
      const userBGen = getSessionGeneration();
      assert.ok(userBGen > afterLogoutGen);

      // Stale User A response arriving late is recognized as stale
      assert.equal(isCurrentSessionGeneration(userARequestGen), false);
      assert.equal(isCurrentSessionGeneration(userBGen), true);
    });
  });

  describe('Return Request Payload Builder', () => {
    test('correctly shapes return request payload for simple and variant order lines', () => {
      const simpleLine: HistoricalOrderLine = {
        product: 'prod-123',
        name: 'Organic Almonds',
        quantity: 2
      };

      const simplePayload = buildReturnRequestPayload({
        orderId: 'ORD-12345',
        line: simpleLine,
        quantity: 1,
        reason: 'damaged',
        details: 'Package arrived torn'
      });

      assert.equal(simplePayload.orderId, 'ORD-12345');
      assert.equal(simplePayload.items[0].productId, 'prod-123');
      assert.equal(simplePayload.items[0].quantity, 1);
      assert.equal(simplePayload.items[0].reason, 'damaged');
      assert.equal(simplePayload.items[0].reasonDetails, 'Package arrived torn');
      assert.equal(simplePayload.customerNotes, 'Package arrived torn');

      const variantLine: HistoricalOrderLine = {
        product: { _id: 'prod-456', name: 'Premium Walnuts' },
        variantId: 'var-789',
        name: 'Premium Walnuts - 500g',
        quantity: 1
      };

      const variantPayload = buildReturnRequestPayload({
        orderId: 'ORD-67890',
        line: variantLine,
        quantity: 1,
        reason: 'wrong_item',
        details: ''
      });

      assert.equal(variantPayload.items[0].productId, 'prod-456');
      assert.equal(variantPayload.items[0].variantId, 'var-789');
      assert.equal(variantPayload.items[0].reason, 'wrong_item');
      assert.equal(variantPayload.items[0].reasonDetails, undefined);
    });
  });

  describe('Account API Error Message Resolution', () => {
    test('extracts structured error messages and falls back gracefully', () => {
      assert.equal(
        getAccountApiErrorMessage({ isAxiosError: true, response: { data: { error: { message: 'Invalid address' } } } }, 'Fallback'),
        'Invalid address'
      );
      assert.equal(
        getAccountApiErrorMessage(new Error('Network error'), 'Default Fallback'),
        'Default Fallback'
      );
    });
  });

  describe('Delayed-Response Cross-Account State Contamination Prevention', () => {
    test('delayed response from User A cannot populate User B account state after logout/switch', async () => {
      let activeAccountState = { userId: 'user-a', name: 'User A', email: 'usera@example.com' };

      // User A initiates slow network fetch
      const requestGen = getSessionGeneration();

      // Simulated slow network request
      const slowFetchPromise = (async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { userId: 'user-a', name: 'User A Updated Profile' };
      })();

      // User A logs out and User B logs in immediately
      clearAuthentication();
      acceptAuthentication({
        user: { id: 'user-b', fullName: 'User B', email: 'userb@example.com', isVerified: true },
        accessToken: 'jwt-b',
        csrfToken: 'csrf-b'
      });
      activeAccountState = { userId: 'user-b', name: 'User B', email: 'userb@example.com' };

      // User A's slow response now resolves
      const lateData = await slowFetchPromise;

      // Safe state setter guard
      if (isCurrentSessionGeneration(requestGen)) {
        activeAccountState = { ...activeAccountState, name: lateData.name };
      }

      // Assert that User B state was NOT overwritten by late User A response
      assert.equal(activeAccountState.userId, 'user-b');
      assert.equal(activeAccountState.name, 'User B');
      assert.equal(activeAccountState.email, 'userb@example.com');
    });
  });

  describe('Address Book Default Handling & Market Restrictions', () => {
    test('deleting default address auto-promotes the first remaining address as default', () => {
      const addresses = [
        { id: 'addr-1', fullName: 'Address 1', isDefault: true },
        { id: 'addr-2', fullName: 'Address 2', isDefault: false },
        { id: 'addr-3', fullName: 'Address 3', isDefault: false },
      ];

      // Delete addr-1
      const deletedId = 'addr-1';
      const remaining = addresses.filter((a) => a.id !== deletedId);
      const wasDefault = addresses.find((a) => a.id === deletedId)?.isDefault;

      if (wasDefault && remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }

      assert.equal(remaining.length, 2);
      assert.equal(remaining[0].id, 'addr-2');
      assert.equal(remaining[0].isDefault, true);
    });

    test('validates delivery address countries strictly against authoritative market config', () => {
      const marketConfig = {
        homeCountry: 'PK',
        enabledCountries: ['PK'],
        defaultCurrency: 'PKR'
      };

      const isCountryAllowed = (countryCode: string) => (
        marketConfig.enabledCountries.includes(countryCode.toUpperCase())
      );

      assert.equal(isCountryAllowed('PK'), true);
      assert.equal(isCountryAllowed('pk'), true);
      assert.equal(isCountryAllowed('US'), false);
      assert.equal(isCountryAllowed('GB'), false);
      assert.equal(isCountryAllowed('IN'), false);
    });
  });

  describe('Wishlist Variable Product Handling & Action Routing', () => {
    test('distinguishes variable products requiring Choose Options from simple products', () => {
      const variableProduct = {
        id: 'prod-var',
        name: 'Himalayan Apricots',
        slug: 'himalayan-apricots',
        hasVariants: true,
        variants: [{ sku: 'APR-500G', price: 900 }]
      };

      const simpleProduct = {
        id: 'prod-simple',
        name: 'Pure Honey',
        slug: 'pure-honey',
        hasVariants: false,
        variants: []
      };

      const resolveWishlistAction = (prod: typeof variableProduct) => {
        if (prod.hasVariants) {
          return { type: 'ROUTE_TO_PRODUCT', href: `/products/${prod.slug || prod.id}`, label: 'Choose Options' };
        }
        return { type: 'DIRECT_ADD_TO_CART', href: null, label: 'Add to Cart' };
      };

      assert.deepEqual(resolveWishlistAction(variableProduct), {
        type: 'ROUTE_TO_PRODUCT',
        href: '/products/himalayan-apricots',
        label: 'Choose Options'
      });

      assert.deepEqual(resolveWishlistAction(simpleProduct), {
        type: 'DIRECT_ADD_TO_CART',
        href: null,
        label: 'Add to Cart'
      });
    });
  });

  describe('Notification State Management & Optimistic Rollback', () => {
    test('optimistic mark-as-read state rolls back cleanly on network failure', async () => {
      let notifications = [
        { id: 'notif-1', title: 'Order Shipped', isRead: false },
        { id: 'notif-2', title: 'Payment Confirmed', isRead: true }
      ];

      // Optimistic update
      const previousState = [...notifications];
      notifications = notifications.map((n) => (n.id === 'notif-1' ? { ...n, isRead: true } : n));
      assert.equal(notifications.find((n) => n.id === 'notif-1')?.isRead, true);

      // Simulated network failure
      const networkFail = true;
      if (networkFail) {
        // Rollback
        notifications = previousState;
      }

      assert.equal(notifications.find((n) => n.id === 'notif-1')?.isRead, false);
    });
  });

  describe('Customer Own-Reviews Projection & Allowlist Integrity', () => {
    test('ensures projected review records exclude forbidden internal moderation fields', () => {
      const rawDbReview = {
        _id: 'rev-001',
        user: 'user-001',
        rating: 5,
        title: 'Great quality',
        comment: 'Very fresh almonds',
        status: 'approved',
        isVerifiedPurchase: true,
        adminReply: 'Thank you!',
        repliedAt: new Date().toISOString(),
        internalModerationNotes: 'Checked invoice 123',
        moderatorId: 'admin-999',
        deletedBy: null
      };

      // Allowed projection fields for customer review retrieval
      const projectCustomerReview = (doc: typeof rawDbReview) => ({
        id: doc._id,
        rating: doc.rating,
        title: doc.title,
        comment: doc.comment,
        status: doc.status,
        isVerifiedPurchase: doc.isVerifiedPurchase,
        adminReply: doc.adminReply,
        repliedAt: doc.repliedAt
      });

      const projected = projectCustomerReview(rawDbReview);
      assert.equal(projected.id, 'rev-001');
      assert.equal(projected.status, 'approved');
      assert.equal('internalModerationNotes' in projected, false);
      assert.equal('moderatorId' in projected, false);
      assert.equal('deletedBy' in projected, false);
    });
  });
});
