const { AppError } = require('../common/errors/AppError');
const {
  CurrencyRegistry,
  Money,
  MoneyMapper,
  ROUNDING_MODES,
  roundFraction
} = require('../modules/commerce');

const allocationError = (message = 'Order monetary snapshot is unavailable for return allocation', code = 'RETURN_REFUND_STATE_UNAVAILABLE', statusCode = 503) => (
  new AppError(message, statusCode, code)
);

const resolveOrderCurrency = (order) => {
  const code = order?.currency
    || order?.totalAmountExact?.currency
    || order?.subtotalExact?.currency
    || order?.payment?.currency
    || order?.paymentInfo?.currency
    || order?.taxesAndDuties?.taxAmountExact?.currency
    || order?.taxSnapshot?.currency
    || order?.customsSnapshot?.currency;
  if (!code) {
    throw allocationError('Order currency is required for return allocation', 'REFUND_CURRENCY_REQUIRED', 400);
  }
  try {
    const meta = CurrencyRegistry.getCurrency(code, { allowDeprecated: true, allowNonCommercial: true });
    return meta.code;
  } catch {
    throw allocationError(`Invalid order currency: '${code}'`, 'REFUND_CURRENCY_REQUIRED', 400);
  }
};

/**
 * Canonical exact minor unit parser.
 * Rejects unsafe JavaScript Numbers, invalid strings, decimals, negatives, and >18-digit numbers.
 * Supports Mongoose Decimal128 instances seamlessly.
 * @param {Money|Object|string|number|bigint} value
 * @param {string} [expectedCurrency]
 * @param {number} [expectedExponent]
 * @returns {bigint}
 */
const toBigIntMinorExact = (value, expectedCurrency = null, expectedExponent = null) => {
  if (value === undefined || value === null) return 0n;
  if (typeof value === 'bigint') {
    if (value < 0n || value > 999999999999999999n) {
      throw allocationError('Monetary amountMinor exceeds maximum 18-digit boundary or is negative', 'EXACT_MONEY_OUT_OF_BOUNDS', 400);
    }
    return value;
  }

  if (value instanceof Money) {
    if (expectedCurrency && value.currency !== expectedCurrency) {
      throw allocationError(`Currency mismatch: expected ${expectedCurrency} but got ${value.currency}`, 'CURRENCY_MISMATCH', 400);
    }
    if (expectedExponent !== null && expectedExponent !== undefined && value.exponent !== expectedExponent) {
      throw allocationError(`Exponent mismatch: expected ${expectedExponent} but got ${value.exponent}`, 'EXPONENT_MISMATCH', 400);
    }
    return value.amountMinor;
  }

  if (typeof value === 'object' && value !== null) {
    if (value.$numberDecimal !== undefined) {
      return toBigIntMinorExact(String(value.$numberDecimal), expectedCurrency, expectedExponent);
    }
    if (value.amountMinor !== undefined) {
      if (expectedCurrency && value.currency && value.currency !== expectedCurrency) {
        throw allocationError(`Currency mismatch: expected ${expectedCurrency} but got ${value.currency}`, 'CURRENCY_MISMATCH', 400);
      }
      if (expectedExponent !== null && expectedExponent !== undefined && value.exponent !== undefined && value.exponent !== expectedExponent) {
        throw allocationError(`Exponent mismatch: expected ${expectedExponent} but got ${value.exponent}`, 'EXPONENT_MISMATCH', 400);
      }
      const rawMinor = value.amountMinor;
      if (typeof rawMinor === 'object' && rawMinor !== null) {
        if (rawMinor.$numberDecimal !== undefined) {
          return toBigIntMinorExact(String(rawMinor.$numberDecimal), null, null);
        }
        if (typeof rawMinor.toString === 'function' && (rawMinor._bsontype === 'Decimal128' || (rawMinor.constructor && rawMinor.constructor.name === 'Decimal128'))) {
          return toBigIntMinorExact(rawMinor.toString(), null, null);
        }
      }
      return toBigIntMinorExact(rawMinor, null, null);
    }
    if (typeof value.toString === 'function' && (value._bsontype === 'Decimal128' || (value.constructor && value.constructor.name === 'Decimal128'))) {
      return toBigIntMinorExact(value.toString(), expectedCurrency, expectedExponent);
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^(0|[1-9][0-9]{0,17})$/.test(trimmed)) {
      if (trimmed.length > 18 && /^[0-9]+$/.test(trimmed)) {
        throw allocationError('Monetary amountMinor exceeds 18-digit boundary', 'EXACT_MONEY_OUT_OF_BOUNDS', 400);
      }
      throw allocationError(`Invalid monetary amountMinor string: '${value}'`, 'INVALID_MONEY_AMOUNT_MINOR', 400);
    }
    return BigInt(trimmed);
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw allocationError(`Unsafe or non-integer numeric amountMinor: ${value}`, 'INVALID_MONEY_AMOUNT_MINOR', 400);
    }
    if (value > 9007199254740991) {
      throw allocationError(`Unsafe numeric amountMinor exceeds MAX_SAFE_INTEGER: ${value}`, 'EXACT_MONEY_OUT_OF_BOUNDS', 400);
    }
    return BigInt(value);
  }

  throw allocationError(`Unsupported monetary representation: ${typeof value}`, 'INVALID_MONEY_REPRESENTATION', 400);
};

