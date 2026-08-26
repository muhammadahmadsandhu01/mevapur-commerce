const { AppError } = require('../common/errors/AppError');

const MINOR_UNITS_PER_MAJOR = 100;

const allocationError = () => new AppError(
  'Order monetary snapshot is unavailable for return allocation',
  503,
  'RETURN_REFUND_STATE_UNAVAILABLE'
);

const toMinorUnits = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw allocationError();

  const minorUnits = Math.round(
    (amount + Number.EPSILON) * MINOR_UNITS_PER_MAJOR
  );
  if (!Number.isSafeInteger(minorUnits)) throw allocationError();
  return minorUnits;
};

const optionalMinorUnits = (value) => (
  value === undefined || value === null ? null : toMinorUnits(value)
);

const fromMinorUnits = (minorUnits) => {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw allocationError();
  }
  return minorUnits / MINOR_UNITS_PER_MAJOR;
};

const orderLineKey = (productId, variantId) => (
  `${String(productId)}:${variantId ? String(variantId) : 'root'}`
);

const lineGrossMinor = (item) => {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw allocationError();
  }

  const calculated = toMinorUnits(Number(item.price) * item.quantity);
  const storedLineTotal = optionalMinorUnits(item.lineTotal);

  // Current orders persist lineTotal. Legacy orders do not. If both stored
  // representations disagree, use the lower value so a malformed snapshot can
  // never expand the refundable merchandise pool.
  return storedLineTotal === null
    ? calculated
    : Math.min(calculated, storedLineTotal);
};

const proportionalAllocation = (lines, targetMinor) => {
  const grossMinor = lines.reduce((total, line) => total + line.grossMinor, 0);
  if (grossMinor === 0) {
    if (targetMinor !== 0) throw allocationError();
    return lines.map((line) => ({ ...line, refundableMinor: 0 }));
  }

  const grossBigInt = BigInt(grossMinor);
  const targetBigInt = BigInt(targetMinor);
  const allocated = lines.map((line) => {
    const numerator = targetBigInt * BigInt(line.grossMinor);
    return {
      ...line,
      refundableMinor: Number(numerator / grossBigInt),
      remainder: numerator % grossBigInt
    };
  });
  const floorTotal = allocated.reduce(
    (total, line) => total + line.refundableMinor,
    0
  );
  const remainderUnits = targetMinor - floorTotal;
  const ranked = [...allocated].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.stableKey.localeCompare(right.stableKey);
  });

  for (let index = 0; index < remainderUnits; index += 1) {
    ranked[index].refundableMinor += 1;
  }

  return allocated.map(({ remainder, ...line }) => line);
};

const allocateOrderMerchandise = (order) => {
  if (!Array.isArray(order?.items) || order.items.length === 0) {
    throw allocationError();
  }

  const lines = order.items.map((item, index) => {
    const canonicalKey = orderLineKey(item.product, item.variantId);
    return {
      item,
      index,
      canonicalKey,
      stableKey: `${canonicalKey}:${String(item.sku || '')}:${String(index).padStart(6, '0')}`,
      grossMinor: lineGrossMinor(item),
      quantity: item.quantity
    };
  });
  const grossMinor = lines.reduce((total, line) => total + line.grossMinor, 0);

  const storedSubtotal = optionalMinorUnits(order.subtotal);
  const authoritativeSubtotal = Math.min(
    grossMinor,
    storedSubtotal === null ? grossMinor : storedSubtotal
  );
  const discountCandidates = [
    optionalMinorUnits(order.discount),
    optionalMinorUnits(order.coupon?.discountAmount)
  ].filter((value) => value !== null);
  const discountMinor = Math.min(
    authoritativeSubtotal,
    discountCandidates.length > 0 ? Math.max(...discountCandidates) : 0
  );
  let allocatableMinor = authoritativeSubtotal - discountMinor;

  const storedTotal = optionalMinorUnits(order.totalAmount);
  if (storedTotal !== null) {
    const shippingMinor = optionalMinorUnits(order.shippingCost) || 0;
    const taxMinor = optionalMinorUnits(order.taxAmount) || 0;
    const merchandisePaidMinor = Math.max(
      0,
      storedTotal - shippingMinor - taxMinor
    );
    allocatableMinor = Math.min(allocatableMinor, merchandisePaidMinor);
  }

  return {
    grossMinor,
    discountMinor,
    allocatableMinor,
    lines: proportionalAllocation(lines, allocatableMinor)
  };
};

const amountForQuantityRange = (line, startQuantity, quantity) => {
  if (
    !Number.isInteger(startQuantity)
    || startQuantity < 0
    || !Number.isInteger(quantity)
    || quantity < 0
    || startQuantity + quantity > line.quantity
  ) {
    throw allocationError();
  }

  const baseMinor = Math.floor(line.refundableMinor / line.quantity);
  const remainderUnits = line.refundableMinor % line.quantity;
  const prefixAmount = (count) => (
    (baseMinor * count) + Math.min(count, remainderUnits)
  );

  return prefixAmount(startQuantity + quantity) - prefixAmount(startQuantity);
};

module.exports = {
  allocateOrderMerchandise,
  amountForQuantityRange,
  fromMinorUnits,
  orderLineKey,
  toMinorUnits
};
