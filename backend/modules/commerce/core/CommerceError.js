const { AppError } = require('../../../common/errors/AppError');

class CommerceError extends AppError {
  constructor(message, code = 'COMMERCE_ERROR', statusCode = 400, details = []) {
    super(message, statusCode, code, details);
    this.name = 'CommerceError';
  }

  static currencyUnknown(currency) {
    const sanitized = String(currency || '').slice(0, 10).replace(/[^A-Za-z0-9_-]/g, '');
    return new CommerceError(
      `Unknown or unsupported currency code: ${sanitized || 'EMPTY'}`,
      'COMMERCE_CURRENCY_UNKNOWN',
      400
    );
  }

  static currencyDeprecated(currency) {
    const sanitized = String(currency || '').slice(0, 10).replace(/[^A-Za-z0-9_-]/g, '');
    return new CommerceError(
      `Currency code is deprecated and not permitted for new transactions: ${sanitized}`,
      'COMMERCE_CURRENCY_DEPRECATED',
      400
    );
  }

  static currencyNonCommercial(currency) {
    const sanitized = String(currency || '').slice(0, 10).replace(/[^A-Za-z0-9_-]/g, '');
    return new CommerceError(
      `Currency code is non-commercial/special-purpose and not eligible for standard checkout: ${sanitized}`,
      'COMMERCE_CURRENCY_NON_COMMERCIAL',
      400
    );
  }

  static currencyMismatch(expected, actual) {
    return new CommerceError(
      `Currency mismatch: cannot operate between ${expected} and ${actual}`,
      'COMMERCE_CURRENCY_MISMATCH',
      400
    );
  }

  static moneyInvalidAmount(reason = 'Invalid monetary amount representation') {
    return new CommerceError(reason, 'COMMERCE_MONEY_INVALID_AMOUNT', 400);
  }

  static moneyRoundingRequired(reason = 'Lossy monetary operation requires an explicit rounding mode') {
    return new CommerceError(reason, 'COMMERCE_ROUNDING_REQUIRED', 400);
  }

  static moneyNegativeNotAllowed() {
    return new CommerceError(
      'Negative monetary amounts are not permitted in standard commercial context',
      'COMMERCE_MONEY_NEGATIVE_NOT_ALLOWED',
      400
    );
  }

  static moneyAllocationError(reason = 'Monetary allocation failed') {
    return new CommerceError(reason, 'COMMERCE_MONEY_ALLOCATION_ERROR', 400);
  }

  static countryUnknown(country) {
    const sanitized = String(country || '').slice(0, 10).replace(/[^A-Za-z0-9_-]/g, '');
    return new CommerceError(
      `Unknown or unsupported ISO 3166-1 alpha-2 country code: ${sanitized || 'EMPTY'}`,
      'COMMERCE_COUNTRY_UNKNOWN',
      400
    );
  }

  static addressValidationError(message, details = []) {
    return new CommerceError(message, 'COMMERCE_ADDRESS_VALIDATION_ERROR', 400, details);
  }

  static phoneInvalidError(message = 'Invalid phone number format or country code') {
    return new CommerceError(message, 'COMMERCE_PHONE_INVALID_ERROR', 400);
  }
}

module.exports = CommerceError;
