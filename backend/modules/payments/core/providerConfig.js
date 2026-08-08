const pakistan = require('../../../config/payment-editions/pakistan.json');
const international = require('../../../config/payment-editions/international.json');
const full = require('../../../config/payment-editions/full.json');

const enabled = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const getPaymentArchitectureConfig = () => ({
  edition: ['pakistan', 'international', 'full'].includes(process.env.PAYMENT_EDITION)
    ? process.env.PAYMENT_EDITION
    : 'pakistan',
  editionManifests: { pakistan, international, full },
  featureFlags: {
    cod: enabled('PAYMENT_PROVIDER_COD_ENABLED', true),
    bank_transfer: enabled('PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED', true),
    raast: enabled('PAYMENT_PROVIDER_RAAST_ENABLED', true),
    jazzcash: enabled('PAYMENT_PROVIDER_JAZZCASH_ENABLED', false),
    easypaisa: enabled('PAYMENT_PROVIDER_EASYPAISA_ENABLED', false),
    stripe: enabled('PAYMENT_PROVIDER_STRIPE_ENABLED', false)
  },
  providerConfigs: {
    cod: {},
    bank_transfer: {
      accountTitle: process.env.BANK_TRANSFER_ACCOUNT_TITLE || '',
      bankName: process.env.BANK_TRANSFER_BANK_NAME || '',
      publicAccountReference:
        process.env.BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE || ''
    },
    raast: {
      accountTitle: process.env.RAAST_ACCOUNT_TITLE || '',
      publicRaastId: process.env.RAAST_PUBLIC_ID || ''
    },
    jazzcash: {
      contractApproved:
        enabled('JAZZCASH_OFFICIAL_CONTRACT_APPROVED', false)
    },
    easypaisa: {
      contractApproved:
        enabled('EASYPAISA_OFFICIAL_CONTRACT_APPROVED', false)
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    }
  }
});

module.exports = {
  enabled,
  getPaymentArchitectureConfig
};
