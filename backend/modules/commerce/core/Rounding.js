/**
 * @file Rounding.js
 * @description Arbitrary-precision rounding modes and exact largest-remainder allocation algorithms.
 * Operates purely on BigInt to avoid IEEE 754 binary floating-point precision loss.
 */

const CommerceError = require('./CommerceError');

const ROUNDING_MODES = Object.freeze({
  HALF_EVEN: 'HALF_EVEN',
  HALF_UP: 'HALF_UP',
  DOWN: 'DOWN',
  UP: 'UP',
  CEIL: 'CEIL',
  FLOOR: 'FLOOR'
});

/**
 * Rounds a rational fraction (numerator / denominator) to a BigInt according to the specified mode.
 * Throws COMMERCE_ROUNDING_REQUIRED if division has a remainder and no rounding mode is explicitly supplied.
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @param {string|null} [mode=null]
 * @returns {bigint}
 */
function roundFraction(numerator, denominator, mode = null) {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint') {
    throw CommerceError.moneyInvalidAmount('Numerator and denominator must be BigInt values');
  }
  if (denominator === 0n) {
    throw CommerceError.moneyInvalidAmount('Division by zero in monetary rounding');
  }

  // Normalize sign so denominator is always positive
  let num = numerator;
  let den = denominator;
  if (den < 0n) {
    num = -num;
    den = -den;
  }

  const quotient = num / den;
  const remainder = num % den;

  if (remainder === 0n) {
    return quotient;
  }

  if (!mode) {
    throw CommerceError.moneyRoundingRequired(
      `Fraction ${num}/${den} is inexact (remainder: ${remainder}) and requires an explicit rounding mode`
    );
  }

  const isPositive = num > 0n;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const doubleRemainder = absRemainder * 2n;

  switch (mode) {
    case ROUNDING_MODES.DOWN:
      // Truncate towards zero
      return quotient;

    case ROUNDING_MODES.UP:
      // Round away from zero
      return isPositive ? quotient + 1n : quotient - 1n;

    case ROUNDING_MODES.FLOOR:
      // Round towards -Infinity
      return isPositive ? quotient : quotient - 1n;

    case ROUNDING_MODES.CEIL:
      // Round towards +Infinity
      return isPositive ? quotient + 1n : quotient;

    case ROUNDING_MODES.HALF_UP:
      // Round to nearest; ties round away from zero
      if (doubleRemainder >= den) {
        return isPositive ? quotient + 1n : quotient - 1n;
      }
      return quotient;

    case ROUNDING_MODES.HALF_EVEN:
      // Banker's Rounding: ties round to nearest even quotient
      if (doubleRemainder > den) {
        return isPositive ? quotient + 1n : quotient - 1n;
      }
      if (doubleRemainder === den) {
        const isEven = (quotient % 2n) === 0n;
        if (!isEven) {
          return isPositive ? quotient + 1n : quotient - 1n;
        }
      }
      return quotient;

    default:
      throw CommerceError.moneyInvalidAmount(`Unsupported rounding mode: ${mode}`);
  }
}

/**
 * Deterministic Largest-Remainder Proportional Allocation.
 * Guarantees that the sum of allocated minor units exactly equals the target amount.
 * @param {bigint} amountMinor - Total amount to allocate in minor units
 * @param {Array<number|bigint>} weights - Allocation ratios/weights
 * @param {Object} options
 * @param {boolean} [options.allowNegative=false]
 * @returns {Array<bigint>}
 */
function allocateLargestRemainder(amountMinor, weights, options = {}) {
  const allowNegative = Boolean(options.allowNegative);
  if (typeof amountMinor !== 'bigint') {
    throw CommerceError.moneyAllocationError('Allocatable amount must be a BigInt');
  }
  if (!Array.isArray(weights) || weights.length === 0) {
    throw CommerceError.moneyAllocationError('Allocation requires a non-empty array of weights');
  }
  if (amountMinor < 0n && !allowNegative) {
    throw CommerceError.moneyNegativeNotAllowed();
  }

  const isNegativeTotal = amountMinor < 0n;
  const absAmount = isNegativeTotal ? -amountMinor : amountMinor;

  // Convert and strictly validate weights
  const bigintWeights = weights.map((w, idx) => {
    if (typeof w === 'bigint') {
      if (w < 0n) throw CommerceError.moneyAllocationError(`Negative BigInt weight at index ${idx}`);
      return w;
    }
    if (typeof w === 'number') {
      if (!Number.isSafeInteger(w) || w < 0) {
        throw CommerceError.moneyAllocationError(`Weight at index ${idx} must be a non-negative safe integer`);
      }
      return BigInt(w);
    }
    throw CommerceError.moneyAllocationError(`Unsupported weight type at index ${idx}`);
  });

  const totalWeight = bigintWeights.reduce((sum, w) => sum + w, 0n);
  if (totalWeight === 0n) {
    if (absAmount === 0n) {
      return bigintWeights.map(() => 0n);
    }
    throw CommerceError.moneyAllocationError('Total allocation weight must be greater than zero');
  }

  // Phase 1: Compute integer floor shares and remainders
  const allocated = bigintWeights.map((weight, index) => {
    const numerator = absAmount * weight;
    const floorShare = numerator / totalWeight;
    const remainder = numerator % totalWeight;
    return {
      index,
      floorShare,
      remainder
    };
  });

  const assignedSum = allocated.reduce((sum, line) => sum + line.floorShare, 0n);
  const remainingUnits = Number(absAmount - assignedSum);

  // Phase 2: Rank lines by remainder descending with stable index as tie-breaker
  const ranked = [...allocated].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.index - right.index;
  });

  // Phase 3: Distribute 1 minor unit to top remainder lines
  for (let i = 0; i < remainingUnits; i += 1) {
    ranked[i].floorShare += 1n;
  }

  // Restore original order and apply sign
  return allocated.map((line) => (isNegativeTotal ? -line.floorShare : line.floorShare));
}

module.exports = {
  ROUNDING_MODES,
  roundFraction,
  allocateLargestRemainder
};
