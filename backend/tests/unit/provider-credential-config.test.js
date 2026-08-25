const {
  getProviderCredentialStatus,
  getStripeConfig
} = require('../../config/payment.config');
const {
  getPaymentArchitectureConfig
} = require('../../modules/payments/core/providerConfig');
const PaymentProviderRegistry = require('../../modules/payments/core/PaymentProviderRegistry');
const cod = require('../../modules/payments/providers/cod/CodProvider');
const bankTransfer = require('../../modules/payments/providers/bank-transfer/BankTransferProvider');
const raast = require('../../modules/payments/providers/raast/RaastProvider');
const stripe = require('../../modules/payments/providers/stripe/StripeProvider');

const createRegistry = (environment) => new PaymentProviderRegistry({
  providers: [cod, bankTransfer, raast, stripe],
  ...getPaymentArchitectureConfig(environment)
});

describe('Provider credential configuration', () => {
  test('returns safe booleans without copying the Stripe server secret into registry config', () => {
    const environment = {
      NODE_ENV: 'test',
      PAYMENT_EDITION: 'full',
      PAYMENT_PROVIDER_STRIPE_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_synthetic_server_placeholder',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_synthetic_public_placeholder',
      STRIPE_WEBHOOK_SECRET: 'whsec_synthetic_webhook_placeholder'
    };

    const status = getProviderCredentialStatus(environment);
    const architecture = getPaymentArchitectureConfig(environment);

    expect(status).toEqual({
      management: 'environment',
      stripe: {
        configured: true,
        serverCredentialConfigured: true,
        publishableKeyConfigured: true,
        webhookConfigured: true
      },
      jazzcash: { configured: false },
      easypaisa: { configured: false }
    });
    expect(architecture.providerConfigs.stripe).not.toHaveProperty('secretKey');
    expect(JSON.stringify(architecture)).not.toContain(
      environment.STRIPE_SECRET_KEY
    );
  });

  test('fails closed with a safe error when enabled Stripe credentials are missing', () => {
    const environment = {
      NODE_ENV: 'test',
      PAYMENT_EDITION: 'full',
      PAYMENT_PROVIDER_STRIPE_ENABLED: 'true',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_synthetic_public_placeholder'
    };
    const registry = createRegistry(environment);

    expect(() => getStripeConfig({ environment })).toThrow(
      expect.objectContaining({
        statusCode: 503,
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED'
      })
    );
    expect(() => registry.resolve('stripe')).toThrow(
      expect.objectContaining({
        statusCode: 503,
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED'
      })
    );
  });

  test('keeps COD and configured manual methods independent of online-provider secrets', () => {
    const environment = {
      NODE_ENV: 'test',
      PAYMENT_EDITION: 'full',
      PAYMENT_PROVIDER_COD_ENABLED: 'true',
      PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED: 'true',
      PAYMENT_PROVIDER_RAAST_ENABLED: 'true',
      PAYMENT_PROVIDER_STRIPE_ENABLED: 'false',
      BANK_TRANSFER_ACCOUNT_TITLE: 'Synthetic Account',
      BANK_TRANSFER_BANK_NAME: 'Synthetic Bank',
      BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE: 'SYNTHETIC-ACCOUNT',
      RAAST_ACCOUNT_TITLE: 'Synthetic Account',
      RAAST_PUBLIC_ID: 'synthetic-raast-id'
    };
    const registry = createRegistry(environment);
    const context = { country: 'Pakistan', currency: 'PKR' };

    expect(registry.resolve('cod', context).getManifest().code).toBe('cod');
    expect(registry.resolve('bank_transfer', context).getManifest().code).toBe(
      'bank_transfer'
    );
    expect(registry.resolve('raast', context).getManifest().code).toBe('raast');
    expect(registry.describe('stripe', context).reason).toBe(
      'PAYMENT_PROVIDER_DISABLED'
    );
  });
});
