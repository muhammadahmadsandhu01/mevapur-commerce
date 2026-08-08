const { AppError } = require('../../utils/errors/AppError');

class PaymentProvider {
  constructor(name) {
    if (this.constructor === PaymentProvider) {
      throw new AppError(
        'PaymentProvider is an abstract class',
        500,
        'ABSTRACT_CLASS_ERROR'
      );
    }
    this.name = name;
  }

  async createPayment(_request) {
    throw new AppError(
      'Payment creation is not implemented for this provider',
      501,
      'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
    );
  }

  async retrievePayment(_providerPaymentId) {
    throw new AppError(
      'Payment retrieval is not implemented for this provider',
      501,
      'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
    );
  }

  async refundPayment(_request) {
    throw new AppError(
      'Refund creation is not implemented for this provider',
      501,
      'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
    );
  }

  verifyWebhookSignature(_rawBody, _signature) {
    throw new AppError(
      'Webhook verification is not implemented for this provider',
      501,
      'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
    );
  }
}

module.exports = PaymentProvider;
