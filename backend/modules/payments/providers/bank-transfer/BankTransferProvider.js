const PaymentProvider = require('../../core/PaymentProvider');

class BankTransferProvider extends PaymentProvider {
  constructor() {
    super({
      code: 'bank_transfer',
      displayName: 'Bank Transfer',
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
        manualReview: true
      }
    });
  }

  validateConfig(config = {}) {
    const configured = Boolean(
      config.accountTitle
      && config.bankName
      && config.publicAccountReference
    );
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
      merchantAccountConfigured: this.validateConfig(config).configured
    };
  }

  instructions(config = {}) {
    if (!this.validateConfig(config).configured) return null;
    return {
      kind: 'bank_transfer',
      accountTitle: config.accountTitle,
      bankName: config.bankName,
      accountReference: config.publicAccountReference,
      message:
        'Transfer the exact order total, then submit your transaction reference for verification.'
    };
  }

  async createPayment({ paymentId, providerConfig = {} }) {
    return {
      providerPaymentId: `BANK-${paymentId}`,
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

module.exports = new BankTransferProvider();
