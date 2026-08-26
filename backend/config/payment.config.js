const { AppError } = require('../utils/errors/AppError');

const isProduction = (environment = process.env) => (
  environment.NODE_ENV === 'production'
);

const validateStripeSecretKey = (
  secretKey,
  { environment = process.env } = {}
) => {
  if (!secretKey) {
    throw new AppError(
      'Stripe is not configured',
      503,
      'PAYMENT_PROVIDER_NOT_CONFIGURED'
    );
  }

  if (!isProduction(environment) && secretKey.startsWith('sk_live_')) {
    throw new AppError(
      'Live Stripe credentials are not permitted outside production',
      503,
      'PAYMENT_LIVE_CREDENTIALS_FORBIDDEN'
    );
  }

  if (isProduction(environment) && !secretKey.startsWith('sk_live_')) {
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

const getStripeConfig = ({
  requireWebhookSecret = false,
  environment = process.env
} = {}) => {
  const secretKey = validateStripeSecretKey(
    environment.STRIPE_SECRET_KEY,
    { environment }
  );
  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET;

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
    environment: isProduction(environment) ? 'production' : 'non-production'
  };
};

const getProviderCredentialStatus = (environment = process.env) => {
  let serverCredentialConfigured = false;
  try {
    validateStripeSecretKey(environment.STRIPE_SECRET_KEY, { environment });
    serverCredentialConfigured = true;
  } catch (_error) {
    serverCredentialConfigured = false;
  }

  const expectedPublishablePrefix = isProduction(environment)
    ? 'pk_live_'
    : 'pk_test_';
  const publishableKeyConfigured = typeof environment.STRIPE_PUBLISHABLE_KEY === 'string'
    && environment.STRIPE_PUBLISHABLE_KEY.startsWith(expectedPublishablePrefix);
  const webhookConfigured = typeof environment.STRIPE_WEBHOOK_SECRET === 'string'
    && environment.STRIPE_WEBHOOK_SECRET.startsWith('whsec_');

  return Object.freeze({
    management: 'environment',
    stripe: Object.freeze({
      configured: serverCredentialConfigured && publishableKeyConfigured,
      serverCredentialConfigured,
      publishableKeyConfigured,
      webhookConfigured
    }),
    jazzcash: Object.freeze({ configured: false }),
    easypaisa: Object.freeze({ configured: false })
  });
};

const isJazzCashAvailable = () => false;

module.exports = {
  getProviderCredentialStatus,
  getStripeConfig,
  isJazzCashAvailable,
  isProduction,
  validateStripeSecretKey
};
