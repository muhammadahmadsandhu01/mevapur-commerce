'use strict';

const Money = require('../../../modules/commerce/core/Money');
const CommerceError = require('../../../modules/commerce/core/CommerceError');
const { ROUNDING_MODES } = require('../../../modules/commerce/core/Rounding');

describe('Money — Exact Value Object Unit Tests', () => {
  describe('Factory Construction & Parsing', () => {
    it('constructs from minor unit integer string and BigInt', () => {
      const m1 = Money.fromMinor('15000', 'PKR');
      expect(m1.amountMinor).toBe(15000n);
      expect(m1.currency).toBe('PKR');
      expect(m1.exponent).toBe(2);
      expect(m1.toDecimalString()).toBe('150.00');

      const m2 = Money.fromMinor(2500n, 'USD');
      expect(m2.amountMinor).toBe(2500n);
      expect(m2.currency).toBe('USD');
      expect(m2.exponent).toBe(2);
      expect(m2.toDecimalString()).toBe('25.00');
    });

    it('prohibits raw JavaScript Number in Money.fromMinor', () => {
      expect(() => Money.fromMinor(15000, 'PKR')).toThrow(CommerceError);
      expect(() => Money.fromMinor(15000, 'PKR')).toThrow(/JavaScript Number is prohibited/);
    });

    it('rejects non-commercial ISO currency codes by default in Money.fromMinor and fromDecimal', () => {
      expect(() => Money.fromMinor('1000', 'XAU')).toThrow(CommerceError);
      expect(() => Money.fromMinor('1000', 'XAU')).toThrow(/non-commercial/);
      expect(() => Money.fromDecimal('10.00', 'XAU')).toThrow(CommerceError);
      expect(() => Money.fromDecimal('10.00', 'XAU')).toThrow(/non-commercial/);

      expect(() => Money.fromMinor('1000', 'XDR')).toThrow(CommerceError);
      expect(() => Money.fromDecimal('10.00', 'XDR')).toThrow(CommerceError);
    });

    it('rejects currencies with null exponents from minor unit construction even if allowed non-commercial', () => {
      expect(() => Money.fromMinor('1000', 'XAU', { allowNonCommercial: true })).toThrow(CommerceError);
      expect(() => Money.fromMinor('1000', 'XAU', { allowNonCommercial: true })).toThrow(/has no minor-unit exponent/);
    });

    it('constructs from major decimal string with 0, 2, and 3-decimal currencies when exact', () => {
      // 2-decimal (PKR)
      const pkr = Money.fromDecimal('150.50', 'PKR');
      expect(pkr.amountMinor).toBe(15050n);
      expect(pkr.toDecimalString()).toBe('150.50');

      // 0-decimal (JPY)
      const jpy = Money.fromDecimal('1500', 'JPY');
      expect(jpy.amountMinor).toBe(1500n);
      expect(jpy.exponent).toBe(0);
      expect(jpy.toDecimalString()).toBe('1500');

      // 3-decimal (KWD)
      const kwd = Money.fromDecimal('15.125', 'KWD');
      expect(kwd.amountMinor).toBe(15125n);
      expect(kwd.exponent).toBe(3);
      expect(kwd.toDecimalString()).toBe('15.125');
    });

    it('pads fractional zeros when decimal string has fewer digits than exponent without requiring rounding', () => {
      const m = Money.fromDecimal('150', 'PKR');
      expect(m.amountMinor).toBe(15000n);
      expect(m.toDecimalString()).toBe('150.00');

      const kwd = Money.fromDecimal('15.1', 'KWD');
      expect(kwd.amountMinor).toBe(15100n);
      expect(kwd.toDecimalString()).toBe('15.100');
    });

    it('throws COMMERCE_ROUNDING_REQUIRED when decimal string exceeds currency exponent and no rounding mode is provided', () => {
      expect(() => Money.fromDecimal('150.005', 'PKR')).toThrow(CommerceError);
      expect(() => Money.fromDecimal('150.005', 'PKR')).toThrow(/explicit roundingMode is required/);
      expect(() => Money.fromDecimal('150.1', 'JPY')).toThrow(CommerceError);
      expect(() => Money.fromDecimal('15.1234', 'KWD')).toThrow(CommerceError);
    });

    it('rounds using explicit mode when decimal string exceeds currency exponent', () => {
      // 150.005 PKR (exp 2) -> with HALF_EVEN rounds to 150.00 (0 is even)
      const even = Money.fromDecimal('150.005', 'PKR', { roundingMode: ROUNDING_MODES.HALF_EVEN });
      expect(even.amountMinor).toBe(15000n);

      // 150.015 PKR -> with HALF_EVEN rounds to 150.02 (2 is even)
      const even2 = Money.fromDecimal('150.015', 'PKR', { roundingMode: ROUNDING_MODES.HALF_EVEN });
      expect(even2.amountMinor).toBe(15002n);

      // 150.005 PKR -> with HALF_UP rounds to 150.01
      const halfUp = Money.fromDecimal('150.005', 'PKR', { roundingMode: ROUNDING_MODES.HALF_UP });
      expect(halfUp.amountMinor).toBe(15001n);
    });

    it('rejects scientific notation and non-decimal strings in fromDecimal', () => {
      expect(() => Money.fromDecimal('1e5', 'PKR')).toThrow(CommerceError);
      expect(() => Money.fromDecimal('1.5E2', 'PKR')).toThrow(CommerceError);
      expect(() => Money.fromDecimal('abc', 'PKR')).toThrow(CommerceError);
      expect(() => Money.fromDecimal('', 'PKR')).toThrow(CommerceError);
    });

    it('supports Money.zero factory', () => {
      const z = Money.zero('EUR');
      expect(z.isZero()).toBe(true);
      expect(z.amountMinor).toBe(0n);
      expect(z.toDecimalString()).toBe('0.00');
    });

    it('handles huge monetary values safely without integer overflow', () => {
      // 10 trillion PKR in minor units: 1,000,000,000,000,000
      const huge = Money.fromMinor('1000000000000000', 'PKR');
      expect(huge.toDecimalString()).toBe('10000000000000.00');
      const doubled = huge.add(huge);
      expect(doubled.toMinorString()).toBe('2000000000000000');
    });
  });

  describe('Legacy Number Adapter (Controlled Migration Path)', () => {
    it('converts finite numbers deterministically into exact Money instances', () => {
      const m1 = Money.fromLegacyNumber(150.5, 'PKR');
      expect(m1.amountMinor).toBe(15050n);
      expect(m1.toDecimalString()).toBe('150.50');

      const m2 = Money.fromLegacyNumber(0.1, 'USD');
      expect(m2.amountMinor).toBe(10n);
      expect(m2.toDecimalString()).toBe('0.10');

      const jpy = Money.fromLegacyNumber(500, 'JPY');
      expect(jpy.amountMinor).toBe(500n);
      expect(jpy.toDecimalString()).toBe('500');
    });

    it('rejects invalid or non-finite inputs in legacy adapter', () => {
      expect(() => Money.fromLegacyNumber(NaN, 'PKR')).toThrow(CommerceError);
      expect(() => Money.fromLegacyNumber(Infinity, 'PKR')).toThrow(CommerceError);
      expect(() => Money.fromLegacyNumber('100', 'PKR')).toThrow(CommerceError);
    });
  });

  describe('Operations & Arithmetic Safety', () => {
    it('adds and subtracts exact matching currencies', () => {
      const a = Money.fromDecimal('100.50', 'PKR');
      const b = Money.fromDecimal('49.50', 'PKR');

      const sum = a.add(b);
      expect(sum.amountMinor).toBe(15000n);
      expect(sum.toDecimalString()).toBe('150.00');

      const diff = a.subtract(b);
      expect(diff.amountMinor).toBe(5100n);
      expect(diff.toDecimalString()).toBe('51.00');
    });

    it('fails closed on currency mismatch', () => {
      const pkr = Money.fromDecimal('100.00', 'PKR');
      const usd = Money.fromDecimal('100.00', 'USD');

      expect(() => pkr.add(usd)).toThrow(CommerceError);
      expect(() => pkr.add(usd)).toThrow(/Currency mismatch/);
      expect(() => pkr.subtract(usd)).toThrow(CommerceError);
      expect(() => pkr.compare(usd)).toThrow(CommerceError);
    });

    it('enforces negative amount policy', () => {
      const a = Money.fromDecimal('50.00', 'PKR');
      const b = Money.fromDecimal('100.00', 'PKR');

      // Default subtract into negative throws
      expect(() => a.subtract(b)).toThrow(CommerceError);
      expect(() => a.subtract(b)).toThrow(/Negative monetary amounts are not permitted/);

      // Explicit allowNegative succeeds
      const neg = a.subtract(b, { allowNegative: true });
      expect(neg.isNegative()).toBe(true);
      expect(neg.toDecimalString()).toBe('-50.00');
    });

    it('performs rational multiplication: exact division succeeds without rounding mode', () => {
      const price = Money.fromDecimal('100.00', 'PKR'); // 10000 minor
      // * 1 / 2 = 5000 minor (exact, remainder 0)
      const half = price.multiplyRational(1, 2);
      expect(half.amountMinor).toBe(5000n);
      expect(half.toDecimalString()).toBe('50.00');

      // BigInt numerator/denominator
      const quarter = price.multiplyRational(1n, 4n);
      expect(quarter.amountMinor).toBe(2500n);
      expect(quarter.toDecimalString()).toBe('25.00');
    });

    it('performs rational multiplication: inexact division throws without explicit rounding mode', () => {
      const price = Money.fromDecimal('100.00', 'PKR'); // 10000 minor
      // 10000 * 1 / 3 = 3333 r 1
      expect(() => price.multiplyRational(1, 3)).toThrow(CommerceError);
      expect(() => price.multiplyRational(1, 3)).toThrow(/requires an explicit rounding mode/);

      // With explicit mode succeeds
      const thirdEven = price.multiplyRational(1, 3, ROUNDING_MODES.HALF_EVEN);
      expect(thirdEven.amountMinor).toBe(3333n);

      const thirdUp = price.multiplyRational(1, 3, ROUNDING_MODES.UP);
      expect(thirdUp.amountMinor).toBe(3334n);
    });

    it('rejects unsafe Number inputs in multiplyRational', () => {
      const price = Money.fromDecimal('100.00', 'PKR');
      expect(() => price.multiplyRational(1.5, 2)).toThrow(CommerceError);
      expect(() => price.multiplyRational(1, 2.5)).toThrow(CommerceError);
      expect(() => price.multiplyRational(NaN, 2)).toThrow(CommerceError);
      expect(() => price.multiplyRational(1, Infinity)).toThrow(CommerceError);
      expect(() => price.multiplyRational(Number.MAX_SAFE_INTEGER + 10, 2)).toThrow(CommerceError);
    });

    it('performs rational multiplication with explicit rounding modes', () => {
      const price = Money.fromDecimal('99.99', 'USD');
      // 10% tax: * 10 / 100
      const tax = price.multiplyRational(10, 100, ROUNDING_MODES.HALF_UP);
      expect(tax.toDecimalString()).toBe('10.00');
      expect(tax.amountMinor).toBe(1000n);
    });

    it('performs deterministic proportional allocation across lines', () => {
      const total = Money.fromDecimal('100.00', 'PKR');
      const [line1, line2, line3] = total.allocate([1, 1, 1]);

      expect(line1.toDecimalString()).toBe('33.34');
      expect(line2.toDecimalString()).toBe('33.33');
      expect(line3.toDecimalString()).toBe('33.33');

      const allocatedTotal = line1.add(line2).add(line3);
      expect(allocatedTotal.equals(total)).toBe(true);
    });

    it('supports compare, equals, isPositive, isNegative, isZero, abs, negate', () => {
      const p1 = Money.fromDecimal('100.00', 'PKR');
      const p2 = Money.fromDecimal('200.00', 'PKR');
      const p3 = Money.fromDecimal('100.00', 'PKR');

      expect(p1.compare(p2)).toBe(-1);
      expect(p2.compare(p1)).toBe(1);
      expect(p1.compare(p3)).toBe(0);
      expect(p1.equals(p3)).toBe(true);
      expect(p1.equals(p2)).toBe(false);

      const neg = p1.negate();
      expect(neg.isNegative()).toBe(true);
      expect(neg.abs().equals(p1)).toBe(true);
    });
  });

  describe('Wire Serialization & Immutability', () => {
    it('serializes to canonical base-10 string JSON representation', () => {
      const m = Money.fromDecimal('150.00', 'PKR');
      const json = m.toJSON();

      expect(json).toEqual({
        amountMinor: '15000',
        currency: 'PKR',
        exponent: 2,
        amountDecimal: '150.00'
      });

      // Confirm amountMinor is a string (never float or Number)
      expect(typeof json.amountMinor).toBe('string');
    });

    it('guarantees immutability of Money instance', () => {
      const m = Money.fromDecimal('150.00', 'PKR');
      expect(Object.isFrozen(m)).toBe(true);
      expect(() => {
        m.amountMinor = 999n;
      }).toThrow();
      expect(() => {
        m.currency = 'USD';
      }).toThrow();
    });
  });
});
