/**
 * @file Money.js
 * @description Exact Immutable Money Value Object.
 * Enforces zero floating-point arithmetic drift by anchoring canonical in-memory state
 * to BigInt minor units paired with ISO 4217 currency metadata.
 */

const CurrencyRegistry = require('../registries/currencyRegistry');
const CommerceError = require('./CommerceError');
const { ROUNDING_MODES, roundFraction, allocateLargestRemainder } = require('./Rounding');

const MAX_STRING_LENGTH = 50;
const MAX_DOMAIN_DIGITS = 18;
const MAX_DOMAIN_AMOUNT_MINOR = 999999999999999999n;

/**
 * Validates a base-10 integer string format.
 */
const INTEGER_STRING_REGEX = /^-?[0-9]+$/;

/**
 * Validates a decimal string format (rejects exponential notation).
 */
const DECIMAL_STRING_REGEX = /^-?[0-9]+(?:\.[0-9]+)?$/;

class Money {
  static get MAX_DOMAIN_DIGITS() {
    return MAX_DOMAIN_DIGITS;
  }

  static get MAX_DOMAIN_AMOUNT_MINOR() {
    return MAX_DOMAIN_AMOUNT_MINOR;
  }
  /**
   * Internal constructor. Use static factory methods.
   * @private
   */
  constructor(amountMinor, currency, exponent, allowNegative = false) {
    if (typeof amountMinor !== 'bigint') {
      throw CommerceError.moneyInvalidAmount('Internal amountMinor must be a BigInt');
    }
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw CommerceError.currencyUnknown(currency);
    }
    if (!Number.isInteger(exponent) || exponent < 0) {
      throw CommerceError.moneyInvalidAmount(`Invalid exponent: ${exponent}`);
    }
    if (amountMinor < 0n && !allowNegative) {
      throw CommerceError.moneyNegativeNotAllowed();
    }

    // Normalize -0n to 0n
    this.amountMinor = amountMinor === 0n ? 0n : amountMinor;
    this.currency = currency;
    this.exponent = exponent;

