const Stripe = require('stripe');
const PaymentProvider = require('../PaymentProvider');
const { getStripeConfig } = require('../../../config/payment.config');
const { AppError } = require('../../../utils/errors/AppError');
const { PAYMENT_STATUSES } = require('../../../constants/paymentConstants');

const toMinorUnits = (amount) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Payment amount is invalid', 422, 'PAYMENT_AMOUNT_INVALID');
  }

  return Math.round((amount + Number.EPSILON) * 100);
};

const sanitizeProviderFailure = () => (
  new AppError('The payment provider could not complete the request', 502, 'PAYMENT_PROVIDER_ERROR')
);

class StripeProvider extends PaymentProvider {
  constructor() {
    super('stripe');
    this._stripe = null;
    this._testClientInjected = false;
  }

  get stripe() {
    if (!this._stripe) {
      const { secretKey } = getStripeConfig();
      this._stripe = new Stripe(secretKey);
    }
    return this._stripe;
  }

  setClientForTests(client) {
    if (process.env.NODE_ENV !== 'test') {
      throw new AppError(
        'A test provider client can only be injected in the test environment',
        500,
        'PAYMENT_TEST_CLIENT_FORBIDDEN'
      );
    }
    this._stripe = client;
    this._testClientInjected = true;
  }

  resetClientForTests() {
    if (this._testClientInjected) {
      this._stripe = null;
      this._testClientInjected = false;
    }
  }

  async createPayment({
    amount,
    currency,
    paymentId,
    orderId,
    environment,
    idempotencyKey
  }) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: toMinorUnits(amount),
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          paymentId: String(paymentId),
          orderId: String(orderId),
          environment
        }
      }, {
        idempotencyKey
      });

      return this.toSafePaymentResult(paymentIntent);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw sanitizeProviderFailure();
    }
  }

  async retrievePayment(providerPaymentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(providerPaymentId);
      return this.toSafePaymentResult(paymentIntent);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw sanitizeProviderFailure();
    }
  }

  async refundPayment({
    providerPaymentId,
    amount,
    refundId,
    paymentId,
    orderId,
    idempotencyKey
  }) {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: providerPaymentId,
        amount: toMinorUnits(amount),
        metadata: {
          refundId: String(refundId),
          paymentId: String(paymentId),
          orderId: String(orderId)
        }
      }, {
        idempotencyKey
      });

      return {
        providerRefundId: refund.id,
        status: refund.status
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw sanitizeProviderFailure();
    }
  }

  verifyWebhookSignature(rawBody, signature) {
    if (!Buffer.isBuffer(rawBody) || !signature) {
      throw new AppError(
        'Invalid Stripe webhook signature',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    const { webhookSecret } = getStripeConfig({ requireWebhookSecret: true });

    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (_error) {
      throw new AppError(
        'Invalid Stripe webhook signature',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }
  }

  toSafePaymentResult(paymentIntent) {
    return {
      providerPaymentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret || null,
      status: this.mapStatus(paymentIntent.status),
      amountMinor: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: {
        paymentId: paymentIntent.metadata?.paymentId || '',
        orderId: paymentIntent.metadata?.orderId || '',
        environment: paymentIntent.metadata?.environment || ''
      }
    };
  }

  mapStatus(stripeStatus) {
    const statusMap = {
      requires_payment_method: PAYMENT_STATUSES.PENDING,
      requires_confirmation: PAYMENT_STATUSES.PROCESSING,
      requires_action: PAYMENT_STATUSES.PROCESSING,
      processing: PAYMENT_STATUSES.PROCESSING,
      succeeded: PAYMENT_STATUSES.COMPLETED,
      canceled: PAYMENT_STATUSES.CANCELLED
    };

    return statusMap[stripeStatus] || PAYMENT_STATUSES.PENDING;
  }
}

module.exports = new StripeProvider();
module.exports.toMinorUnits = toMinorUnits;
