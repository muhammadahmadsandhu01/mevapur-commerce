const { AppError } = require('../utils/errors/AppError');

const isProduction = () => process.env.NODE_ENV === 'production';

const validateStripeSecretKey = (secretKey) => {
  if (!secretKey) {
    throw new AppError(
      'Stripe is not configured',
      503,
      'PAYMENT_PROVIDER_NOT_CONFIGURED'
    );
  }

  if (!isProduction() && secretKey.startsWith('sk_live_')) {
    throw new AppError(
      'Live Stripe credentials are not permitted outside production',
      503,
      'PAYMENT_LIVE_CREDENTIALS_FORBIDDEN'
    );
  }

  if (isProduction() && !secretKey.startsWith('sk_live_')) {
    throw new AppError(
      'Stripe credential mode does not match the production environment',
      503,
      'PAYMENT_CREDENTIAL_MODE_MISMATCH'
    );
  }

  if (
    !secretKey.startsWith('sk_test_')
    && !secretKey.startsWith('sk_live_')
  ) {
    throw new AppError(
      'Stripe credentials are not valid for this environment',
      503,
      'PAYMENT_PROVIDER_NOT_CONFIGURED'
    );
  }

  return secretKey;
};

const getStripeConfig = ({ requireWebhookSecret = false } = {}) => {
  const secretKey = validateStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (requireWebhookSecret && !webhookSecret) {
    throw new AppError(
      'Stripe webhook verification is not configured',
      503,
      'PAYMENT_WEBHOOK_NOT_CONFIGURED'
    );
  }
  if (
    requireWebhookSecret
    && !webhookSecret.startsWith('whsec_')
  ) {
    throw new AppError(
      'Stripe webhook verification is not configured',
      503,
      'PAYMENT_WEBHOOK_NOT_CONFIGURED'
    );
  }

  return {
    secretKey,
    webhookSecret,
    environment: isProduction() ? 'production' : 'non-production'
  };
};

const isJazzCashAvailable = () => false;

module.exports = {
  getStripeConfig,
  isJazzCashAvailable,
  isProduction,
  validateStripeSecretKey
};
