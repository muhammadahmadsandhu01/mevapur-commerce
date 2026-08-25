const legacyStripeProvider = require('../../../../services/payment/providers/StripeProvider');

const manifest = Object.freeze({
  code: 'stripe',
  displayName: 'Card / Stripe',
  contractVersion: '1.0',
  integrationVersion: '2.0.0',
  paymentType: 'automated',
  supportedCurrencies: ['PKR'],
  supportedCountries: [],
  capabilities: {
    createPayment: true,
    status: true,
    collect: false,
    cancel: false,
    refund: true,
    callback: true,
    customerConfirmation: false
  }
});

legacyStripeProvider.getManifest = () => manifest;
legacyStripeProvider.getCapabilities = () => ({ ...manifest.capabilities });
legacyStripeProvider.validateConfig = (config = {}) => {
  const configured = config.credentialConfigured === true;
  return {
    configured,
    reason: configured ? null : 'PAYMENT_PROVIDER_NOT_CONFIGURED'
  };
};
legacyStripeProvider.evaluateEligibility = ({ currency = 'PKR' } = {}) => ({
  eligible: String(currency).toUpperCase() === 'PKR',
  reason: String(currency).toUpperCase() === 'PKR'
    ? null
    : 'PAYMENT_CURRENCY_UNSUPPORTED'
});
legacyStripeProvider.getPublicMetadata = (config = {}) => ({
  code: manifest.code,
  displayName: manifest.displayName,
  paymentType: manifest.paymentType,
  capabilities: { ...manifest.capabilities },
  publishableKey: /^pk_(test|live)_/.test(config.publishableKey || '')
    ? config.publishableKey
    : ''
});
legacyStripeProvider.getAdminMetadata = (config = {}) => ({
  code: manifest.code,
  displayName: manifest.displayName,
  paymentType: manifest.paymentType,
  capabilities: { ...manifest.capabilities },
  credentialConfigured: legacyStripeProvider.validateConfig(config).configured
});
legacyStripeProvider.verifyCallback = (...args) => (
  legacyStripeProvider.verifyWebhookSignature(...args)
);

module.exports = legacyStripeProvider;
