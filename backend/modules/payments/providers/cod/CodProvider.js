const PaymentProvider = require('../../core/PaymentProvider');

class CodProvider extends PaymentProvider {
  constructor() {
    super({
      code: 'cod',
      displayName: 'Cash on Delivery',
      integrationVersion: '1.0.0',
      paymentType: 'offline',
      supportedCountries: ['PK', 'PAKISTAN'],
      capabilities: {
        createPayment: true,
        status: true,
        collect: true,
        cancel: true,
        refund: false,
        callback: false,
        customerConfirmation: false
      }
    });
  }

  async createPayment({ paymentId }) {
    return {
      providerPaymentId: `COD-${paymentId}`,
      status: 'Pending'
    };
  }

  async retrievePayment() {
    return { status: 'Pending' };
  }
}

module.exports = new CodProvider();
