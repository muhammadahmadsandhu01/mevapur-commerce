import { isAxiosError } from 'axios';
import api from '@/lib/api';

export type ReturnStatus = 'pending' | 'approved' | 'received' | 'inspected'
  | 'inventory_reconciliation' | 'refunded' | 'rejected' | 'cancelled';

export type InventoryReconciliationStatus = 'not_required' | 'pending'
  | 'restored' | 'manual_resolved';

export interface AdminActor {
  _id?: string;
  fullName?: string;
  email?: string;
}

export interface AdminReturnRecord {
  _id: string;
  returnNumber: string;
  status: ReturnStatus;
  refundAmount?: number;
  order?: string | { _id?: string; orderId?: string };
  customer?: string | { _id?: string; fullName?: string; email?: string; phone?: string };
  items?: Array<{
    product?: string | { _id?: string; name?: string; images?: string[] };
    variantId?: string | null;
    name?: string;
    quantity?: number;
    refundAmount?: number;
    reason?: string;
    reasonDetails?: string;
  }>;
  adminNotes?: Array<{
    note?: string;
    addedBy?: string | AdminActor;
    addedAt?: string;
  }>;
  approvedBy?: string | AdminActor;
  approvedAt?: string;
  receivedAt?: string;
  refundedAt?: string;
  rejectedReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefundAuditSummary {
  _id?: string;
  manualConfirmedBy?: string | AdminActor | null;
  manualConfirmedAt?: string | null;
  inventoryReconciliationStatus?: InventoryReconciliationStatus;
  inventoryReconciliationReasonCode?: string;
  inventoryReconciliationRequiredAt?: string | null;
  inventoryReconciledAt?: string | null;
  inventoryReconciledBy?: string | AdminActor | null;
  inventoryReconciliationNote?: string;
}

interface ListReturnsResponse {
  success: boolean;
  data: AdminReturnRecord[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface ReturnResponse {
  success: boolean;
  message?: string;
  data: AdminReturnRecord;
}

interface ReconciliationResponse {
  success: boolean;
  message?: string;
  data: {
    return: AdminReturnRecord;
    refund: RefundAuditSummary;
    inventoryStatus: InventoryReconciliationStatus;
    idempotentReplay: boolean;
  };
}

export interface ReturnMutationResult {
  return: AdminReturnRecord;
  message: string;
  httpStatus: number;
  refund?: RefundAuditSummary;
  inventoryStatus?: InventoryReconciliationStatus;
  idempotentReplay?: boolean;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface SafeReturnApiError {
  status?: number;
  code?: string;
  message: string;
}

export const getSafeReturnApiError = (
  error: unknown,
  fallback: string
): SafeReturnApiError => {
  if (!isAxiosError<ApiErrorEnvelope>(error)) return { message: fallback };
  const responseError = error.response?.data?.error;
  return {
    status: error.response?.status,
    code: responseError?.code,
    message: typeof responseError?.message === 'string' && responseError.message.trim()
      ? responseError.message
      : fallback
  };
};

export const returnApi = {
  async list(params: {
    page: number;
    limit: number;
    search?: string;
    status?: ReturnStatus;
  }): Promise<ListReturnsResponse> {
    const response = await api.get<ListReturnsResponse>('/returns', { params });
    return response.data;
  },

  async detail(id: string): Promise<AdminReturnRecord> {
    const response = await api.get<ReturnResponse>(`/returns/${id}`);
    return response.data.data;
  },

  async updateStatus(
    id: string,
    status: Exclude<ReturnStatus, 'inventory_reconciliation' | 'refunded'>,
    note = ''
  ): Promise<ReturnMutationResult> {
    const trimmedNote = note.trim();
    const response = await api.put<ReturnResponse>(`/returns/${id}/status`, {
      status,
      ...(trimmedNote ? { adminNotes: trimmedNote } : {}),
      ...(status === 'rejected' && trimmedNote
        ? { rejectedReason: trimmedNote }
        : {})
    });
    return {
      return: response.data.data,
      message: response.data.message || 'Return status updated successfully',
      httpStatus: response.status
    };
  },

  async refund(id: string, adminNotes = ''): Promise<ReturnMutationResult> {
    const trimmedNotes = adminNotes.trim();
    const response = await api.post<ReturnResponse>(`/returns/${id}/refund`, {
      ...(trimmedNotes ? { adminNotes: trimmedNotes } : {})
    });
    return {
      return: response.data.data,
      message: response.data.message || 'Return refund request processed',
      httpStatus: response.status
    };
  },

  async reconcile(
    id: string,
    action: 'retry' | 'manual_resolve',
    note = ''
  ): Promise<ReturnMutationResult> {
    const trimmedNote = note.trim();
    const response = await api.post<ReconciliationResponse>(
      `/returns/${id}/inventory-reconciliation`,
      {
        action,
        ...(trimmedNote ? { note: trimmedNote } : {})
      }
    );
    return {
      return: response.data.data.return,
      refund: response.data.data.refund,
      inventoryStatus: response.data.data.inventoryStatus,
      idempotentReplay: response.data.data.idempotentReplay,
      message: response.data.message || 'Inventory reconciliation updated',
      httpStatus: response.status
    };
  }
};
