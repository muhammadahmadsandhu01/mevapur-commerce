const {
  allocateOrderMerchandise,
  amountForQuantityRange,
  fromMinorUnits
} = require('../../../services/ReturnMoneyAllocationService');

const line = (product, price, quantity = 1, extra = {}) => ({
  product,
  price,
  quantity,
  lineTotal: price * quantity,
  ...extra
});

const amountsByProduct = (allocation) => Object.fromEntries(
  allocation.lines.map((entry) => [
    String(entry.item.product),
    fromMinorUnits(entry.refundableMinor)
  ])
);

describe('ReturnMoneyAllocationService', () => {
  test('allocates two Rs.100 lines against a Rs.50 discount exactly', () => {
    const allocation = allocateOrderMerchandise({
      items: [line('product-a', 100), line('product-b', 100)],
      subtotal: 200,
      discount: 50,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 150
    });

    expect(allocation.allocatableMinor).toBe(15000);
    expect(amountsByProduct(allocation)).toEqual({
      'product-a': 75,
      'product-b': 75
    });
  });

  test('assigns indivisible remainder cents by stable identity, not array order', () => {
    const monetarySnapshot = {
      subtotal: 200,
      discount: 33.33,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 166.67
    };
    const forward = allocateOrderMerchandise({
      ...monetarySnapshot,
      items: [line('product-a', 100), line('product-b', 100)]
    });
    const reversed = allocateOrderMerchandise({
      ...monetarySnapshot,
      items: [line('product-b', 100), line('product-a', 100)]
    });

    expect(amountsByProduct(forward)).toEqual({
      'product-a': 83.34,
      'product-b': 83.33
    });
    expect(amountsByProduct(reversed)).toEqual(amountsByProduct(forward));
    expect(forward.lines.reduce(
      (sum, entry) => sum + entry.refundableMinor,
      0
    )).toBe(16667);
  });

  test('allocates partial quantities without losing or creating a cent', () => {
    const allocation = allocateOrderMerchandise({
      items: [line('product-a', 100, 3)],
      subtotal: 300,
      discount: 100,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 200
    });
    const allocatedLine = allocation.lines[0];

    expect([0, 1, 2].map((start) => fromMinorUnits(
      amountForQuantityRange(allocatedLine, start, 1)
    ))).toEqual([66.67, 66.67, 66.66]);
    expect(amountForQuantityRange(allocatedLine, 0, 3)).toBe(20000);
  });

  test('keeps zero-discount line behavior and excludes shipping and tax', () => {
    const allocation = allocateOrderMerchandise({
      items: [line('product-a', 125, 2)],
      subtotal: 250,
      discount: 0,
      shippingCost: 25,
      taxAmount: 10,
      totalAmount: 285
    });

    expect(allocation.allocatableMinor).toBe(25000);
    expect(allocation.lines[0].refundableMinor).toBe(25000);
  });

  test('supports a legacy line without lineTotal and fails closed on lower totals', () => {
    const allocation = allocateOrderMerchandise({
      items: [{ product: 'product-a', price: 100, quantity: 2 }],
      subtotal: 200,
      discount: 25,
      shippingCost: 10,
      totalAmount: 160
    });

    expect(allocation.allocatableMinor).toBe(15000);
    expect(allocation.lines[0].refundableMinor).toBe(15000);
  });
});
