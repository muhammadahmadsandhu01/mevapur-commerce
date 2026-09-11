/**
 * @file Phone.js
 * @description Country-Aware Canonical Phone Number Value Object.
 * Backed by pinned metadata parser (libphonenumber-js) to support national input normalization,
 * strict E.164 canonical persistence, extension separation, and PII-redacted presentation.
 */

const { parsePhoneNumberFromString } = require('libphonenumber-js/max');
const CountryRegistry = require('../registries/countryRegistry');
const CommerceError = require('./CommerceError');

const MAX_PHONE_INPUT_LENGTH = 50;

class Phone {
  /**
   * Internal constructor. Use Phone.parse().
   * @private
   */
  constructor({
    e164,
    countryCode,
    callingCode,
    nationalNumber,
    extension = ''
  }) {
    this.e164 = e164;
    this.countryCode = countryCode;
    this.callingCode = callingCode;
    this.nationalNumber = nationalNumber;
    this.extension = extension;

    Object.freeze(this);
  }

  /**
   * Parse and validate a phone number with optional default country context.
   * @param {string} rawInput
   * @param {string|null} [defaultCountryCode=null] - ISO 3166-1 alpha-2
   * @param {Object} [options={}]
   * @returns {Phone}
   */
  static parse(rawInput, defaultCountryCode = null, options = {}) {
    if (typeof rawInput !== 'string') {
      throw CommerceError.phoneInvalidError('Phone input must be a string');
    }

    const trimmed = rawInput.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_PHONE_INPUT_LENGTH) {
      throw CommerceError.phoneInvalidError('Phone number length is invalid or empty');
    }

    let defaultCountry = null;
    if (defaultCountryCode) {
      const normalizedCountry = CountryRegistry.normalizeCode(defaultCountryCode);
      if (CountryRegistry.hasCountry(normalizedCountry)) {
        defaultCountry = normalizedCountry;
      } else {
        throw CommerceError.phoneInvalidError(`Unsupported country code context: ${defaultCountryCode}`);
      }
    }

    if (!defaultCountry && !trimmed.startsWith('+')) {
      throw CommerceError.phoneInvalidError('Country context is required for national format phone numbers');
    }

    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
    if (!parsed) {
      throw CommerceError.phoneInvalidError('Phone number could not be parsed');
    }

    if (!parsed.isPossible()) {
      throw CommerceError.phoneInvalidError('Phone number structure or length is impossible according to metadata');
    }

    if (!parsed.isValid()) {
      throw CommerceError.phoneInvalidError('Phone number is invalid according to country numbering plan metadata');
    }

    const e164 = parsed.number; // Canonical E.164, e.g. "+923001234567"
    const countryCode = parsed.country || (defaultCountry || 'UNKNOWN');
    const callingCode = parsed.countryCallingCode;
    const nationalNumber = parsed.nationalNumber;
    const extension = parsed.ext || '';

    return new Phone({
      e164,
      countryCode,
      callingCode,
      nationalNumber,
      extension
    });
  }

  /**
   * Format for national display (e.g. "0300 1234567")
   * @returns {string}
   */
  toNational() {
    const parsed = parsePhoneNumberFromString(this.e164);
    return parsed ? parsed.formatNational() : this.e164;
  }

  /**
   * Format for international display (e.g. "+92 300 1234567")
   * @returns {string}
   */
  toInternational() {
    const parsed = parsePhoneNumberFromString(this.e164);
    return parsed ? parsed.formatInternational() : this.e164;
  }

  /**
   * Redacted representation for secure audit logs and error telemetry.
   * Example: "+92 300 ****567"
   * @returns {string}
   */
  toRedacted() {
    const e164 = this.e164;
    if (e164.length <= 6) {
      return '+***';
    }
    const start = e164.slice(0, e164.length - 7);
    const end = e164.slice(-3);
    return `${start}****${end}`;
  }

  /**
   * Plain object serialization for snapshots.
   * @returns {Object}
   */
  toPlainObject() {
    return {
      e164: this.e164,
      countryCode: this.countryCode,
      callingCode: this.callingCode,
      nationalNumber: this.nationalNumber,
      extension: this.extension
    };
  }

  toJSON() {
    return this.toPlainObject();
  }

  toString() {
    return this.e164;
  }
}

module.exports = Phone;
