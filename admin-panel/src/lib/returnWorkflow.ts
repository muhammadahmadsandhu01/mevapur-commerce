import type { ReturnStatus } from '@/lib/returnApi';

export type ReturnWorkflowActionId = 'approve' | 'receive' | 'inspect'
  | 'reject' | 'cancel' | 'refund' | 'retry_inventory'
  | 'manual_resolve_inventory';

export interface ReturnWorkflowAction {
  id: ReturnWorkflowActionId;
  label: string;
  kind: 'status' | 'refund' | 'reconciliation';
  targetStatus?: 'approved' | 'received' | 'inspected' | 'rejected' | 'cancelled';
  reconciliationAction?: 'retry' | 'manual_resolve';
  requiresConfirmation: boolean;
  requiresNote: boolean;
  title: string;
  description: string;
  tone: 'default' | 'warning' | 'danger';
}

const approve: ReturnWorkflowAction = {
  id: 'approve',
  label: 'Approve',
  kind: 'status',
  targetStatus: 'approved',
  requiresConfirmation: false,
  requiresNote: false,
  title: 'Approve return',
  description: 'Approve this return request for the next operational step.',
  tone: 'default'
};

const receive: ReturnWorkflowAction = {
  id: 'receive',
  label: 'Mark received',
  kind: 'status',
  targetStatus: 'received',
  requiresConfirmation: false,
  requiresNote: false,
  title: 'Mark return received',
  description: 'Record that the returned goods have been received.',
  tone: 'default'
};

const inspect: ReturnWorkflowAction = {
  id: 'inspect',
  label: 'Mark inspected',
  kind: 'status',
  targetStatus: 'inspected',
  requiresConfirmation: false,
  requiresNote: false,
  title: 'Mark return inspected',
  description: 'Record that the returned goods have completed inspection.',
  tone: 'default'
};

const reject: ReturnWorkflowAction = {
  id: 'reject',
  label: 'Reject',
  kind: 'status',
  targetStatus: 'rejected',
  requiresConfirmation: true,
  requiresNote: false,
  title: 'Reject return',
  description: 'This is a terminal action. The return cannot be reactivated.',
  tone: 'danger'
};

const cancel: ReturnWorkflowAction = {
  id: 'cancel',
  label: 'Cancel',
  kind: 'status',
  targetStatus: 'cancelled',
  requiresConfirmation: true,
  requiresNote: false,
  title: 'Cancel return',
  description: 'This is a terminal action. The return cannot be reactivated.',
  tone: 'danger'
};

const refund: ReturnWorkflowAction = {
  id: 'refund',
  label: 'Execute refund',
  kind: 'refund',
  requiresConfirmation: true,
  requiresNote: false,
  title: 'Execute authoritative refund',
  description: 'The Backend will determine the refund method and amount from trusted records.',
  tone: 'warning'
};

const retryInventory: ReturnWorkflowAction = {
  id: 'retry_inventory',
  label: 'Retry inventory restoration',
  kind: 'reconciliation',
  reconciliationAction: 'retry',
  requiresConfirmation: false,
  requiresNote: false,
  title: 'Retry inventory restoration',
  description: 'Retry inventory restoration without issuing another financial refund.',
  tone: 'default'
};

const manuallyResolveInventory: ReturnWorkflowAction = {
  id: 'manual_resolve_inventory',
  label: 'Record manual resolution',
  kind: 'reconciliation',
  reconciliationAction: 'manual_resolve',
  requiresConfirmation: true,
  requiresNote: true,
  title: 'Record manual inventory resolution',
  description: 'Confirm that inventory was resolved outside the automatic workflow. A note is required.',
  tone: 'warning'
};

export const RETURN_ACTIONS_BY_STATUS: Readonly<
  Record<ReturnStatus, readonly ReturnWorkflowAction[]>
> = Object.freeze({
  pending: Object.freeze([approve, reject, cancel]),
  approved: Object.freeze([receive, refund, reject, cancel]),
  received: Object.freeze([inspect, reject]),
  inspected: Object.freeze([refund, reject]),
  inventory_reconciliation: Object.freeze([
    retryInventory,
    manuallyResolveInventory
  ]),
  refunded: Object.freeze([]),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([])
});

export const actionsForReturnStatus = (
  status: ReturnStatus
): readonly ReturnWorkflowAction[] => RETURN_ACTIONS_BY_STATUS[status];
