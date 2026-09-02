import assert from 'node:assert/strict';
import test from 'node:test';

// 1. Review status derivation helper
function getReviewStatusBadge(review: {
  status?: 'pending' | 'approved' | 'rejected' | 'flagged' | 'withdrawn';
  isApproved?: boolean;
  isFlagged?: boolean;
}) {
  const status = review.status || (review.isFlagged ? 'flagged' : review.isApproved ? 'approved' : 'pending');
  switch (status) {
    case 'approved':
      return { text: 'Approved', status: 'approved' };
    case 'rejected':
      return { text: 'Rejected', status: 'rejected' };
    case 'flagged':
      return { text: 'Flagged', status: 'flagged' };
    case 'withdrawn':
      return { text: 'Withdrawn', status: 'withdrawn' };
    case 'pending':
    default:
      return { text: 'Pending', status: 'pending' };
  }
}

// 2. Coupon derived display status helper
function deriveCouponStatus(coupon: {
  status?: 'draft' | 'active' | 'disabled' | 'archived';
  startDate: string | Date;
  endDate: string | Date;
  usageLimit?: number;
  usedCount?: number;
}, now = new Date()) {
  if (coupon.status === 'draft') return 'draft';
  if (coupon.status === 'disabled') return 'disabled';
  if (coupon.status === 'archived') return 'archived';

  const start = new Date(coupon.startDate);
  const end = new Date(coupon.endDate);
  const limit = coupon.usageLimit || 0;
  const used = coupon.usedCount || 0;

  if (now < start) return 'upcoming';
  if (now > end) return 'expired';
  if (limit > 0 && used >= limit) return 'exhausted';
  return 'active';
}

// 3. Permission checks helper
function getRoleCapabilities(role: string) {
  return {
    canViewReviews: ['support', 'manager', 'admin', 'super_admin'].includes(role),
    canModerateReviews: ['manager', 'admin', 'super_admin'].includes(role),
    canDeleteReviews: ['admin', 'super_admin'].includes(role),
    canExceptionalErase: role === 'super_admin',
    canViewCoupons: ['support', 'manager', 'admin', 'super_admin'].includes(role),
    canManageCoupons: ['manager', 'admin', 'super_admin'].includes(role),
    canDeleteDraftCoupons: role === 'super_admin',
    canViewActivityLogs: ['manager', 'admin', 'super_admin'].includes(role),
    canExportActivityLogs: ['admin', 'super_admin'].includes(role)
  };
}

// 4. Coupon validation helper for UI forms
function validateCouponFormData(data: {
  code?: string;
  type?: string;
  value?: number;
  startDate?: string;
  endDate?: string;
}) {
  if (!data.code || !data.code.trim()) return { valid: false, error: 'Coupon code is required' };
  if (!['percentage', 'fixed'].includes(data.type || '')) {
    return { valid: false, error: 'Invalid coupon type. Free shipping is currently unsupported in Admin UI.' };
  }
  if (typeof data.value !== 'number' || data.value <= 0) return { valid: false, error: 'Value must be greater than 0' };
  if (!data.startDate || !data.endDate) return { valid: false, error: 'Start and end dates are required' };
  if (new Date(data.startDate) > new Date(data.endDate)) return { valid: false, error: 'Start date cannot be after end date' };
  return { valid: true };
}

test('getReviewStatusBadge accurately reflects canonical review statuses', () => {
  assert.deepEqual(getReviewStatusBadge({ status: 'pending' }), { text: 'Pending', status: 'pending' });
  assert.deepEqual(getReviewStatusBadge({ status: 'approved' }), { text: 'Approved', status: 'approved' });
  assert.deepEqual(getReviewStatusBadge({ status: 'rejected' }), { text: 'Rejected', status: 'rejected' });
  assert.deepEqual(getReviewStatusBadge({ status: 'flagged' }), { text: 'Flagged', status: 'flagged' });
  assert.deepEqual(getReviewStatusBadge({ status: 'withdrawn' }), { text: 'Withdrawn', status: 'withdrawn' });

  // Legacy fallback resolution
  assert.deepEqual(getReviewStatusBadge({ isApproved: true, isFlagged: false }), { text: 'Approved', status: 'approved' });
  assert.deepEqual(getReviewStatusBadge({ isApproved: false, isFlagged: true }), { text: 'Flagged', status: 'flagged' });
  assert.deepEqual(getReviewStatusBadge({ isApproved: false, isFlagged: false }), { text: 'Pending', status: 'pending' });
});

