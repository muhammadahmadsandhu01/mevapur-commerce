const { AppError } = require('../../errors/AppError');

/**
 * Abstract Base Class for Payment Providers
 * All providers (Stripe, JazzCash, etc.) must implement these methods
 */
class PaymentProvider {
  constructor(name) {
    if (this.constructor === PaymentProvider) {
      throw new AppError('PaymentProvider is an abstract class', 500, 'ABSTRACT_CLASS_ERROR');
    }
    this.name = name;
  }

  async createPayment(amount, currency, orderId, customerId, metadata) {
    throw new AppError('Method createPayment() must be implemented', 500, 'METHOD_NOT_IMPLEMENTED');
  }

  async verifyPayment(paymentIntentId) {
    throw new AppError('Method verifyPayment() must be implemented', 500, 'METHOD_NOT_IMPLEMENTED');
  }

  async capturePayment(paymentIntentId) {
    throw new AppError('Method capturePayment() must be implemented', 500, 'METHOD_NOT_IMPLEMENTED');
  }

  async refundPayment(transactionId, amount, reason) {
    throw new AppError('Method refundPayment() must be implemented', 500, 'METHOD_NOT_IMPLEMENTED');
  }

  async cancelPayment(paymentIntentId) {
    throw new AppError('Method cancelPayment() must be implemented', 500, 'METHOD_NOT_IMPLEMENTED');
  }

  async getPaymentStatus(paymentIntentId) {
    throw new AppError('Method getPaymentStatus() must be implemented', 500, 'METHOD_NOT_IMPLEMENTED');
  }

  verifyWebhookSignature(rawBody, signature) {
    throw new AppError('Method verifyWebhookSignature() must be implemented', 500, 'METHOD_NOT_IMPLEMENTED');
  }
}

module.exports = PaymentProvider;