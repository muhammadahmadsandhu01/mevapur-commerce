const PAYMENT_PROVIDERS = Object.freeze({
  COD: 'cod',
  BANK_TRANSFER: 'bank_transfer',
  RAAST: 'raast',
  STRIPE: 'stripe',
  JAZZCASH: 'jazzcash',
  EASYPAISA: 'easypaisa'
});

const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'Pending',
  AWAITING_CUSTOMER_PAYMENT: 'AwaitingCustomerPayment',
  AWAITING_VERIFICATION: 'AwaitingVerification',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  PARTIALLY_REFUNDED: 'PartiallyRefunded',
  REFUNDED: 'Refunded'
});

const REFUND_STATUSES = Object.freeze({
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled'
});

const PROVIDER_ATTEMPT_STATUSES = Object.freeze({
  UNCLAIMED: 'Unclaimed',
  CLAIMED: 'Claimed',
  READY: 'Ready',
  FAILED: 'Failed'
});

const WEBHOOK_PROCESSING_STATUSES = Object.freeze({
  RECEIVED: 'Received',
  PROCESSING: 'Processing',
  PROCESSED: 'Processed',
  IGNORED: 'Ignored',
  FAILED: 'Failed'
});

const { CurrencyRegistry } = require('../modules/commerce');

/**
 * Valid active commercial currencies per ISO 4217 registry.
 */
const VALID_COMMERCE_CURRENCIES = Object.freeze(
  CurrencyRegistry.listActiveCommercial().map((c) => c.code)
);

/**
 * Supported currencies per payment provider adapter.
 * Note: Provider enablement and availability remain subject to MarketConfig, merchant activation, and runtime configuration.
 */
const PROVIDER_SUPPORTED_CURRENCIES = Object.freeze({
  [PAYMENT_PROVIDERS.COD]: Object.freeze(['PKR']),
  [PAYMENT_PROVIDERS.BANK_TRANSFER]: Object.freeze(['PKR']),
  [PAYMENT_PROVIDERS.RAAST]: Object.freeze(['PKR']),
  [PAYMENT_PROVIDERS.JAZZCASH]: Object.freeze(['PKR']),
  [PAYMENT_PROVIDERS.EASYPAISA]: Object.freeze(['PKR']),
  [PAYMENT_PROVIDERS.STRIPE]: VALID_COMMERCE_CURRENCIES
});

/**
 * Alias retained for backward compatibility.
 */
const SUPPORTED_PAYMENT_CURRENCIES = VALID_COMMERCE_CURRENCIES;

module.exports = {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  PROVIDER_ATTEMPT_STATUSES,
  WEBHOOK_PROCESSING_STATUSES,
  VALID_COMMERCE_CURRENCIES,
  PROVIDER_SUPPORTED_CURRENCIES,
  SUPPORTED_PAYMENT_CURRENCIES
};
