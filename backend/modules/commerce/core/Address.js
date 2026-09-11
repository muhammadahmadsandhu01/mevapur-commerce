/**
 * @file Address.js
 * @description Global Normalized Immutable Address Value Object.
 * Enforces ISO 3166-1 alpha-2 validation, Unicode NFC normalization, control character rejection,
 * country-aware administrative area and postal code requirements, and PII-safe error boundaries.
 */

const CountryRegistry = require('../registries/countryRegistry');
const CommerceError = require('./CommerceError');

/**
 * Control characters, zero-width spaces, and directional override characters
 */
const FORBIDDEN_CHARACTERS_REGEX = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\u202A-\u202E]/;

/**
 * Normalizes and cleans address string inputs.
 * @param {string} input
 * @param {number} maxLength
 * @returns {string}
 */
function cleanText(input, maxLength = 300) {
  if (typeof input !== 'string') return '';
  const normalized = input.normalize('NFC').trim();
  if (FORBIDDEN_CHARACTERS_REGEX.test(normalized)) {
    throw CommerceError.addressValidationError('Address contains forbidden control or invisible characters');
  }
  return normalized.slice(0, maxLength);
}

class Address {
  /**
   * Internal constructor. Use Address.create().
   * @private
   */
  constructor({
    fullName,
    addressLine1,
    addressLine2 = '',
    locality,
    administrativeArea = '',
    postalCode = '',
    countryCode,
    phone = ''
  }) {
    this.fullName = fullName;
    this.addressLine1 = addressLine1;
    this.addressLine2 = addressLine2;
    this.locality = locality;
    this.administrativeArea = administrativeArea;
    this.postalCode = postalCode;
    this.countryCode = countryCode;
    this.phone = phone;

    Object.freeze(this);
  }

  /**
   * Create and validate a normalized Address instance.
   * @param {Object} input
   * @param {string} input.fullName
   * @param {string} input.addressLine1
   * @param {string} [input.addressLine2]
   * @param {string} input.locality - City / Town / Locality
   * @param {string} [input.administrativeArea] - State / Province / Emirate / Region
   * @param {string} [input.postalCode]
   * @param {string} input.countryCode - ISO 3166-1 alpha-2
   * @param {string} [input.phone]
   * @returns {Address}
   */
  static create(input) {
    if (!input || typeof input !== 'object') {
      throw CommerceError.addressValidationError('Address input must be an object');
    }

    const countryCode = CountryRegistry.normalizeCode(input.countryCode || input.country);
    if (!countryCode) {
      throw CommerceError.addressValidationError('Country code is required');
    }

    const countryMeta = CountryRegistry.getCountry(countryCode);

    const fullName = cleanText(input.fullName, 100);
    if (!fullName || fullName.length < 2) {
      throw CommerceError.addressValidationError('Full name is required (minimum 2 characters)');
    }

    const addressLine1 = cleanText(input.addressLine1 || input.address, 300);
    if (!addressLine1 || addressLine1.length < 5) {
      throw CommerceError.addressValidationError('Address line 1 is required (minimum 5 characters)');
    }

    const addressLine2 = cleanText(input.addressLine2, 200);

    const locality = cleanText(input.locality || input.city, 100);
    if (!locality || locality.length < 1) {
      throw CommerceError.addressValidationError('Locality / City is required');
    }

    const administrativeArea = cleanText(
      input.administrativeArea || input.province || input.state || input.region,
      100
    );
    if (countryMeta.administrativeAreaRequirement === 'required' && !administrativeArea) {
      const areaType = countryMeta.administrativeAreaType || 'administrative area';
      throw CommerceError.addressValidationError(
        `Administrative area (${areaType}) is required for country ${countryMeta.code}`
      );
    }

    const postalCode = cleanText(input.postalCode || input.zip, 20);
    if (countryMeta.postalCodeRequirement === 'required' && !postalCode) {
      throw CommerceError.addressValidationError(
        `Postal code is required for country ${countryMeta.code}`
      );
    }

    const phone = typeof input.phone === 'string' ? cleanText(input.phone, 30) : '';

    return new Address({
      fullName,
      addressLine1,
      addressLine2,
      locality,
      administrativeArea,
      postalCode,
      countryCode: countryMeta.code,
      phone
    });
  }

  /**
   * Export immutable snapshot for order snapshots or DTO serialization.
   * @returns {Object}
   */
  toPlainObject() {
    return {
      fullName: this.fullName,
      addressLine1: this.addressLine1,
      addressLine2: this.addressLine2,
      locality: this.locality,
      administrativeArea: this.administrativeArea,
      postalCode: this.postalCode,
      countryCode: this.countryCode,
      phone: this.phone
    };
  }

  toJSON() {
    return this.toPlainObject();
  }
}

module.exports = Address;
