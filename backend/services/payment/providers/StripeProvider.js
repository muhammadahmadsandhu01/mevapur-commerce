const Stripe = require('stripe');
const PaymentProvider = require('../PaymentProvider');
const { AppError } = require('../../../errors/AppError');

class StripeProvider extends PaymentProvider {
  constructor() {
    super('stripe');
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  async createPayment(amount, currency, orderId, customerId, metadata) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe expects smallest currency unit
        currency: currency.toLowerCase(),
        metadata: {
          orderId,
          customerId
        },
        automatic_payment_methods: { enabled: true },
        ...metadata
      });

      return {
        providerId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: this.mapStatus(paymentIntent.status),
        rawResponse: paymentIntent
      };
    } catch (error) {
      throw new AppError(`Stripe Error: ${error.message}`, 400, 'PAYMENT_PROVIDER_ERROR');
    }
  }

  async verifyPayment(paymentIntentId) {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return {
      status: this.mapStatus(paymentIntent.status),
      amount: paymentIntent.amount / 100,
      rawResponse: paymentIntent
    };
  }

  async capturePayment(paymentIntentId) {
    const paymentIntent = await this.stripe.paymentIntents.capture(paymentIntentId);
    return { status: this.mapStatus(paymentIntent.status), rawResponse: paymentIntent };
  }

  async refundPayment(transactionId, amount, reason) {
    const params = { payment_intent: transactionId };
    if (amount) params.amount = Math.round(amount * 100);
    if (reason) params.reason = reason;

    const refund = await this.stripe.refunds.create(params);
    return { status: refund.status, transactionId: refund.id, rawResponse: refund };
  }

  async cancelPayment(paymentIntentId) {
    const paymentIntent = await this.stripe.paymentIntents.cancel(paymentIntentId);
    return { status: this.mapStatus(paymentIntent.status), rawResponse: paymentIntent };
  }

  async getPaymentStatus(paymentIntentId) {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return this.mapStatus(paymentIntent.status);
  }

  verifyWebhookSignature(rawBody, signature) {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const event = this.stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
      return event;
    } catch (error) {
      throw new AppError('Invalid Stripe webhook signature', 400, 'WEBHOOK_VERIFICATION_FAILED');
    }
  }

  mapStatus(stripeStatus) {
    const map = {
      'requires_payment_method': 'Failed',
      'requires_confirmation': 'Processing',
      'requires_action': 'RequiresAction',
      'processing': 'Processing',
      'succeeded': 'Completed',
      'canceled': 'Cancelled'
    };
    return map[stripeStatus] || 'Pending';
  }
}

module.exports = new StripeProvider();