'use strict';

const {
  ROUNDING_MODES,
  roundFraction,
  allocateLargestRemainder
} = require('../../../modules/commerce/core/Rounding');
const CommerceError = require('../../../modules/commerce/core/CommerceError');

describe('Rounding & Allocation Unit Tests', () => {
  describe('roundFraction — Modes & Exact Invariants', () => {
    it('succeeds without a rounding mode when division is exact', () => {
      expect(roundFraction(10n, 2n)).toBe(5n);
      expect(roundFraction(100n, 4n)).toBe(25n);
      expect(roundFraction(0n, 5n)).toBe(0n);
      expect(roundFraction(-20n, 4n)).toBe(-5n);
    });

    it('throws COMMERCE_ROUNDING_REQUIRED when division is inexact and no rounding mode is provided', () => {
      expect(() => roundFraction(5n, 2n)).toThrow(CommerceError);
      expect(() => roundFraction(5n, 2n)).toThrow(/requires an explicit rounding mode/);
      expect(() => roundFraction(7n, 3n, null)).toThrow(CommerceError);
      expect(() => roundFraction(-5n, 2n)).toThrow(CommerceError);
    });

    it('executes HALF_EVEN (Banker’s Rounding) on positive and negative values', () => {
      // 5 / 2 = 2.5 -> nearest even is 2
      expect(roundFraction(5n, 2n, ROUNDING_MODES.HALF_EVEN)).toBe(2n);
      // 7 / 2 = 3.5 -> nearest even is 4
      expect(roundFraction(7n, 2n, ROUNDING_MODES.HALF_EVEN)).toBe(4n);
      // 3 / 2 = 1.5 -> nearest even is 2
      expect(roundFraction(3n, 2n, ROUNDING_MODES.HALF_EVEN)).toBe(2n);
      // 1 / 2 = 0.5 -> nearest even is 0
      expect(roundFraction(1n, 2n, ROUNDING_MODES.HALF_EVEN)).toBe(0n);

      // Negatives
      expect(roundFraction(-5n, 2n, ROUNDING_MODES.HALF_EVEN)).toBe(-2n);
      expect(roundFraction(-7n, 2n, ROUNDING_MODES.HALF_EVEN)).toBe(-4n);
    });

    it('executes HALF_UP (Commercial Rounding)', () => {
      // 5 / 2 = 2.5 -> rounds away from zero to 3
      expect(roundFraction(5n, 2n, ROUNDING_MODES.HALF_UP)).toBe(3n);
      // 7 / 2 = 3.5 -> rounds away from zero to 4
      expect(roundFraction(7n, 2n, ROUNDING_MODES.HALF_UP)).toBe(4n);
      // -5 / 2 = -2.5 -> rounds away from zero to -3
      expect(roundFraction(-5n, 2n, ROUNDING_MODES.HALF_UP)).toBe(-3n);
    });

    it('executes DOWN, UP, FLOOR, and CEIL', () => {
      // 7 / 3 = 2.333...
      expect(roundFraction(7n, 3n, ROUNDING_MODES.DOWN)).toBe(2n);
      expect(roundFraction(7n, 3n, ROUNDING_MODES.UP)).toBe(3n);
      expect(roundFraction(7n, 3n, ROUNDING_MODES.FLOOR)).toBe(2n);
      expect(roundFraction(7n, 3n, ROUNDING_MODES.CEIL)).toBe(3n);

      // -7 / 3 = -2.333...
      expect(roundFraction(-7n, 3n, ROUNDING_MODES.DOWN)).toBe(-2n);
      expect(roundFraction(-7n, 3n, ROUNDING_MODES.UP)).toBe(-3n);
      expect(roundFraction(-7n, 3n, ROUNDING_MODES.FLOOR)).toBe(-3n);
      expect(roundFraction(-7n, 3n, ROUNDING_MODES.CEIL)).toBe(-2n);
    });

    it('fails on division by zero or non-BigInt inputs', () => {
      expect(() => roundFraction(10n, 0n, ROUNDING_MODES.HALF_EVEN)).toThrow(CommerceError);
      expect(() => roundFraction(10, 2, ROUNDING_MODES.HALF_EVEN)).toThrow(CommerceError);
    });
  });

  describe('allocateLargestRemainder — Proportional Integer Allocation', () => {
    it('allocates equally with remainder distributed to lower indices stably', () => {
      // 100 minor units split 3 ways (weights 1, 1, 1)
      // 100 / 3 = 33 r 1 -> shares: [34, 33, 33]
      const shares = allocateLargestRemainder(100n, [1, 1, 1]);
      expect(shares).toEqual([34n, 33n, 33n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(100n);
    });

    it('allocates according to unequal ratios with exact sum preservation', () => {
      // 1000 minor units with weights [1, 2, 7]
      // 1/10 = 100, 2/10 = 200, 7/10 = 700
      const shares = allocateLargestRemainder(1000n, [1, 2, 7]);
      expect(shares).toEqual([100n, 200n, 700n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(1000n);

      // Odd sum: 1001 minor units with weights [1, 2, 7]
      // 1001 * 1 / 10 = 100 r 1
      // 1001 * 2 / 10 = 200 r 2
      // 1001 * 7 / 10 = 700 r 7 -> highest remainder gets the +1
      const shares2 = allocateLargestRemainder(1001n, [1, 2, 7]);
      expect(shares2).toEqual([100n, 200n, 701n]);
      expect(shares2.reduce((a, b) => a + b, 0n)).toBe(1001n);
    });

    it('supports BigInt weights in allocation', () => {
      const shares = allocateLargestRemainder(1000n, [1n, 2n, 7n]);
      expect(shares).toEqual([100n, 200n, 700n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(1000n);
    });

    it('handles zero total amount and zero-weighted lines', () => {
      const zeroShares = allocateLargestRemainder(0n, [1, 2, 3]);
      expect(zeroShares).toEqual([0n, 0n, 0n]);

      const zeroWeight = allocateLargestRemainder(100n, [1, 0, 1]);
      expect(zeroWeight).toEqual([50n, 0n, 50n]);
      expect(zeroWeight.reduce((a, b) => a + b, 0n)).toBe(100n);
    });

    it('handles zero-decimal (JPY) and three-decimal (KWD) scale values', () => {
      // JPY: 105 JPY allocated across 3 lines
      const jpyShares = allocateLargestRemainder(105n, [1, 1, 1]);
      expect(jpyShares).toEqual([35n, 35n, 35n]);

      // KWD: 123456 fils allocated across 5 items
      const kwdShares = allocateLargestRemainder(123456n, [10, 20, 30, 20, 20]);
      expect(kwdShares.reduce((a, b) => a + b, 0n)).toBe(123456n);
    });

    it('supports explicitly allowed negative adjustment allocation', () => {
      // Refund adjustment: -100 minor units split 3 ways
      const negShares = allocateLargestRemainder(-100n, [1, 1, 1], { allowNegative: true });
      expect(negShares).toEqual([-34n, -33n, -33n]);
      expect(negShares.reduce((a, b) => a + b, 0n)).toBe(-100n);
    });

    it('rejects negative amounts when allowNegative is false', () => {
      expect(() => allocateLargestRemainder(-100n, [1, 1, 1])).toThrow(CommerceError);
    });

    it('rejects unsafe Number weights (fractions, NaN, Infinity, unsafe integers)', () => {
      expect(() => allocateLargestRemainder(100n, [1.5, 2])).toThrow(CommerceError);
      expect(() => allocateLargestRemainder(100n, [NaN, 2])).toThrow(CommerceError);
      expect(() => allocateLargestRemainder(100n, [Infinity, 2])).toThrow(CommerceError);
      expect(() => allocateLargestRemainder(100n, [Number.MAX_SAFE_INTEGER + 10, 2])).toThrow(CommerceError);
    });

    it('rejects negative weights or zero total weight', () => {
      expect(() => allocateLargestRemainder(100n, [1, -1, 1])).toThrow(CommerceError);
      expect(() => allocateLargestRemainder(100n, [1n, -1n, 1n])).toThrow(CommerceError);
      expect(() => allocateLargestRemainder(100n, [0, 0, 0])).toThrow(CommerceError);
      expect(() => allocateLargestRemainder(100n, [])).toThrow(CommerceError);
    });
  });
});