const toBigIntMinor = (value, currency = null, exponent = null) => toBigIntMinorExact(value, currency, exponent);

/**
 * Isolated legacy compatibility boundary for reading legacy decimal Number fields.
 * NEVER overrides an exact snapshot.
 * Rejects non-finite, negative, or unsafe numbers.
 * @param {number|undefined|null} decimalNumber
 * @param {string} currency
 * @returns {bigint|null}
 */
const parseLegacyDecimalToMinorUnits = (decimalNumber, currency) => {
  if (decimalNumber === undefined || decimalNumber === null) return null;
  if (typeof decimalNumber !== 'number' || !Number.isFinite(decimalNumber) || decimalNumber < 0) {
    throw allocationError('Invalid historical legacy decimal number', 'INVALID_LEGACY_MONEY_VALUE', 400);
  }
  if (!currency) {
    throw allocationError('Currency is required to parse legacy decimal number', 'REFUND_CURRENCY_REQUIRED', 400);
  }
  const money = Money.fromLegacyNumber(decimalNumber, currency);
  return money.amountMinor;
};

const optionalBigIntMinor = (value, currency = null) => (
  value === undefined || value === null ? null : toBigIntMinorExact(value, currency)
);

const toMinorUnits = (value, currency = null) => {
  const minor = toBigIntMinorExact(value, currency);
  return Number(minor);
};

/**
 * Display/test-only adapter. Converts minor units to a floating-point JavaScript Number.
 * NEVER use in financial authority, database persistence, or provider payload execution.
 * @param {bigint|number|string} minorUnits
 * @param {string} currency
 * @returns {number}
 */
const fromMinorUnitsDisplayOnly = (minorUnits, currency) => {
  if (!currency) {
    throw allocationError('Currency is required for display formatting', 'REFUND_CURRENCY_REQUIRED', 400);
  }
  const minor = typeof minorUnits === 'bigint' ? minorUnits : toBigIntMinorExact(minorUnits);
  const money = Money.fromMinor(minor, currency);
  return Number(money.toDecimalString());
};

const fromMinorUnits = (minorUnits, currency) => fromMinorUnitsDisplayOnly(minorUnits, currency);

const orderLineKey = (productId, variantId) => (
  `${String(productId)}:${variantId ? String(variantId) : 'root'}`
);

const lineGrossMinorExact = (item, currency) => {
  if (!currency) {
    throw allocationError('Currency is required for line gross calculation', 'REFUND_CURRENCY_REQUIRED', 400);
  }
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw allocationError('Item quantity must be a positive integer', 'CUSTOMER_RETURN_NOT_ELIGIBLE', 400);
  }

  let unitPriceMinor;
  if (item.priceExact) {
    unitPriceMinor = toBigIntMinorExact(item.priceExact, currency);
  } else if (item.unitPriceExact) {
    unitPriceMinor = toBigIntMinorExact(item.unitPriceExact, currency);
  } else if (item.price !== undefined && item.price !== null) {
    unitPriceMinor = parseLegacyDecimalToMinorUnits(item.price, currency);
  } else {
    throw allocationError('Item unit price is unavailable for return allocation', 'RETURN_REFUND_STATE_UNAVAILABLE', 503);
  }

  const calculatedMinor = unitPriceMinor * BigInt(item.quantity);
  const storedLineTotalMinor = item.lineTotalExact
    ? toBigIntMinorExact(item.lineTotalExact, currency)
    : parseLegacyDecimalToMinorUnits(item.lineTotal, currency);

  if (storedLineTotalMinor === null) {
    return calculatedMinor;
  }
  return calculatedMinor < storedLineTotalMinor ? calculatedMinor : storedLineTotalMinor;
};

