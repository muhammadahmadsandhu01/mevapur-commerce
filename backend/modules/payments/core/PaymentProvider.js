const { AppError } = require('../../../common/errors/AppError');

const CONTRACT_VERSION = '1.0';

class PaymentProvider {
  constructor(manifest) {
    if (new.target === PaymentProvider) {
      throw new AppError(
        'PaymentProvider is an abstract contract',
        500,
        'ABSTRACT_CLASS_ERROR'
      );
    }

    this.manifest = Object.freeze({
      contractVersion: CONTRACT_VERSION,
      integrationVersion: '1.0.0',
      paymentType: 'automated',
      supportedCurrencies: ['PKR'],
      supportedCountries: [],
      capabilities: {},
      ...manifest
    });
  }

  getManifest() {
    return this.manifest;
  }

  validateConfig(_config = {}) {
    return { configured: true, reason: null };
  }

  getCapabilities() {
    return { ...this.manifest.capabilities };
  }

  evaluateEligibility({ currency = 'PKR', country = '' } = {}) {
    const currencyEligible = this.manifest.supportedCurrencies.includes(
      String(currency).toUpperCase()
    );
    const countries = this.manifest.supportedCountries;
    const countryEligible = countries.length === 0
      || countries.includes(String(country).toUpperCase());

    return {
      eligible: currencyEligible && countryEligible,
      reason: !currencyEligible
        ? 'PAYMENT_CURRENCY_UNSUPPORTED'
        : countryEligible
          ? null
          : 'PAYMENT_COUNTRY_UNSUPPORTED'
    };
  }

  getPublicMetadata(_config = {}) {
    return {
      code: this.manifest.code,
      displayName: this.manifest.displayName,
      paymentType: this.manifest.paymentType,
      capabilities: this.getCapabilities()
    };
  }

  getAdminMetadata(config = {}) {
    return this.getPublicMetadata(config);
  }

  async createPayment(_request) {
    throw this.operationUnavailable('createPayment');
  }

  async retrievePayment(_providerPaymentId) {
    throw this.operationUnavailable('retrievePayment');
  }

  async refundPayment(_request) {
    throw this.operationUnavailable('refundPayment');
  }

  async cancelPayment(_request) {
    throw this.operationUnavailable('cancelPayment');
  }

  verifyCallback(_rawBody, _signature) {
    throw this.operationUnavailable('verifyCallback');
  }

  async processCallback(_event) {
    throw this.operationUnavailable('processCallback');
  }

  operationUnavailable(operation) {
    return new AppError(
      `The ${operation} operation is unavailable for this provider`,
      409,
      'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
    );
  }
}

PaymentProvider.CONTRACT_VERSION = CONTRACT_VERSION;

module.exports = PaymentProvider;
