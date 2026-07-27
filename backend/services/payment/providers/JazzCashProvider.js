const crypto = require('crypto');
const PaymentProvider = require('../PaymentProvider');
const { AppError } = require('../../../errors/AppError');
const axios = require('axios');

class JazzCashProvider extends PaymentProvider {
  constructor() {
    super('jazzcash');
    this.merchantId = process.env.JAZZCASH_MERCHANT_ID;
    this.password = process.env.JAZZCASH_PASSWORD;
    this.integritySalt = process.env.JAZZCASH_INTEGERITY_SALT;
    this.baseUrl = 'https://sandbox.jazzcash.com.pk/Api/2.0/Production/'; // Change for prod
  }

  async createPayment(amount, currency, orderId, customerId, metadata) {
    // Implement JazzCash Create Request here
    // Return { providerId, redirectUrl, status, rawResponse }
    throw new AppError('JazzCash implementation pending', 501, 'FEATURE_NOT_IMPLEMENTED');
  }

  async verifyPayment(txnRef) {
    // Implement Query API
    throw new AppError('JazzCash implementation pending', 501, 'FEATURE_NOT_IMPLEMENTED');
  }

  async refundPayment(transactionId, amount, reason) {
    // Implement Refund API
    throw new AppError('JazzCash implementation pending', 501, 'FEATURE_NOT_IMPLEMENTED');
  }

  async cancelPayment(paymentIntentId) {
    // JazzCash might not support direct cancel, handle via timeout
    return { status: 'Cancelled' };
  }

  async getPaymentStatus(txnRef) {
    throw new AppError('JazzCash implementation pending', 501, 'FEATURE_NOT_IMPLEMENTED');
  }

  verifyWebhookSignature(rawBody, signature) {
    // Implement HMAC SHA256 verification for JazzCash
    const expectedHash = crypto
      .createHmac('sha256', this.integritySalt)
      .update(rawBody)
      .digest('hex')
      .toUpperCase();
    
    if (signature !== expectedHash) {
      throw new AppError('Invalid JazzCash webhook signature', 400, 'WEBHOOK_VERIFICATION_FAILED');
    }
    return JSON.parse(rawBody);
  }
}

module.exports = new JazzCashProvider();