/**
 * Deterministic Proportional Allocation using BigInt floor division and stable remainder distribution.
 */
const proportionalAllocationExact = (lines, targetMinorBigInt) => {
  const totalGrossMinor = lines.reduce((total, line) => total + line.grossMinor, 0n);
  if (totalGrossMinor === 0n) {
    if (targetMinorBigInt !== 0n) throw allocationError();
    return lines.map((line) => ({
      ...line,
      allocatedMinor: 0n,
      refundableMinor: 0
    }));
  }

  const allocated = lines.map((line) => {
    const numerator = targetMinorBigInt * line.grossMinor;
    const quotient = numerator / totalGrossMinor;
    const remainder = numerator % totalGrossMinor;
    return {
      ...line,
      allocatedMinor: quotient,
      remainder
    };
  });

  const floorTotal = allocated.reduce((sum, line) => sum + line.allocatedMinor, 0n);
  const remainderUnits = Number(targetMinorBigInt - floorTotal);

  const ranked = [...allocated].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.stableKey.localeCompare(right.stableKey);
  });

  for (let index = 0; index < remainderUnits; index += 1) {
    ranked[index].allocatedMinor += 1n;
  }

  return allocated.map(({ remainder, ...line }) => ({
    ...line,
    refundableMinor: Number(line.allocatedMinor)
  }));
};

/**
 * Allocates order merchandise, discounts, taxes, and duties with strict financial governance.
 * Distinguishes between inclusive tax, exclusive tax, DDP payable duties, DAP estimated duties.
 */
