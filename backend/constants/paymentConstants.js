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

const SUPPORTED_PAYMENT_CURRENCIES = Object.freeze(['PKR']);

module.exports = {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  PROVIDER_ATTEMPT_STATUSES,
  WEBHOOK_PROCESSING_STATUSES,
  SUPPORTED_PAYMENT_CURRENCIES
};
