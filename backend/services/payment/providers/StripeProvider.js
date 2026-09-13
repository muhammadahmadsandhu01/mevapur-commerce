const Stripe = require('stripe');
const PaymentProvider = require('../PaymentProvider');
const { getStripeConfig } = require('../../../config/payment.config');
const { AppError } = require('../../../utils/errors/AppError');
const { PAYMENT_STATUSES } = require('../../../constants/paymentConstants');

const { Money, MoneyMapper } = require('../../../modules/commerce');

const toMinorUnits = (amount, currency = 'USD') => {
  if (typeof amount === 'object' && amount?.amountMinor !== undefined) {
    const money = MoneyMapper.toMoney(amount);
    return Number(money.amountMinor);
  }
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError('Payment amount is invalid', 422, 'PAYMENT_AMOUNT_INVALID');
    }
    const money = Money.fromLegacyNumber(amount, currency);
    return Number(money.amountMinor);
  }
  if (typeof amount === 'string') {
    const money = Money.fromDecimal(amount, currency);
    return Number(money.amountMinor);
  }
  throw new AppError('Payment amount is invalid', 422, 'PAYMENT_AMOUNT_INVALID');
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
        amount: toMinorUnits(amount, currency),
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
    currency = 'USD',
    refundId,
    paymentId,
    orderId,
    idempotencyKey
  }) {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: providerPaymentId,
        amount: toMinorUnits(amount, currency),
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

  verifyWebhookSignature(param1, param2, options = {}) {
    let rawBody;
    let signature;
    let secret;
    let toleranceSeconds = 300;
    let environment;

    if (param1 && typeof param1 === 'object' && !Buffer.isBuffer(param1)) {
      rawBody = param1.rawBody;
      signature = param1.signatureHeaders || param1.signature;
      secret = param1.secret || param1.webhookSecret;
      toleranceSeconds = param1.toleranceSeconds || param1.tolerance || 300;
      environment = param1.account?.environment || param1.environment;
    } else {
      rawBody = param1;
      signature = param2;
      secret = options.secret || options.webhookSecret;
      toleranceSeconds = options.toleranceSeconds || options.tolerance || 300;
      environment = options.account?.environment || options.environment;
    }

    if (!Buffer.isBuffer(rawBody) || !signature || typeof signature !== 'string') {
      throw new AppError(
        'Invalid Stripe webhook signature',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    // Bounded timestamp & clock skew validation
    let timestamp = null;
    const parts = signature.split(',');
    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k && k.trim() === 't') {
        timestamp = parseInt(v.trim(), 10);
      }
    }

    if (Number.isFinite(timestamp)) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds - timestamp > toleranceSeconds || timestamp - nowSeconds > toleranceSeconds) {
        throw new AppError(
          'Stripe webhook timestamp is outside acceptable tolerance',
          400,
          'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
        );
      }
    }

    let webhookSecret = secret;
    if (!webhookSecret) {
      if (this._testClientInjected || process.env.NODE_ENV === 'test') {
        webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_key_12345';
      } else {
        webhookSecret = getStripeConfig({ requireWebhookSecret: true }).webhookSecret;
      }
    }

    let event;
    try {
      if (this._stripe && this._stripe.webhooks) {
        event = this._stripe.webhooks.constructEvent(rawBody, signature, webhookSecret, toleranceSeconds);
      } else {
        event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret, toleranceSeconds);
      }
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        'Invalid Stripe webhook signature',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || !event.data?.object) {
      throw new AppError(
        'The verified webhook event is malformed',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    if (environment) {
      const isLive = Boolean(event.livemode);
      if (environment === 'production' && !isLive) {
        throw new AppError(
          'Stripe testmode event received in production environment',
          400,
          'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
        );
      }
      if (environment === 'sandbox' && isLive) {
        throw new AppError(
          'Stripe livemode event received in sandbox environment',
          400,
          'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
        );
      }
    }

    return event;
  }

  normalizeWebhookEvent(param1, options = {}) {
    let verifiedEvent;
    let account;

    if (param1 && typeof param1 === 'object' && param1.verifiedEvent) {
      verifiedEvent = param1.verifiedEvent;
      account = param1.account || {};
    } else {
      verifiedEvent = param1;
      account = options.account || options || {};
    }

    if (!verifiedEvent || typeof verifiedEvent.id !== 'string' || typeof verifiedEvent.type !== 'string') {
      throw new AppError(
        'Invalid webhook event for normalization',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    const obj = verifiedEvent.data?.object || {};
    const isRefund = typeof verifiedEvent.type === 'string' && verifiedEvent.type.startsWith('refund.');

    return {
      providerEventId: String(verifiedEvent.id),
      eventType: String(verifiedEvent.type),
      providerPaymentId: isRefund ? String(obj.payment_intent || '') : String(obj.id || ''),
      providerRefundId: isRefund ? String(obj.id || '') : '',
      amountMinor: Number(obj.amount || obj.amount_received || 0),
      currency: typeof obj.currency === 'string' ? obj.currency.toUpperCase() : '',
      livemode: Boolean(verifiedEvent.livemode),
      environment: verifiedEvent.livemode ? 'production' : (account.environment || 'sandbox'),
      eventCreatedAt: verifiedEvent.created ? new Date(verifiedEvent.created * 1000) : new Date(),
      normalizedObjectType: String(obj.object || ''),
      proposedStatus: this.mapStatus(obj.status),
      rawObjectStatus: typeof obj.status === 'string' ? obj.status : '',
      metadata: {
        paymentId: String(obj.metadata?.paymentId || ''),
        orderId: String(obj.metadata?.orderId || ''),
        refundId: String(obj.metadata?.refundId || '')
      }
    };
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