const allocateOrderMerchandise = (order) => {
  if (!Array.isArray(order?.items) || order.items.length === 0) {
    throw allocationError('Order items are required for allocation');
  }

  const currency = resolveOrderCurrency(order);

  const lines = order.items.map((item, index) => {
    const canonicalKey = orderLineKey(item.product, item.variantId);
    const grossMinor = lineGrossMinorExact(item, currency);
    return {
      item,
      index,
      canonicalKey,
      stableKey: `${canonicalKey}:${String(item.sku || '')}:${String(index).padStart(6, '0')}`,
      grossMinor,
      quantity: item.quantity
    };
  });

  const totalGrossMinor = lines.reduce((sum, l) => sum + l.grossMinor, 0n);

  const storedSubtotalMinor = order.subtotalExact
    ? toBigIntMinorExact(order.subtotalExact, currency)
    : parseLegacyDecimalToMinorUnits(order.subtotal, currency);

  const authoritativeSubtotalMinor = storedSubtotalMinor === null
    ? totalGrossMinor
    : (totalGrossMinor < storedSubtotalMinor ? totalGrossMinor : storedSubtotalMinor);

  // Authoritative discount
  const discountCandidates = [];
  if (order.discountExact) {
    discountCandidates.push(toBigIntMinorExact(order.discountExact, currency));
  } else if (order.discount !== undefined && order.discount !== null) {
    const minor = parseLegacyDecimalToMinorUnits(order.discount, currency);
    if (minor !== null) discountCandidates.push(minor);
  }

  if (order.coupon?.discountAmountExact) {
    discountCandidates.push(toBigIntMinorExact(order.coupon.discountAmountExact, currency));
  } else if (order.coupon?.discountAmount !== undefined && order.coupon?.discountAmount !== null) {
    const minor = parseLegacyDecimalToMinorUnits(order.coupon.discountAmount, currency);
    if (minor !== null) discountCandidates.push(minor);
  }

  let maxDiscountMinor = 0n;
  for (const candidate of discountCandidates) {
    if (candidate > maxDiscountMinor) maxDiscountMinor = candidate;
  }
  const discountMinor = maxDiscountMinor < authoritativeSubtotalMinor ? maxDiscountMinor : authoritativeSubtotalMinor;
  let allocatableMerchandiseMinor = authoritativeSubtotalMinor - discountMinor;

  // Read taxes and duties snapshot
  const taxesAndDuties = order.taxesAndDuties || {};
  const taxTreatment = taxesAndDuties.taxTreatment
    || taxesAndDuties.provenance?.taxTreatment
    || (taxesAndDuties.taxIncludedAmount ? 'INCLUSIVE' : 'EXCLUSIVE');

  const incoterm = (taxesAndDuties.incoterm
    || taxesAndDuties.provenance?.incoterm
    || order.quote?.incoterm
    || 'DAP').toUpperCase();

  const taxRefundPolicy = (taxesAndDuties.provenance?.taxRefundPolicy
    || taxesAndDuties.taxRefundPolicy
    || null);

  const dutyRefundPolicy = (taxesAndDuties.provenance?.dutyRefundPolicy
    || taxesAndDuties.dutyRefundPolicy
    || null);

  // Included vs Additional Payable Tax
  const includedTaxMinor = taxesAndDuties.taxIncludedAmountExact
    ? toBigIntMinorExact(taxesAndDuties.taxIncludedAmountExact, currency)
    : (taxesAndDuties.taxIncludedAmount !== undefined
      ? parseLegacyDecimalToMinorUnits(taxesAndDuties.taxIncludedAmount, currency) || 0n
      : 0n);

  const additionalTaxMinor = taxesAndDuties.additionalTaxAmountExact
    ? toBigIntMinorExact(taxesAndDuties.additionalTaxAmountExact, currency)
    : (taxTreatment === 'EXCLUSIVE'
      ? (taxesAndDuties.taxAmountExact
        ? toBigIntMinorExact(taxesAndDuties.taxAmountExact, currency)
        : (order.taxAmount !== undefined
          ? parseLegacyDecimalToMinorUnits(order.taxAmount, currency) || 0n
          : 0n))
      : 0n);

  const totalAssessedTaxMinor = taxesAndDuties.taxAmountExact
    ? toBigIntMinorExact(taxesAndDuties.taxAmountExact, currency)
    : (order.taxAmount !== undefined
      ? parseLegacyDecimalToMinorUnits(order.taxAmount, currency) || 0n
      : 0n);

  // Duty components: Payable (DDP) vs Estimated (DAP)
  const payableDutyMinor = taxesAndDuties.payableDutyExact
    ? toBigIntMinorExact(taxesAndDuties.payableDutyExact, currency)
    : (incoterm === 'DDP'
      ? (order.dutiesExact
        ? toBigIntMinorExact(order.dutiesExact, currency)
        : (taxesAndDuties.payableDutyAmount !== undefined
          ? parseLegacyDecimalToMinorUnits(taxesAndDuties.payableDutyAmount, currency) || 0n
          : (order.duties !== undefined ? parseLegacyDecimalToMinorUnits(order.duties, currency) || 0n : 0n)))
      : 0n);

  const estimatedDutyMinor = taxesAndDuties.estimatedDutyExact
    ? toBigIntMinorExact(taxesAndDuties.estimatedDutyExact, currency)
    : (taxesAndDuties.estimatedDutyAmount !== undefined
      ? parseLegacyDecimalToMinorUnits(taxesAndDuties.estimatedDutyAmount, currency) || 0n
      : 0n);

  const shippingMinor = order.shippingCostExact
    ? toBigIntMinorExact(order.shippingCostExact, currency)
    : (order.shippingCost !== undefined
      ? parseLegacyDecimalToMinorUnits(order.shippingCost, currency) || 0n
      : 0n);

  // Validate merchandise paid bounds without leaking duties
  const storedTotalMinor = order.totalAmountExact
    ? toBigIntMinorExact(order.totalAmountExact, currency)
    : (order.totalAmount !== undefined
      ? parseLegacyDecimalToMinorUnits(order.totalAmount, currency)
      : null);

  if (storedTotalMinor !== null) {
    const nonMerchandiseChargesMinor = shippingMinor + additionalTaxMinor + payableDutyMinor;
    const merchandisePaidMinor = storedTotalMinor > nonMerchandiseChargesMinor
      ? storedTotalMinor - nonMerchandiseChargesMinor
      : 0n;
    if (merchandisePaidMinor < allocatableMerchandiseMinor) {
      allocatableMerchandiseMinor = merchandisePaidMinor;
    }
  }

  // Allocate merchandise net across order lines
  const allocatedLines = proportionalAllocationExact(lines, allocatableMerchandiseMinor);

  // Allocate discounts across lines
  const discountAllocatedLines = proportionalAllocationExact(lines, discountMinor);

  // Allocate inclusive tax across lines
  const includedTaxAllocatedLines = proportionalAllocationExact(lines, includedTaxMinor);

  // Allocate additional payable tax across lines
  const additionalTaxAllocatedLines = proportionalAllocationExact(lines, additionalTaxMinor);

  // Allocate payable duty across lines (DDP)
  const payableDutyAllocatedLines = proportionalAllocationExact(lines, payableDutyMinor);

  // Allocate estimated duty across lines (DAP)
  const estimatedDutyAllocatedLines = proportionalAllocationExact(lines, estimatedDutyMinor);

  const combinedLines = allocatedLines.map((line, idx) => {
    const lineDiscountMinor = discountAllocatedLines[idx].allocatedMinor;
    const lineIncludedTaxMinor = includedTaxAllocatedLines[idx].allocatedMinor;
    const lineAdditionalTaxMinor = additionalTaxAllocatedLines[idx].allocatedMinor;
    const linePayableDutyMinor = payableDutyAllocatedLines[idx].allocatedMinor;
    const lineEstimatedDutyMinor = estimatedDutyAllocatedLines[idx].allocatedMinor;

    return {
      ...line,
      discountMinor: Number(lineDiscountMinor),
      discountMinorExact: lineDiscountMinor,
      merchandiseNetMinor: line.allocatedMinor,
      includedTaxMinor: Number(lineIncludedTaxMinor),
      includedTaxMinorExact: lineIncludedTaxMinor,
      additionalTaxMinor: Number(lineAdditionalTaxMinor),
      additionalTaxMinorExact: lineAdditionalTaxMinor,
      payableDutyMinor: Number(linePayableDutyMinor),
      payableDutyMinorExact: linePayableDutyMinor,
      estimatedDutyMinor: Number(lineEstimatedDutyMinor),
      estimatedDutyMinorExact: lineEstimatedDutyMinor
    };
  });

  return {
    currency,
    grossMinor: Number(totalGrossMinor),
    grossMinorExact: totalGrossMinor,
    discountMinor: Number(discountMinor),
    discountMinorExact: discountMinor,
    allocatableMinor: Number(allocatableMerchandiseMinor),
    allocatableMinorExact: allocatableMerchandiseMinor,
    merchandiseNetMinor: Number(allocatableMerchandiseMinor),
    merchandiseNetMinorExact: allocatableMerchandiseMinor,

    // Tax & Duty metadata
    taxTreatment,
    incoterm,
    taxRefundPolicy,
    dutyRefundPolicy,
    totalAssessedTaxMinor: Number(totalAssessedTaxMinor),
    totalAssessedTaxMinorExact: totalAssessedTaxMinor,
    includedTaxMinor: Number(includedTaxMinor),
    includedTaxMinorExact: includedTaxMinor,
    additionalTaxMinor: Number(additionalTaxMinor),
    additionalTaxMinorExact: additionalTaxMinor,
    payableDutyMinor: Number(payableDutyMinor),
    payableDutyMinorExact: payableDutyMinor,
    estimatedDutyMinor: Number(estimatedDutyMinor),
    estimatedDutyMinorExact: estimatedDutyMinor,
    shippingMinor: Number(shippingMinor),
    shippingMinorExact: shippingMinor,

    lines: combinedLines
  };
};

