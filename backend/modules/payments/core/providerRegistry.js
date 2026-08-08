const PaymentProviderRegistry = require('./PaymentProviderRegistry');
const { getPaymentArchitectureConfig } = require('./providerConfig');
const cod = require('../providers/cod/CodProvider');
const bankTransfer = require('../providers/bank-transfer/BankTransferProvider');
const raast = require('../providers/raast/RaastProvider');
const jazzCash = require('../providers/jazzcash/JazzCashProvider');
const easypaisa = require('../providers/easypaisa/EasypaisaProvider');
const stripe = require('../providers/stripe/StripeProvider');

const providers = [
  cod,
  bankTransfer,
  raast,
  jazzCash,
  easypaisa,
  stripe
];

const createRegistry = (overrides = {}) => {
  const config = getPaymentArchitectureConfig();
  return new PaymentProviderRegistry({
    providers,
    ...config,
    ...overrides
  });
};

module.exports = createRegistry();
module.exports.createRegistry = createRegistry;
module.exports.installedProviders = providers;
