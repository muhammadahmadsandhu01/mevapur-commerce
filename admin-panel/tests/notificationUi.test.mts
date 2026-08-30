import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  QUICK_CREATE_ACTIONS,
  formatNotificationTime,
  isCouponCreateRequested,
  notificationBadgeText,
  removeCouponCreateQuery,
  safeInternalActionUrl,
  toggleTopBarPopover,
  validateNotificationListEnvelope,
  validateNotificationStatsEnvelope,
  validateUnreadCountEnvelope
} from '../src/lib/notificationUi.ts';

const validNotification = {
  _id: 'notification-1',
  type: 'order',
  title: 'Order updated',
  message: 'The order status changed.',
  isRead: false,
  priority: 'medium',
  actionUrl: '/orders/order-1',
  createdAt: '2026-08-30T10:00:00.000Z'
};

test('empty notification responses stay empty and a zero unread count has no badge', () => {
  assert.deepEqual(validateNotificationListEnvelope({ success: true, data: [] }), []);
  assert.equal(validateUnreadCountEnvelope({ success: true, data: { count: 0 } }), 0);
  assert.deepEqual(validateNotificationStatsEnvelope({
    success: true,
    data: { totalNotifications: 0, unreadCount: 0, readCount: 0 }
  }), { totalNotifications: 0, unreadCount: 0, readCount: 0 });
  assert.equal(notificationBadgeText(0), null);
  assert.equal(notificationBadgeText(100), '99+');
  assert.equal(formatNotificationTime('not-a-date'), 'Date unavailable');
});

test('malformed notification list and statistics envelopes are rejected', () => {
  assert.equal(validateNotificationListEnvelope({ success: true, data: [{ ...validNotification, title: 42 }] }), null);
  assert.equal(validateUnreadCountEnvelope({ success: true, data: { count: '5' } }), null);
  assert.equal(validateNotificationStatsEnvelope({
    success: true,
    data: { totalNotifications: 2, unreadCount: 2, readCount: 1 }
  }), null);
});

test('only internal application action URLs are accepted', () => {
  assert.equal(safeInternalActionUrl('/orders/order-1?from=notifications'), '/orders/order-1?from=notifications');
  assert.equal(safeInternalActionUrl('https://example.test/orders/1'), null);
  assert.equal(safeInternalActionUrl('//example.test/orders/1'), null);
  assert.equal(safeInternalActionUrl('/\\example.test/orders/1'), null);
});

test('TopBar popovers are mutually exclusive and repeat activation closes the menu', () => {
  assert.equal(toggleTopBarPopover(null, 'notifications'), 'notifications');
  assert.equal(toggleTopBarPopover('notifications', 'quick-create'), 'quick-create');
  assert.equal(toggleTopBarPopover('quick-create', 'profile'), 'profile');
  assert.equal(toggleTopBarPopover('profile', 'profile'), null);
});

test('Quick Create exposes only real product and coupon workflows', () => {
  assert.deepEqual(QUICK_CREATE_ACTIONS, [
    { label: 'Add Product', href: '/products/add' },
    { label: 'Create Coupon', href: '/coupons?create=1' }
  ]);
  assert.equal(QUICK_CREATE_ACTIONS.some(({ href }) => ['/orders/new', '/customers/add', '/coupons/add'].includes(href)), false);
});

test('coupon create deep link is exact and closing removes only its query parameter', () => {
  assert.equal(isCouponCreateRequested('1'), true);
  assert.equal(isCouponCreateRequested('true'), false);
  assert.equal(removeCouponCreateQuery('create=1&status=active'), '/coupons?status=active');
  assert.equal(removeCouponCreateQuery('create=1'), '/coupons');
});

test('TopBar source contains no demo Messages records or removed Quick Create routes', async () => {
  const source = await readFile(new URL('../src/components/layout/TopBar.tsx', import.meta.url), 'utf8');
  for (const forbidden of [
    'Ahmed Khan',
    'Sara Malik',
    'Ali Raza',
    'View all messages',
    '/orders/new',
    '/customers/add',
    '/coupons/add'
  ]) {
    assert.equal(source.includes(forbidden), false, `TopBar still contains ${forbidden}`);
  }
});