/**
 * Calculates line-level amount for a specific quantity range of an allocated line.
 */
const amountForQuantityRange = (line, startQuantity, quantity) => {
  if (
    !Number.isInteger(startQuantity)
    || startQuantity < 0
    || !Number.isInteger(quantity)
    || quantity < 0
    || startQuantity + quantity > line.quantity
  ) {
    throw allocationError('Quantity range is out of bounds for the line', 'CUSTOMER_RETURN_NOT_ELIGIBLE', 400);
  }

  const lineTotalMinor = line.allocatedMinor !== undefined ? BigInt(line.allocatedMinor) : BigInt(line.refundableMinor);
  const lineQty = BigInt(line.quantity);

  const baseMinor = lineTotalMinor / lineQty;
  const remainderUnits = Number(lineTotalMinor % lineQty);

  const prefixAmount = (count) => {
    const c = BigInt(count);
    const rem = BigInt(Math.min(count, remainderUnits));
    return (baseMinor * c) + rem;
  };

  const rangeMinor = prefixAmount(startQuantity + quantity) - prefixAmount(startQuantity);
  return Number(rangeMinor);
};

const amountMinorExactForQuantityRange = (totalMinorBigInt, lineQuantity, startQuantity, quantity) => {
  if (
    !Number.isInteger(startQuantity)
    || startQuantity < 0
    || !Number.isInteger(quantity)
    || quantity < 0
    || startQuantity + quantity > lineQuantity
  ) {
    throw allocationError('Quantity range is out of bounds for the line', 'CUSTOMER_RETURN_NOT_ELIGIBLE', 400);
  }

  const lineTotal = BigInt(totalMinorBigInt);
  const lineQty = BigInt(lineQuantity);

  const base = lineTotal / lineQty;
  const remainder = Number(lineTotal % lineQty);

  const prefix = (count) => {
    const c = BigInt(count);
    const rem = BigInt(Math.min(count, remainder));
    return (base * c) + rem;
  };

  return prefix(startQuantity + quantity) - prefix(startQuantity);
};

