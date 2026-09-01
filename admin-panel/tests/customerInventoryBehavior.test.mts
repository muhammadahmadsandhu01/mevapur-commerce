import assert from 'node:assert/strict';
import test from 'node:test';

// Helper for status badge evaluation
function evaluateStockStatus(stock: number, threshold = 10): { status: 'out-of-stock' | 'low-stock' | 'in-stock'; label: string } {
  if (stock <= 0) {
    return { status: 'out-of-stock', label: 'Out of Stock' };
  }
  if (stock <= threshold) {
    return { status: 'low-stock', label: 'Low Stock' };
  }
  return { status: 'in-stock', label: 'In Stock' };
}

// Helper for inventory adjustment payload validation
function validateAdjustmentPayload(payload: {
  productId?: string;
  variantId?: string;
  type?: string;
  quantity?: number;
  reason?: string;
  operationKey?: string;
  hasVariants?: boolean;
}): { valid: boolean; error?: string } {
  if (!payload.productId) return { valid: false, error: 'Product ID is required' };
  if (!['in', 'out', 'adjustment'].includes(payload.type || '')) return { valid: false, error: 'Invalid adjustment type' };
  if (typeof payload.quantity !== 'number' || (payload.type !== 'adjustment' && payload.quantity < 1) || (payload.type === 'adjustment' && payload.quantity < 0)) {
    return { valid: false, error: 'Invalid quantity' };
  }
  if (!payload.reason || !payload.reason.trim()) return { valid: false, error: 'Reason is required' };
  if (!payload.operationKey || payload.operationKey.trim().length < 8) return { valid: false, error: 'Valid operationKey is required' };
  if (payload.hasVariants && !payload.variantId) return { valid: false, error: 'Variant ID is required for variable products' };
  if (!payload.hasVariants && payload.variantId) return { valid: false, error: 'Variant ID cannot be specified for simple products' };
  return { valid: true };
}

// Helper for customer-to-orders URL query generation
function buildOrdersUrlForCustomer(customerId: string): string {
  const params = new URLSearchParams();
  params.set('customer', customerId.trim());
  return `/orders?${params.toString()}`;
}

test('evaluateStockStatus correctly evaluates canonical threshold boundaries', () => {
  assert.deepEqual(evaluateStockStatus(0, 10), { status: 'out-of-stock', label: 'Out of Stock' });
  assert.deepEqual(evaluateStockStatus(-5, 10), { status: 'out-of-stock', label: 'Out of Stock' });
  assert.deepEqual(evaluateStockStatus(1, 10), { status: 'low-stock', label: 'Low Stock' });
  assert.deepEqual(evaluateStockStatus(10, 10), { status: 'low-stock', label: 'Low Stock' });
  assert.deepEqual(evaluateStockStatus(11, 10), { status: 'in-stock', label: 'In Stock' });
  assert.deepEqual(evaluateStockStatus(50, 15), { status: 'in-stock', label: 'In Stock' });
  assert.deepEqual(evaluateStockStatus(15, 15), { status: 'low-stock', label: 'Low Stock' });
});

test('validateAdjustmentPayload enforces single writer integrity rules', () => {
  // Valid simple product adjustment
  const validSimple = validateAdjustmentPayload({
    productId: '665000000000000000000001',
    type: 'in',
    quantity: 10,
    reason: 'Restocked by admin',
    operationKey: '00000000-0000-0000-0000-000000000001',
    hasVariants: false
  });
  assert.equal(validSimple.valid, true);

  // Invalid: passing variantId to simple product
  const invalidSimpleVariant = validateAdjustmentPayload({
    productId: '665000000000000000000001',
    variantId: '665000000000000000000002',
    type: 'in',
    quantity: 10,
    reason: 'Restocked by admin',
    operationKey: '00000000-0000-0000-0000-000000000001',
    hasVariants: false
  });
  assert.equal(invalidSimpleVariant.valid, false);
  assert.match(invalidSimpleVariant.error || '', /simple products/i);

  // Invalid: missing variantId on variable product
  const invalidVariableNoVariant = validateAdjustmentPayload({
    productId: '665000000000000000000001',
    type: 'in',
    quantity: 10,
    reason: 'Restocked by admin',
    operationKey: '00000000-0000-0000-0000-000000000001',
    hasVariants: true
  });
  assert.equal(invalidVariableNoVariant.valid, false);
  assert.match(invalidVariableNoVariant.error || '', /Variant ID is required/i);

  // Invalid: missing reason
  const invalidReason = validateAdjustmentPayload({
    productId: '665000000000000000000001',
    type: 'in',
    quantity: 10,
    reason: '  ',
    operationKey: '00000000-0000-0000-0000-000000000001',
    hasVariants: false
  });
  assert.equal(invalidReason.valid, false);
  assert.match(invalidReason.error || '', /Reason is required/i);

  // Invalid: missing operationKey
  const invalidKey = validateAdjustmentPayload({
    productId: '665000000000000000000001',
    type: 'in',
    quantity: 10,
    reason: 'Valid reason',
    operationKey: '',
    hasVariants: false
  });
  assert.equal(invalidKey.valid, false);
  assert.match(invalidKey.error || '', /operationKey is required/i);
});

test('buildOrdersUrlForCustomer formats clean customer query parameters', () => {
  const url = buildOrdersUrlForCustomer('665000000000000000000099');
  assert.equal(url, '/orders?customer=665000000000000000000099');
});
