/**
 * @file MoneyMapper.js
 * @description Bidirectional Mapper between in-memory Money Value Object and Mongoose Decimal128 Persistence.
 *
 * Rules:
 * 1. All Decimal128 conversions must pass through MoneyMapper.
 * 2. Only canonical base-10 integer minor units are accepted (scale zero).
 * 3. Fractions, scientific notation (e.g. 1e5, 1.5e2), NaN, Infinity are strictly rejected.
 * 4. Maximum 34 decimal digit bound enforced on amountMinor string.
 * 5. Validates currency against CurrencyRegistry and rejects non-commercial / deprecated codes by default.
 * 6. toJSON prevents raw BSON Decimal128 from leaking into API responses.
 */

'use strict';

const mongoose = require('mongoose');
const Money = require('../core/Money');
const CurrencyRegistry = require('../registries/currencyRegistry');
const CommerceError = require('../core/CommerceError');

const CANONICAL_INTEGER_REGEX = /^-?[0-9]{1,34}$/;

class MoneyMapper {
  /**
   * Converts an in-memory Money Value Object into a Mongoose Decimal128 persistence snapshot.
   * @param {Money} money
   * @param {Object|string} [options={}]
   * @param {string} [options.customSnapshot]
   * @param {boolean} [options.allowDeprecated=false]
   * @param {boolean} [options.allowNonCommercial=false]
   * @returns {Object} { amountMinor: Decimal128, currency: string, exponent: number, registrySnapshot: string }
   */
  static toPersistence(money, options = {}) {
    const opts = typeof options === 'string' ? { customSnapshot: options } : (options || {});
    if (!money || typeof money !== 'object' || typeof money.amountMinor !== 'bigint') {
      throw new CommerceError(
        'MoneyMapper.toPersistence requires a valid Money Value Object with BigInt amountMinor',
        'COMMERCE_PERSISTENCE_INVALID_MONEY',
        400
      );
    }

    const currencyMeta = CurrencyRegistry.get(money.currency, {
      allowDeprecated: Boolean(opts.allowDeprecated),
      allowNonCommercial: Boolean(opts.allowNonCommercial)
    });

    if (currencyMeta.exponent !== money.exponent) {
      throw new CommerceError(
        `Money exponent ${money.exponent} does not match CurrencyRegistry exponent ${currencyMeta.exponent} for ${money.currency}`,
        'COMMERCE_CURRENCY_EXPONENT_MISMATCH',
        400
      );
    }

    const amountStr = money.amountMinor.toString();
    if (!CANONICAL_INTEGER_REGEX.test(amountStr)) {
      throw new CommerceError(
        `amountMinor string '${amountStr}' exceeds maximum supported digit length (34 digits)`,
        'COMMERCE_MONEY_INVALID_AMOUNT',
        400
      );
    }

    const decimal128 = mongoose.Types.Decimal128.fromString(amountStr);
    const registrySnapshot = opts.customSnapshot || CurrencyRegistry.getProvenance().snapshotName;

    return {
      amountMinor: decimal128,
      currency: money.currency,
      exponent: money.exponent,
      registrySnapshot
    };
  }

  /**
   * Converts a Mongoose Decimal128 persistence document/subdocument into an in-memory Money Value Object.
   * @param {Object} persisted
   * @param {Object} [options={}]
   * @param {boolean} [options.allowNegative=false]
   * @param {boolean} [options.allowDeprecated=false]
   * @param {boolean} [options.allowNonCommercial=false]
   * @returns {Money}
   */
  static toMoney(persisted, options = {}) {
    if (!persisted || typeof persisted !== 'object') {
      throw new CommerceError(
        'MoneyMapper.toMoney requires a persisted money document/object',
        'COMMERCE_PERSISTENCE_INVALID_DOC',
        400
      );
    }

    const rawAmount = persisted.amountMinor;
    if (rawAmount === undefined || rawAmount === null) {
      throw new CommerceError(
        'persisted document is missing amountMinor',
        'COMMERCE_PERSISTENCE_INVALID_DOC',
        400
      );
    }

    const amountStr = typeof rawAmount === 'object' && typeof rawAmount.toString === 'function'
      ? rawAmount.toString().trim()
      : String(rawAmount).trim();

    if (!CANONICAL_INTEGER_REGEX.test(amountStr)) {
      throw new CommerceError(
        `Invalid stored Decimal128 integer minor units: '${amountStr}'`,
        'COMMERCE_PERSISTENCE_INVALID_DECIMAL128',
        400
      );
    }

    const currency = String(persisted.currency || '').trim().toUpperCase();
    const currencyMeta = CurrencyRegistry.get(currency, options);

    if (persisted.exponent !== undefined && persisted.exponent !== null) {
      if (Number(persisted.exponent) !== currencyMeta.exponent) {
        throw new CommerceError(
          `Stored exponent ${persisted.exponent} does not match CurrencyRegistry exponent ${currencyMeta.exponent} for ${currency}`,
          'COMMERCE_CURRENCY_EXPONENT_MISMATCH',
          400
        );
      }
    }

    const amountMinor = BigInt(amountStr);
    return Money.fromMinor(amountMinor, currency, options);
  }

  /**
   * Safely serializes a persisted Money snapshot for JSON wire response.
   * Guarantees amountMinor is a string and Decimal128 is not exposed directly.
   * @param {Object} persisted
   * @returns {Object|null}
   */
  static toJSON(persisted) {
    if (!persisted) return null;
    const rawAmount = persisted.amountMinor;
    if (rawAmount === undefined || rawAmount === null) return null;

    const amountStr = typeof rawAmount === 'object' && typeof rawAmount.toString === 'function'
      ? rawAmount.toString().trim()
      : String(rawAmount).trim();

    return {
      amountMinor: amountStr,
      currency: String(persisted.currency || '').trim().toUpperCase(),
      exponent: Number(persisted.exponent !== undefined ? persisted.exponent : 2)
    };
  }

  /**
   * Helper to format a persisted snapshot to exact major decimal string.
   * @param {Object} persisted
   * @returns {string}
   */
  static toDecimalString(persisted) {
    const money = this.toMoney(persisted, { allowNegative: true });
    return money.toDecimalString();
  }

  /**
   * Converts a legacy Number amount to a persisted Decimal128 snapshot via Money.fromLegacyNumber().
   * @param {number} legacyNumber
   * @param {string} currency
   * @param {Object} [options={}]
   * @returns {Object}
   */
  static fromLegacy(legacyNumber, currency = 'PKR', options = {}) {
    const money = Money.fromLegacyNumber(legacyNumber, currency, options);
    return this.toPersistence(money);
  }
}

module.exports = MoneyMapper;