/**
 * Computes exact return refund breakdown (merchandise, tax, duty) based on authoritative order policy.
 */
const calculateReturnAllocation = (order, returnItems, priorReturns = []) => {
  const allocation = allocateOrderMerchandise(order);
  const currency = allocation.currency;

  let totalMerchandiseRefundMinor = 0n;
  let totalTaxRefundMinor = 0n;
  let totalDutyRefundMinor = 0n;
  let totalIncludedTaxMinor = 0n;

  const orderHasNonZeroTax = allocation.totalAssessedTaxMinorExact > 0n || allocation.additionalTaxMinorExact > 0n;
  const orderHasNonZeroDuty = allocation.payableDutyMinorExact > 0n;

  // Check policy requirement on non-zero tax / duties
  if (orderHasNonZeroTax && !allocation.taxRefundPolicy) {
    throw allocationError(
      'Governed tax refund policy snapshot is required for order with tax reversal',
      'GOVERNED_TAX_POLICY_SNAPSHOT_REQUIRED',
      409
    );
  }

  if (orderHasNonZeroDuty && !allocation.dutyRefundPolicy) {
    throw allocationError(
      'Governed duty refund policy snapshot is required for order with duty reversal',
      'GOVERNED_DUTY_POLICY_SNAPSHOT_REQUIRED',
      409
    );
  }

  if (allocation.taxRefundPolicy === 'MANUAL_REVIEW') {
    throw allocationError(
      'Tax refund requires manual review for this order',
      'TAX_REFUND_MANUAL_REVIEW_REQUIRED',
      409
    );
  }

  if (allocation.dutyRefundPolicy === 'MANUAL_REVIEW') {
    throw allocationError(
      'Customs duty refund requires manual review for this order',
      'DUTY_REFUND_MANUAL_REVIEW_REQUIRED',
      409
    );
  }

  const itemAllocations = returnItems.map((reqItem) => {
    const allocatedLine = allocation.lines.find(
      (l) => l.canonicalKey === reqItem.orderLineKey
    );
    if (!allocatedLine) {
      throw allocationError('Order monetary snapshot is unavailable for return item', 'RETURN_REFUND_STATE_UNAVAILABLE', 503);
    }

    const startQty = reqItem.priorQuantity || 0;
    const returnQty = reqItem.quantity;

    // 1. Merchandise Net Refund
    const lineMerchandiseRefundMinor = amountMinorExactForQuantityRange(
      allocatedLine.merchandiseNetMinor,
      allocatedLine.quantity,
      startQty,
      returnQty
    );
    totalMerchandiseRefundMinor += lineMerchandiseRefundMinor;

    // 2. Included Tax portion (for accounting/audit reporting; not added to customer refund on top)
    const lineIncludedTaxMinor = amountMinorExactForQuantityRange(
      allocatedLine.includedTaxMinorExact,
      allocatedLine.quantity,
      startQty,
      returnQty
    );
    totalIncludedTaxMinor += lineIncludedTaxMinor;

    // 3. Additional Payable Tax Refund (Exclusive Tax)
    let lineTaxRefundMinor = 0n;
    if (allocation.taxRefundPolicy === 'REFUNDABLE') {
      // In REFUNDABLE policy: if item-level tax allocation exists on the order line (e.g. item.taxAmountExact),
      // refund the tax directly attributable to the returned line/quantity.
      if (reqItem.taxAmountExact) {
        const itemAssignedTax = toBigIntMinorExact(reqItem.taxAmountExact, currency);
        lineTaxRefundMinor = amountMinorExactForQuantityRange(
          itemAssignedTax,
          allocatedLine.quantity,
          startQty,
          returnQty
        );
      } else {
        // Fall back to line's proportional share of payable tax
        lineTaxRefundMinor = amountMinorExactForQuantityRange(
          allocatedLine.additionalTaxMinorExact,
          allocatedLine.quantity,
          startQty,
          returnQty
        );
      }
      totalTaxRefundMinor += lineTaxRefundMinor;
    } else if (allocation.taxRefundPolicy === 'PROPORTIONAL') {
      // In PROPORTIONAL policy: tax is allocated pro-rata from the order-level collected payable tax
      // based on returned merchandise net relative to total order merchandise net.
      lineTaxRefundMinor = amountMinorExactForQuantityRange(
        allocatedLine.additionalTaxMinorExact,
        allocatedLine.quantity,
        startQty,
        returnQty
      );
      totalTaxRefundMinor += lineTaxRefundMinor;
    } else if (allocation.taxRefundPolicy === 'NON_REFUNDABLE') {
      lineTaxRefundMinor = 0n;
    }

    // 4. Customs Duty Refund (DDP only, DAP is always 0)
    let lineDutyRefundMinor = 0n;
    if (allocation.incoterm === 'DDP' && allocation.dutyRefundPolicy === 'REFUNDABLE') {
      lineDutyRefundMinor = amountMinorExactForQuantityRange(
        allocatedLine.payableDutyMinorExact,
        allocatedLine.quantity,
        startQty,
        returnQty
      );
      totalDutyRefundMinor += lineDutyRefundMinor;
    } else {
      lineDutyRefundMinor = 0n;
    }

    const lineTotalRefundMinor = lineMerchandiseRefundMinor + lineTaxRefundMinor + lineDutyRefundMinor;

    return {
      orderLineKey: reqItem.orderLineKey,
      quantity: returnQty,
      merchandiseRefundExact: MoneyMapper.toPersistence(Money.fromMinor(lineMerchandiseRefundMinor, currency)),
      includedTaxExact: MoneyMapper.toPersistence(Money.fromMinor(lineIncludedTaxMinor, currency)),
      taxRefundExact: MoneyMapper.toPersistence(Money.fromMinor(lineTaxRefundMinor, currency)),
      dutyRefundExact: MoneyMapper.toPersistence(Money.fromMinor(lineDutyRefundMinor, currency)),
      refundAmountExact: MoneyMapper.toPersistence(Money.fromMinor(lineTotalRefundMinor, currency)),
      refundAmount: fromMinorUnitsDisplayOnly(lineTotalRefundMinor, currency)
    };
  });

  const totalRefundMinor = totalMerchandiseRefundMinor + totalTaxRefundMinor + totalDutyRefundMinor;

  return {
    currency,
    merchandiseRefundExact: MoneyMapper.toPersistence(Money.fromMinor(totalMerchandiseRefundMinor, currency)),
    includedTaxExact: MoneyMapper.toPersistence(Money.fromMinor(totalIncludedTaxMinor, currency)),
    taxRefundExact: MoneyMapper.toPersistence(Money.fromMinor(totalTaxRefundMinor, currency)),
    dutyRefundExact: MoneyMapper.toPersistence(Money.fromMinor(totalDutyRefundMinor, currency)),
    shippingRefundExact: MoneyMapper.toPersistence(Money.fromMinor(0n, currency)),
    totalRefundExact: MoneyMapper.toPersistence(Money.fromMinor(totalRefundMinor, currency)),
    refundAmount: fromMinorUnitsDisplayOnly(totalRefundMinor, currency),

    taxRefundPolicy: allocation.taxRefundPolicy,
    dutyRefundPolicy: allocation.dutyRefundPolicy,
    taxTreatment: allocation.taxTreatment,
    incoterm: allocation.incoterm,

    items: itemAllocations
  };
};

module.exports = {
  allocateOrderMerchandise,
  amountForQuantityRange,
  amountMinorExactForQuantityRange,
  calculateReturnAllocation,
  fromMinorUnits,
  fromMinorUnitsDisplayOnly,
  orderLineKey,
  parseLegacyDecimalToMinorUnits,
  resolveOrderCurrency,
  toBigIntMinor,
  toBigIntMinorExact,
  toMinorUnits
};
