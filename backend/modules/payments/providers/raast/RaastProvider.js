const PaymentProvider = require('../../core/PaymentProvider');

class RaastProvider extends PaymentProvider {
  constructor() {
    super({
      code: 'raast',
      displayName: 'Raast Transfer',
      integrationVersion: '1.0.0',
      paymentType: 'manual',
      supportedCountries: ['PK', 'PAKISTAN'],
      capabilities: {
        createPayment: true,
        status: true,
        collect: false,
        cancel: true,
        refund: false,
        callback: false,
        customerConfirmation: true,
        manualReview: true,
        automatedIntegration: false
      }
    });
  }

  validateConfig(config = {}) {
    const configured = Boolean(config.accountTitle && config.publicRaastId);
    return {
      configured,
      reason: configured ? null : 'PAYMENT_PROVIDER_NOT_CONFIGURED'
    };
  }

  getPublicMetadata(config = {}) {
    return {
      ...super.getPublicMetadata(config),
      instructions: this.instructions(config)
    };
  }

  getAdminMetadata(config = {}) {
    return {
      ...super.getAdminMetadata(config),
      merchantAccountConfigured: this.validateConfig(config).configured,
      automatedIntegration: false
    };
  }

  instructions(config = {}) {
    if (!this.validateConfig(config).configured) return null;
    return {
      kind: 'raast',
      accountTitle: config.accountTitle,
      raastId: config.publicRaastId,
      message:
        'Send the exact order total using Raast, then submit the transaction reference for verification.'
    };
  }

  async createPayment({ paymentId, providerConfig = {} }) {
    return {
      providerPaymentId: `RAAST-${paymentId}`,
      status: 'AwaitingCustomerPayment',
      customerAction: this.instructions(providerConfig)
    };
  }

  async retrievePayment(_providerPaymentId, { providerConfig = {} } = {}) {
    return {
      status: 'AwaitingCustomerPayment',
      customerAction: this.instructions(providerConfig)
    };
  }
}

module.exports = new RaastProvider();
