import api from '@/lib/api';
import type {
  AdminPaymentSummary,
  AdminProviderStatus
} from './types';

export const paymentAdminService = {
  getProviderStatuses: async (): Promise<AdminProviderStatus[]> => {
    const response = await api.get('/payments/providers/status', {
      params: { country: 'Pakistan', currency: 'PKR' }
    });
    return response.data.data.providers || [];
  },

  collectCod: async (
    paymentId: string,
    note = ''
  ): Promise<AdminPaymentSummary> => {
    const response = await api.post(`/payments/${paymentId}/collect`, { note });
    return response.data.data.payment;
  },

  reviewManual: async (
    paymentId: string,
    decision: 'approve' | 'reject',
    note = ''
  ): Promise<AdminPaymentSummary> => {
    const response = await api.post(
      `/payments/${paymentId}/manual-review`,
      { decision, note }
    );
    return response.data.data.payment;
  }
};
