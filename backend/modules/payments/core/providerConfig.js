const pakistan = require('../../../config/payment-editions/pakistan.json');
const international = require('../../../config/payment-editions/international.json');
const full = require('../../../config/payment-editions/full.json');
const {
  getProviderCredentialStatus
} = require('../../../config/payment.config');

const enabled = (name, fallback = false, environment = process.env) => {
  const value = environment[name];
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const getPaymentArchitectureConfig = (environment = process.env) => {
  const credentialStatus = getProviderCredentialStatus(environment);

  return {
    edition: ['pakistan', 'international', 'full'].includes(environment.PAYMENT_EDITION)
      ? environment.PAYMENT_EDITION
      : 'pakistan',
    editionManifests: { pakistan, international, full },
    featureFlags: {
      cod: enabled('PAYMENT_PROVIDER_COD_ENABLED', true, environment),
      bank_transfer: enabled('PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED', true, environment),
      raast: enabled('PAYMENT_PROVIDER_RAAST_ENABLED', true, environment),
      jazzcash: enabled('PAYMENT_PROVIDER_JAZZCASH_ENABLED', false, environment),
      easypaisa: enabled('PAYMENT_PROVIDER_EASYPAISA_ENABLED', false, environment),
      stripe: enabled('PAYMENT_PROVIDER_STRIPE_ENABLED', false, environment)
    },
    providerConfigs: {
      cod: {},
      bank_transfer: {
        accountTitle: environment.BANK_TRANSFER_ACCOUNT_TITLE || '',
        bankName: environment.BANK_TRANSFER_BANK_NAME || '',
        publicAccountReference:
          environment.BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE || ''
      },
      raast: {
        accountTitle: environment.RAAST_ACCOUNT_TITLE || '',
        publicRaastId: environment.RAAST_PUBLIC_ID || ''
      },
      jazzcash: {
        contractApproved:
          enabled('JAZZCASH_OFFICIAL_CONTRACT_APPROVED', false, environment)
      },
      easypaisa: {
        contractApproved:
          enabled('EASYPAISA_OFFICIAL_CONTRACT_APPROVED', false, environment)
      },
      stripe: {
        credentialConfigured: credentialStatus.stripe.configured,
        publishableKey: environment.STRIPE_PUBLISHABLE_KEY || ''
      }
    }
  };
};

module.exports = {
  enabled,
  getPaymentArchitectureConfig
};
