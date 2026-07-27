import api from '@/lib/api';

interface CreatePaymentIntentRequest {
  amount: number;
  currency: string;
  orderId?: string;
}

interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  success: boolean;
}

interface VerifyPaymentRequest {
  paymentIntentId: string;
}

interface VerifyPaymentResponse {
  success: boolean;
  paymentIntent: {
    id: string;
    status: string;
    amount: number;
  };
}

export const paymentService = {
  // Create Stripe Payment Intent
  createPaymentIntent: async (
    data: CreatePaymentIntentRequest
  ): Promise<CreatePaymentIntentResponse> => {
    const response = await api.post('/payments/create-payment-intent', data);
    return response.data;
  },

  // Verify Payment Status
  verifyPayment: async (
    data: VerifyPaymentRequest
  ): Promise<VerifyPaymentResponse> => {
    const response = await api.post('/payments/verify', data);
    return response.data;
  },

  // Process JazzCash Payment (Mock for now, replace with real API call)
  processJazzCashPayment: async (
    amount: number,
    orderId: string
  ): Promise<{ transactionId: string; success: boolean }> => {
    // In real implementation, this would call JazzCash API via your backend
    const response = await api.post('/payments/jazzcash', {
      amount,
      orderId,
      currency: 'PKR'
    });
    return response.data;
  },

  // Handle COD Payment
  processCODPayment: async (
    orderId: string
  ): Promise<{ transactionId: string; success: boolean }> => {
    return {
      transactionId: `COD-${orderId}-${Date.now()}`,
      success: true
    };
  }
};