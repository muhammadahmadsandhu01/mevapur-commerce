export type PaymentProvider =
  | 'cod'
  | 'bank_transfer'
  | 'raast'
  | 'jazzcash'
  | 'easypaisa'
  | 'stripe'
  | string;

export type PaymentStatus =
  | 'Pending'
  | 'AwaitingCustomerPayment'
  | 'AwaitingVerification'
  | 'Processing'
  | 'Completed'
  | 'Rejected'
  | 'Failed'
  | 'Expired'
  | 'Cancelled'
  | 'PartiallyRefunded'
  | 'Refunded';

export interface AdminPaymentSummary {
  _id: string;
  order: string;
  provider: PaymentProvider;
  providerDisplayName: string;
  providerIntegrationVersion: string;
  paymentType: 'offline' | 'manual' | 'automated' | 'historical';
  capabilities: Record<string, boolean>;
  providerPaymentId: string;
  safeProviderReference: string;
  customerReferenceMasked?: string;
  status: PaymentStatus;
  amount: number;
  currency: 'PKR';
  paidAmount: number;
  refundedAmount: number;
  createdAt: string;
}

export interface AdminProviderStatus {
  code: PaymentProvider;
  displayName: string;
  installed: boolean;
  included: boolean;
  enabled: boolean;
  configured: boolean;
  eligible: boolean;
  available: boolean;
  reason?: string | null;
  paymentType: string;
  integrationVersion: string;
  metadata: Record<string, unknown>;
}
