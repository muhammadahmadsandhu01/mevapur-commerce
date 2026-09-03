import api from '@/lib/api';

export type PaymentProvider =
  | 'cod'
  | 'bank_transfer'
  | 'raast'
  | 'jazzcash'
  | 'easypaisa'
  | 'stripe';

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

export interface CreatePaymentRequest {
  orderId: string;
  provider: PaymentProvider;
}

export interface PaymentCustomerAction {
  kind: 'bank_transfer' | 'raast';
  accountTitle: string;
  message: string;
  bankName?: string;
  accountReference?: string;
  raastId?: string;
}

export interface PaymentSummary {
  _id: string;
  order: string;
  provider: PaymentProvider;
  providerDisplayName: string;
  providerIntegrationVersion: string;
  paymentType: 'offline' | 'manual' | 'automated' | 'historical';
  capabilities: Record<string, boolean>;
  providerPaymentId: string;
  safeProviderReference: string;
  customerAction?: PaymentCustomerAction | null;
  customerReferenceMasked?: string;
  customerSubmittedAt?: string | null;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paidAmount: number;
  refundedAmount: number;
  completedAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
}

export interface AvailablePaymentMethod {
  code: PaymentProvider;
  displayName: string;
  paymentType: 'offline' | 'manual' | 'automated';
  capabilities: Record<string, boolean>;
  metadata: {
    publishableKey?: string;
    instructions?: PaymentCustomerAction | null;
  };
}

export interface CreatePaymentResponse {
  success: boolean;
  data: {
    idempotentReplay: boolean;
    providerOperationPending: boolean;
    payment: PaymentSummary;
    clientSecret?: string;
    customerAction?: PaymentCustomerAction;
  };
  meta: { requestId: string };
}

export const paymentService = {
  createPaymentSession: async (
    data: CreatePaymentRequest,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<CreatePaymentResponse> => {
    const response = await api.post('/payments', data, {
      signal,
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data;
  },

  getPayment: async (
    paymentId: string,
    signal?: AbortSignal
  ): Promise<PaymentSummary> => {
    const response = await api.get(`/payments/${paymentId}`, { signal });
    return response.data.data.payment;
  },

  getPaymentForOrder: async (
    orderId: string,
    signal?: AbortSignal
  ): Promise<PaymentSummary | null> => {
    try {
      const response = await api.get(`/payments/order/${orderId}`, { signal });
      return response.data.data.payment;
    } catch {
      return null;
    }
  },

  getAvailableMethods: async (
    country = 'PK',
    currency = 'PKR',
    amount?: number,
    signal?: AbortSignal
  ): Promise<AvailablePaymentMethod[]> => {
    const response = await api.get('/payments/methods', {
      signal,
      params: { country, currency, amount },
    });
    return response.data.data.methods || [];
  },

  submitManualPayment: async (
    paymentId: string,
    transactionReference: string,
    note?: string
  ): Promise<PaymentSummary> => {
    const response = await api.post(
      `/payments/${paymentId}/manual-submission`,
      { transactionReference, note: note || undefined }
    );
    return response.data.data.payment;
  },
};