test('deriveCouponStatus handles date boundaries and limit exhaustion', () => {
  const fixedNow = new Date('2026-06-15T12:00:00Z');

  // Active coupon
  assert.equal(deriveCouponStatus({
    status: 'active',
    startDate: '2026-06-01T00:00:00Z',
    endDate: '2026-06-30T00:00:00Z',
    usageLimit: 100,
    usedCount: 10
  }, fixedNow), 'active');

  // Upcoming coupon
  assert.equal(deriveCouponStatus({
    status: 'active',
    startDate: '2026-07-01T00:00:00Z',
    endDate: '2026-07-31T00:00:00Z'
  }, fixedNow), 'upcoming');

  // Expired coupon
  assert.equal(deriveCouponStatus({
    status: 'active',
    startDate: '2026-05-01T00:00:00Z',
    endDate: '2026-05-31T00:00:00Z'
  }, fixedNow), 'expired');

  // Exhausted coupon
  assert.equal(deriveCouponStatus({
    status: 'active',
    startDate: '2026-06-01T00:00:00Z',
    endDate: '2026-06-30T00:00:00Z',
    usageLimit: 50,
    usedCount: 50
  }, fixedNow), 'exhausted');

  // Administrative overrides
  assert.equal(deriveCouponStatus({
    status: 'disabled',
    startDate: '2026-06-01T00:00:00Z',
    endDate: '2026-06-30T00:00:00Z'
  }, fixedNow), 'disabled');

  assert.equal(deriveCouponStatus({
    status: 'archived',
    startDate: '2026-06-01T00:00:00Z',
    endDate: '2026-06-30T00:00:00Z'
  }, fixedNow), 'archived');
});

test('getRoleCapabilities enforces approved role authorization matrix', () => {
  const supportCaps = getRoleCapabilities('support');
  assert.equal(supportCaps.canViewReviews, true);
  assert.equal(supportCaps.canModerateReviews, false);
  assert.equal(supportCaps.canDeleteReviews, false);
  assert.equal(supportCaps.canViewActivityLogs, false);

  const managerCaps = getRoleCapabilities('manager');
  assert.equal(managerCaps.canViewReviews, true);
  assert.equal(managerCaps.canModerateReviews, true);
  assert.equal(managerCaps.canDeleteReviews, false);
  assert.equal(managerCaps.canViewActivityLogs, true);
  assert.equal(managerCaps.canExportActivityLogs, false);

  const adminCaps = getRoleCapabilities('admin');
  assert.equal(adminCaps.canViewReviews, true);
  assert.equal(adminCaps.canModerateReviews, true);
  assert.equal(adminCaps.canDeleteReviews, true);
  assert.equal(adminCaps.canExceptionalErase, false);
  assert.equal(adminCaps.canExportActivityLogs, true);

  const superAdminCaps = getRoleCapabilities('super_admin');
  assert.equal(superAdminCaps.canExceptionalErase, true);
  assert.equal(superAdminCaps.canDeleteDraftCoupons, true);
});

test('validateCouponFormData validates inputs and prevents unsupported freeshipping type', () => {
  const validPercentage = validateCouponFormData({
    code: 'DISCOUNT10',
    type: 'percentage',
    value: 10,
    startDate: '2026-06-01',
    endDate: '2026-06-30'
  });
  assert.equal(validPercentage.valid, true);

  const invalidFreeShipping = validateCouponFormData({
    code: 'FREESHIP',
    type: 'freeshipping',
    value: 100,
    startDate: '2026-06-01',
    endDate: '2026-06-30'
  });
  assert.equal(invalidFreeShipping.valid, false);
  assert.match(invalidFreeShipping.error || '', /Free shipping is currently unsupported/);

  const invertedDates = validateCouponFormData({
    code: 'DATES',
    type: 'fixed',
    value: 50,
    startDate: '2026-07-01',
    endDate: '2026-06-01'
  });
  assert.equal(invertedDates.valid, false);
  assert.match(invertedDates.error || '', /Start date cannot be after end date/);
});