    Object.freeze(this);
  }

  /**
   * Construct Money from canonical minor units (BigInt or base-10 integer string).
   * Note: Raw JavaScript Number inputs are explicitly rejected to prevent precision loss.
   * @param {bigint|string} amountMinor
   * @param {string} currency
   * @param {Object} [options={}]
   * @param {boolean} [options.allowNegative=false]
   * @param {boolean} [options.allowDeprecated=false]
   * @param {boolean} [options.allowNonCommercial=false]
   * @returns {Money}
   */
  static fromMinor(amountMinor, currency, options = {}) {
    if (typeof amountMinor === 'number') {
      throw CommerceError.moneyInvalidAmount(
        'JavaScript Number is prohibited for exact minor units. Provide a BigInt or integer string, or use Money.fromLegacyNumber()'
      );
    }

    const allowNegative = Boolean(options.allowNegative);
    const allowDeprecated = Boolean(options.allowDeprecated);
    const allowNonCommercial = Boolean(options.allowNonCommercial);
    const currencyMeta = CurrencyRegistry.getCurrency(currency, { allowDeprecated, allowNonCommercial });

    if (currencyMeta.exponent === null) {
      throw CommerceError.moneyInvalidAmount(
        `Currency ${currencyMeta.code} has no minor-unit exponent and cannot be constructed as minor units`
      );
    }

    let minorBigInt;
    if (typeof amountMinor === 'bigint') {
      minorBigInt = amountMinor;
    } else if (typeof amountMinor === 'string') {
      const trimmed = amountMinor.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_STRING_LENGTH || !INTEGER_STRING_REGEX.test(trimmed)) {
        throw CommerceError.moneyInvalidAmount('Invalid integer string for minor units');
      }
      minorBigInt = BigInt(trimmed);
    } else {
      throw CommerceError.moneyInvalidAmount('amountMinor must be a BigInt or base-10 integer string');
    }

    return new Money(minorBigInt, currencyMeta.code, currencyMeta.exponent, allowNegative);
  }

  /**
   * Construct Money from exact major decimal string (e.g. "150.00", "150", "-25.50").
   * Requires an explicit roundingMode option if fractional precision would be discarded.
   * @param {string} decimalString
   * @param {string} currency
   * @param {Object} [options={}]
   * @param {string|null} [options.roundingMode=null] - Explicit mode required if fractional digits exceed currency exponent
   * @param {boolean} [options.allowNegative=false]
   * @param {boolean} [options.allowDeprecated=false]
   * @param {boolean} [options.allowNonCommercial=false]
   * @returns {Money}
   */
  static fromDecimal(decimalString, currency, options = {}) {
    if (typeof decimalString !== 'string') {
      throw CommerceError.moneyInvalidAmount('decimalString must be a string. For Number values, use Money.fromLegacyNumber()');
    }

    const trimmed = decimalString.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_STRING_LENGTH || !DECIMAL_STRING_REGEX.test(trimmed)) {
      throw CommerceError.moneyInvalidAmount('Invalid decimal string representation (scientific notation not permitted)');
    }

    const allowNegative = Boolean(options.allowNegative);
    const allowDeprecated = Boolean(options.allowDeprecated);
    const allowNonCommercial = Boolean(options.allowNonCommercial);
    const roundingMode = options.roundingMode || null;
    const currencyMeta = CurrencyRegistry.getCurrency(currency, { allowDeprecated, allowNonCommercial });

    if (currencyMeta.exponent === null) {
      throw CommerceError.moneyInvalidAmount(
        `Currency ${currencyMeta.code} has no minor-unit exponent and cannot be constructed from decimal`
      );
    }

    const targetExponent = currencyMeta.exponent;
    const isNegative = trimmed.startsWith('-');
    const cleanStr = isNegative ? trimmed.slice(1) : trimmed;
    const parts = cleanStr.split('.');
    const integerPartStr = parts[0] || '0';
    const fractionalPartStr = parts[1] || '';

    const integerPart = BigInt(integerPartStr);
    const scaleFactor = 10n ** BigInt(targetExponent);

    let minorUnits;
    if (fractionalPartStr.length === targetExponent) {
      const fractionalPart = targetExponent > 0 ? BigInt(fractionalPartStr) : 0n;
      minorUnits = (integerPart * scaleFactor) + fractionalPart;
    } else if (fractionalPartStr.length < targetExponent) {
      // Pad with trailing zeros (exact representation)
      const paddedFraction = fractionalPartStr.padEnd(targetExponent, '0');
      const fractionalPart = targetExponent > 0 ? BigInt(paddedFraction) : 0n;
      minorUnits = (integerPart * scaleFactor) + fractionalPart;
    } else {
      // Fractional part has more digits than currency exponent -> requires explicit rounding mode
      if (!roundingMode) {
        throw CommerceError.moneyRoundingRequired(
          `Decimal string "${decimalString}" has ${fractionalPartStr.length} decimal places, exceeding exponent ${targetExponent} for ${currencyMeta.code}. An explicit roundingMode is required.`
        );
      }
      const fractionLength = fractionalPartStr.length;
      const fullNumerator = (integerPart * (10n ** BigInt(fractionLength))) + BigInt(fractionalPartStr);
      const denominator = 10n ** BigInt(fractionLength - targetExponent);
      minorUnits = roundFraction(fullNumerator, denominator, roundingMode);
    }

    const finalMinor = isNegative ? -minorUnits : minorUnits;
    return new Money(finalMinor, currencyMeta.code, currencyMeta.exponent, allowNegative);
  }

  /**
   * Isolated adapter for legacy JavaScript Number values (e.g. historical PKR migration).
   * Strictly bounded and converts through deterministic decimal string parsing with explicit rounding.
   * @param {number} numberValue
   * @param {string} currency
   * @param {Object} [options={}]
   * @param {string} [options.roundingMode='HALF_EVEN']
   * @returns {Money}
   */
  static fromLegacyNumber(numberValue, currency, options = {}) {
    if (typeof numberValue !== 'number' || !Number.isFinite(numberValue)) {
      throw CommerceError.moneyInvalidAmount('Legacy adapter requires a finite JavaScript Number');
    }

    const allowDeprecated = Boolean(options.allowDeprecated);
    const allowNonCommercial = Boolean(options.allowNonCommercial);
    const roundingMode = options.roundingMode || ROUNDING_MODES.HALF_EVEN;
    const currencyMeta = CurrencyRegistry.getCurrency(currency, { allowDeprecated, allowNonCommercial });
    const exponent = currencyMeta.exponent || 2;

    const decimalString = numberValue.toFixed(Math.max(exponent, 2));
    return Money.fromDecimal(decimalString, currency, {
      ...options,
      roundingMode
    });
  }

  /**
   * Construct a zero-amount Money instance for the given currency.
   * @param {string} currency
   * @param {Object} [options={}]
   * @returns {Money}
   */
  static zero(currency, options = {}) {
    return Money.fromMinor(0n, currency, options);
  }

  /**
   * Adds another Money instance. Currencies must match.
   * @param {Money} other
   * @param {Object} [options={}]
   * @returns {Money}
   */
  add(other, options = {}) {
    this.assertCurrencyMatch(other);
    const allowNegative = Boolean(options.allowNegative || (this.amountMinor < 0n || other.amountMinor < 0n));
    return new Money(this.amountMinor + other.amountMinor, this.currency, this.exponent, allowNegative);
  }

  /**
   * Subtracts another Money instance. Currencies must match.
   * @param {Money} other
   * @param {Object} [options={}]
   * @returns {Money}
   */
  subtract(other, options = {}) {
    this.assertCurrencyMatch(other);
    const allowNegative = Boolean(options.allowNegative);
    return new Money(this.amountMinor - other.amountMinor, this.currency, this.exponent, allowNegative);
  }

  /**
   * Multiplies the monetary amount by a rational fraction (numerator / denominator).
   * If division has a remainder and no roundingMode is supplied, throws COMMERCE_ROUNDING_REQUIRED.
   * @param {number|bigint} numerator
   * @param {number|bigint} denominator
   * @param {string|null} [roundingMode=null]
   * @param {Object} [options={}]
   * @returns {Money}
   */
  multiplyRational(numerator, denominator, roundingMode = null, options = {}) {
    let num;
    let den;

    if (typeof numerator === 'bigint') {
      num = numerator;
    } else if (typeof numerator === 'number' && Number.isSafeInteger(numerator)) {
      num = BigInt(numerator);
    } else {
      throw CommerceError.moneyInvalidAmount('Numerator must be a BigInt or safe integer Number');
    }

    if (typeof denominator === 'bigint') {
      den = denominator;
    } else if (typeof denominator === 'number' && Number.isSafeInteger(denominator)) {
      den = BigInt(denominator);
    } else {
      throw CommerceError.moneyInvalidAmount('Denominator must be a BigInt or safe integer Number');
    }

    const allowNegative = Boolean(options.allowNegative || this.amountMinor < 0n || (num < 0n !== den < 0n));
    const multiplied = roundFraction(this.amountMinor * num, den, roundingMode);
    return new Money(multiplied, this.currency, this.exponent, allowNegative);
  }

  /**
   * Proportionally allocates the monetary amount across a list of weights using deterministic largest remainder.
   * @param {Array<number|bigint>} weights
   * @param {Object} [options={}]
   * @returns {Array<Money>}
   */
  allocate(weights, options = {}) {
    const allowNegative = Boolean(options.allowNegative || this.amountMinor < 0n);
    const rawShares = allocateLargestRemainder(this.amountMinor, weights, { allowNegative });
    return rawShares.map((share) => new Money(share, this.currency, this.exponent, allowNegative));
  }

  /**
   * Compares with another Money instance.
   * @param {Money} other
   * @returns {-1|0|1}
   */
  compare(other) {
    this.assertCurrencyMatch(other);
    if (this.amountMinor < other.amountMinor) return -1;
    if (this.amountMinor > other.amountMinor) return 1;
    return 0;
  }

  /**
   * Checks equality with another Money instance.
   * @param {*} other
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof Money)) return false;
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  /**
   * Check if amount is zero.
   * @returns {boolean}
   */
  isZero() {
    return this.amountMinor === 0n;
  }

  /**
   * Check if amount is strictly positive.
   * @returns {boolean}
   */
  isPositive() {
    return this.amountMinor > 0n;
  }

  /**
   * Check if amount is strictly negative.
   * @returns {boolean}
   */
  isNegative() {
    return this.amountMinor < 0n;
  }

  /**
   * Returns absolute monetary value.
   * @returns {Money}
   */
  abs() {
    const absMinor = this.amountMinor < 0n ? -this.amountMinor : this.amountMinor;
    return new Money(absMinor, this.currency, this.exponent, false);
  }

  /**
   * Negates the monetary amount (explicit negative allowed context).
   * @param {Object} [options={}]
   * @returns {Money}
   */
  negate(options = { allowNegative: true }) {
    const allowNegative = options.allowNegative !== undefined ? Boolean(options.allowNegative) : true;
    return new Money(-this.amountMinor, this.currency, this.exponent, allowNegative);
  }

  /**
   * Formats into a canonical major decimal string with exact currency exponent decimal places.
   * Examples:
   * 15000 minor PKR (exp 2) -> "150.00"
   * 150 minor JPY (exp 0) -> "150"
   * 150000 minor KWD (exp 3) -> "150.000"
   * @returns {string}
   */
  toDecimalString() {
    const isNegative = this.amountMinor < 0n;
    const absMinor = isNegative ? -this.amountMinor : this.amountMinor;
    const minorStr = absMinor.toString(10);
    const exp = this.exponent;

    let result;
    if (exp === 0) {
      result = minorStr;
    } else if (minorStr.length <= exp) {
      const padded = minorStr.padStart(exp, '0');
      result = `0.${padded}`;
    } else {
      const integerPart = minorStr.slice(0, minorStr.length - exp);
      const fractionalPart = minorStr.slice(minorStr.length - exp);
      result = `${integerPart}.${fractionalPart}`;
    }

    return isNegative ? `-${result}` : result;
  }

  /**
   * Formats into canonical base-10 minor integer string.
   * @returns {string}
   */
  toMinorString() {
    return this.amountMinor.toString(10);
  }

  /**
   * Canonical JSON serialization wire contract.
   * @returns {{amountMinor: string, currency: string, exponent: number, amountDecimal: string}}
   */
  toJSON() {
    return {
      amountMinor: this.toMinorString(),
      currency: this.currency,
      exponent: this.exponent,
      amountDecimal: this.toDecimalString()
    };
  }

  /**
   * String representation for debug logs.
   * @returns {string}
   */
  toString() {
    return `[Money ${this.toDecimalString()} ${this.currency}]`;
  }

  /**
   * Helper assertion ensuring identical currency.
   * @private
   */
  assertCurrencyMatch(other) {
    if (!(other instanceof Money)) {
      throw CommerceError.moneyInvalidAmount('Expected an instance of Money');
    }
    if (this.currency !== other.currency) {
      throw CommerceError.currencyMismatch(this.currency, other.currency);
    }
    if (this.exponent !== other.exponent) {
      throw CommerceError.moneyInvalidAmount(
        `Currency exponent mismatch between ${this.currency} (${this.exponent}) and ${other.currency} (${other.exponent})`
      );
    }
  }
}

module.exports = Money;
