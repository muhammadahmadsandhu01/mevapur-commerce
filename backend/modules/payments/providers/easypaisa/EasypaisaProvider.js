const PaymentProvider = require('../../core/PaymentProvider');
const { AppError } = require('../../../../common/errors/AppError');

const unavailable = () => {
  throw new AppError(
    'Easypaisa activation requires an approved official provider contract',
    503,
    'PAYMENT_PROVIDER_NOT_CONFIGURED'
  );
};

class EasypaisaProvider extends PaymentProvider {
  constructor() {
    super({
      code: 'easypaisa',
      displayName: 'Easypaisa',
      integrationVersion: '0.1.0-dormant',
      paymentType: 'automated',
      supportedCountries: ['PK', 'PAKISTAN'],
      capabilities: {
        createPayment: false,
        status: false,
        refund: false,
        callback: false
      }
    });
  }

  validateConfig() {
    return {
      configured: false,
      reason: 'PAYMENT_PROVIDER_NOT_CONFIGURED'
    };
  }

  getAdminMetadata() {
    return {
      ...super.getAdminMetadata(),
      activationState: 'awaiting_official_contract'
    };
  }

  async createPayment() { return unavailable(); }
  async retrievePayment() { return unavailable(); }
  async refundPayment() { return unavailable(); }
  verifyCallback() { return unavailable(); }
}

module.exports = new EasypaisaProvider();
