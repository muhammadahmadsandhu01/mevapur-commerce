'use client';

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Eye,
  Loader,
  RotateCcw,
  Search,
  X,
  XCircle,
  type LucideIcon
} from 'lucide-react';
import ReturnActionDialog from '@/components/admin/ReturnActionDialog';
import {
  getSafeReturnApiError,
  returnApi,
  type AdminActor,
  type AdminReturnRecord,
  type RefundAuditSummary,
  type ReturnMutationResult,
  type ReturnStatus
} from '@/lib/returnApi';
import {
  actionsForReturnStatus,
  type ReturnWorkflowAction,
  type ReturnWorkflowActionId
} from '@/lib/returnWorkflow';

const RETURN_STATUSES: readonly ReturnStatus[] = [
  'pending',
  'approved',
  'received',
  'inspected',
  'inventory_reconciliation',
  'refunded',
  'rejected',
  'cancelled'
];

interface Notice {
  kind: 'success' | 'warning' | 'error';
  message: string;
}

interface StatusBadge {
  bg: string;
  color: string;
  icon: LucideIcon;
}

const statusBadge = (status: ReturnStatus): StatusBadge => {
  switch (status) {
    case 'pending':
    case 'inventory_reconciliation':
      return {
        bg: 'rgba(245, 158, 11, 0.12)',
        color: 'var(--warning-text)',
        icon: status === 'pending' ? Clock : AlertCircle
      };
    case 'approved':
    case 'refunded':
      return {
        bg: 'rgba(22, 163, 74, 0.12)',
        color: 'var(--success-text)',
        icon: CheckCircle
      };
    case 'received':
    case 'inspected':
      return {
        bg: 'var(--info-light)',
        color: 'var(--info-text)',
        icon: CheckCircle
      };
    case 'rejected':
    case 'cancelled':
      return {
        bg: 'rgba(220, 38, 38, 0.1)',
        color: 'var(--danger-text)',
        icon: XCircle
      };
  }
};

const statusLabel = (status: ReturnStatus): string => (
  status === 'inventory_reconciliation'
    ? 'Inventory reconciliation'
    : status.replaceAll('_', ' ')
);

const orderLabel = (record: AdminReturnRecord): string => (
  typeof record.order === 'object' ? record.order.orderId || 'N/A' : 'N/A'
);

const customerLabel = (record: AdminReturnRecord): string => (
  typeof record.customer === 'object' ? record.customer.fullName || 'N/A' : 'N/A'
);

const productLabel = (record: AdminReturnRecord): string => {
  const itemCount = record.items?.length || 0;
  const firstItem = record.items?.[0];
  if (itemCount > 1) return `${itemCount} Items`;
  if (typeof firstItem?.product === 'object' && firstItem.product.name) {
    return firstItem.product.name;
  }
  return firstItem?.name || 'Unknown';
};

const actorLabel = (actor?: string | AdminActor | null): string => {
  if (!actor) return 'Not recorded';
  if (typeof actor === 'object' && actor.fullName) return actor.fullName;
  return 'Recorded administrator';
};

const displayTime = (value?: string | null): string => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recorded' : date.toLocaleString();
};

const reconciliationReason = (code?: string): string => {
  if (code === 'RETURN_INVENTORY_PRODUCT_MISSING') {
    return 'The historical product is missing from the catalog.';
  }
  if (code === 'RETURN_INVENTORY_VARIANT_MISSING') {
    return 'The historical product variant is missing from the catalog.';
  }
  return code ? 'Inventory requires operational review.' : 'Not recorded';
};

const actionButtonColors = (action: ReturnWorkflowAction) => {
  if (action.tone === 'danger') {
    return {
      backgroundColor: 'rgba(220, 38, 38, 0.1)',
      color: 'var(--danger-text)'
    };
  }
  if (action.id === 'approve') {
    return {
      backgroundColor: 'rgba(22, 163, 74, 0.12)',
      color: 'var(--success-text)'
    };
  }
  return {
    backgroundColor: 'var(--accent-light)',
    color: 'var(--accent-text)'
  };
};

export default function ReturnsPage() {
  const [returns, setReturns] = useState<AdminReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReturnStatus>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReturn, setSelectedReturn] = useState<AdminReturnRecord | null>(null);
  const [selectedRefundAudit, setSelectedRefundAudit] = useState<RefundAuditSummary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<ReturnWorkflowActionId | null>(null);
  const [pendingAction, setPendingAction] = useState<ReturnWorkflowAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const actionLock = useRef(false);

  const refreshReturns = useCallback(async (reportError = true): Promise<boolean> => {
    setLoading(true);
    try {
      const response = await returnApi.list({
        page,
        limit: 15,
        ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {})
      });
      setReturns(response.data);
      setTotalPages(Math.max(response.pagination?.pages || 1, 1));
      return true;
    } catch (error) {
      const safeError = getSafeReturnApiError(
        error,
        'Returns could not be loaded. Try again.'
      );
      if (reportError) setNotice({ kind: 'error', message: safeError.message });
      return false;
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshReturns();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshReturns]);

  const refreshSelected = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const current = await returnApi.detail(id);
      setSelectedReturn(current);
      setReturns((existing) => existing.map((record) => (
        record._id === current._id ? current : record
      )));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openReturn = async (record: AdminReturnRecord) => {
    setSelectedReturn(record);
    setSelectedRefundAudit(null);
    setShowModal(true);
    setNotice(null);
    try {
      await refreshSelected(record._id);
    } catch (error) {
      const safeError = getSafeReturnApiError(
        error,
        'Current return details could not be loaded.'
      );
      setNotice({ kind: 'error', message: safeError.message });
    }
  };

  const selectedActions = useMemo(() => (
    selectedReturn ? actionsForReturnStatus(selectedReturn.status) : []
  ), [selectedReturn]);

  const describeMutation = (result: ReturnMutationResult): Notice => {
    if (
      result.httpStatus === 202
      && result.return.status === 'inventory_reconciliation'
    ) {
      return {
        kind: 'warning',
        message: 'Financial refund confirmed. Inventory restoration requires reconciliation.'
      };
    }
    if (result.httpStatus === 202) {
      return {
        kind: 'warning',
        message: 'Refund is awaiting payment-provider confirmation. Inventory has not been restored.'
      };
    }
    const replay = result.idempotentReplay ? ' No duplicate action was performed.' : '';
    return { kind: 'success', message: `${result.message}${replay}` };
  };

  const refreshAfterMutation = async (returnId: string): Promise<boolean> => {
    const listRefreshed = await refreshReturns(false);
    await refreshSelected(returnId);
    return listRefreshed;
  };

  const executeAction = async (action: ReturnWorkflowAction, note = '') => {
    if (!selectedReturn || actionLock.current) return;
    const trimmedNote = note.trim();
    if (action.requiresNote && !trimmedNote) {
      setNotice({ kind: 'error', message: 'An operational note is required.' });
      return;
    }

    actionLock.current = true;
    setActionLoading(action.id);
    setPendingAction(null);
    setNotice(null);
    const returnId = selectedReturn._id;

    try {
      let result: ReturnMutationResult;
      if (action.kind === 'status' && action.targetStatus) {
        result = await returnApi.updateStatus(
          returnId,
          action.targetStatus,
          trimmedNote
        );
      } else if (action.kind === 'refund') {
        result = await returnApi.refund(returnId, trimmedNote);
      } else if (action.kind === 'reconciliation' && action.reconciliationAction) {
        result = await returnApi.reconcile(
          returnId,
          action.reconciliationAction,
          trimmedNote
        );
      } else {
        setNotice({ kind: 'error', message: 'This Return action is not supported.' });
        return;
      }

      setSelectedReturn(result.return);
      setReturns((existing) => existing.map((record) => (
        record._id === result.return._id ? result.return : record
      )));
      if (result.refund) setSelectedRefundAudit(result.refund);
      setNotice(describeMutation(result));
      try {
        const listRefreshed = await refreshAfterMutation(returnId);
        if (!listRefreshed) {
          setNotice((current) => ({
            kind: current?.kind || 'warning',
            message: `${current?.message || result.message} The Return list could not be refreshed.`
          }));
        }
      } catch {
        setNotice((current) => ({
          kind: current?.kind || 'warning',
          message: `${current?.message || result.message} Refresh the Return before another action.`
        }));
      }
    } catch (error) {
      const safeError = getSafeReturnApiError(
        error,
        'The Return action could not be completed.'
      );
      let stateRefreshed = false;
      try {
        await refreshAfterMutation(returnId);
        stateRefreshed = true;
      } catch {
        // Preserve the safe mutation error when the follow-up refresh also fails.
      }
      setNotice({
        kind: safeError.status === 409 ? 'warning' : 'error',
        message: safeError.status === 409
          ? stateRefreshed
            ? `${safeError.message} The latest server state has been refreshed.`
            : `${safeError.message} Refresh this Return before another action.`
          : safeError.message
      });
    } finally {
      actionLock.current = false;
      setActionLoading(null);
    }
  };

  const chooseAction = (action: ReturnWorkflowAction) => {
    if (action.requiresConfirmation) {
      setPendingAction(action);
      return;
    }
    void executeAction(action);
  };

  const closeDetails = () => {
    if (actionLock.current) return;
    setShowModal(false);
    setSelectedReturn(null);
    setSelectedRefundAudit(null);
    setPendingAction(null);
  };

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  const stats = {
    total: returns.length,
    pending: returns.filter((record) => record.status === 'pending').length,
    approved: returns.filter((record) => record.status === 'approved').length,
    reconciliation: returns.filter(
      (record) => record.status === 'inventory_reconciliation'
    ).length
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 32,
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: 8,
              letterSpacing: '-0.5px'
            }}
          >
            Returns Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Process customer returns through the authoritative refund workflow.
          </p>
        </div>
        <button
          style={{
            padding: '12px 20px',
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Download size={18} /> Export Report
        </button>
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          style={{
            marginBottom: 18,
            padding: '12px 16px',
            borderRadius: 10,
            border: notice.kind === 'error'
              ? '1px solid var(--danger-text)'
              : notice.kind === 'warning'
                ? '1px solid var(--warning-text)'
                : '1px solid var(--success-text)',
            color: notice.kind === 'error'
              ? 'var(--danger-text)'
              : notice.kind === 'warning'
                ? 'var(--warning-text)'
                : 'var(--success-text)',
            backgroundColor: 'var(--card-bg)'
          }}
        >
          {notice.message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}
      >
        {[
          { label: 'Visible Returns', value: stats.total, color: 'var(--info-text)', bg: 'var(--info-light)', icon: RotateCcw },
          { label: 'Pending', value: stats.pending, color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.12)', icon: Clock },
          { label: 'Approved', value: stats.approved, color: 'var(--success-text)', bg: 'rgba(22, 163, 74, 0.12)', icon: CheckCircle },
          { label: 'Reconciliation', value: stats.reconciliation, color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.12)', icon: AlertCircle }
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: 12,
              padding: 20,
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                backgroundColor: stat.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <stat.icon size={24} color={stat.color} />
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                {stat.label}
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 800 }}>
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: 12,
          padding: '16px 20px',
          border: '1px solid var(--border-color)',
          marginBottom: 24,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <div style={{ flex: 1, minWidth: 280, position: 'relative' }}>
          <Search
            size={18}
            color="var(--text-secondary)"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="search"
            aria-label="Search returns"
            placeholder="Search by Return #, Order # or Customer..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)'
            }}
          />
        </div>
        <select
          aria-label="Filter returns by status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter);
            setPage(1);
          }}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Statuses</option>
          {RETURN_STATUSES.map((status) => (
            <option key={status} value={status}>{statusLabel(status)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...Array(5)].map((_, index) => (
            <div
              key={index}
              style={{
                backgroundColor: 'var(--card-bg)',
                borderRadius: 12,
                height: 80,
                animation: 'pulse 1.5s infinite',
                border: '1px solid var(--border-color)'
              }}
            />
          ))}
        </div>
      ) : returns.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: 12,
            padding: '80px 20px',
            textAlign: 'center',
            border: '1px dashed var(--border-color)'
          }}
        >
          <RotateCcw
            size={48}
            color="var(--text-secondary)"
            style={{ opacity: 0.3, marginBottom: 16 }}
          />
          <h3 style={{ color: 'var(--text-primary)', fontSize: 20 }}>
            No returns found
          </h3>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                >
                  {['Return #', 'Order #', 'Customer', 'Product', 'Reason', 'Amount', 'Status', 'Actions'].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: '16px 20px',
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase'
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {returns.map((record) => {
                  const badge = statusBadge(record.status);
                  const BadgeIcon = badge.icon;
                  return (
                    <tr
                      key={record._id}
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                    >
                      <td style={{ padding: '16px 20px', color: 'var(--accent-text)', fontWeight: 700, fontFamily: 'monospace' }}>
                        {record.returnNumber}
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                        {orderLabel(record)}
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {customerLabel(record)}
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                        {productLabel(record)}
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {record.items?.[0]?.reason || 'N/A'}
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        Rs. {(record.refundAmount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: 'capitalize'
                          }}
                        >
                          <BadgeIcon size={14} /> {statusLabel(record.status)}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => void openReturn(record)}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--accent-text)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: 16,
              borderTop: '1px solid var(--border-color)'
            }}
          >
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span style={{ color: 'var(--text-secondary)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showModal && selectedReturn && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetails();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            backgroundColor: 'rgba(11, 19, 43, 0.65)'
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-detail-title"
            onMouseDown={stopPropagation}
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: 16,
              padding: 28,
              maxWidth: 760,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid var(--border-color)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
              <div>
                <h2 id="return-detail-title" style={{ color: 'var(--text-primary)', fontSize: 24 }}>
                  Return {selectedReturn.returnNumber}
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: 6 }}>
                  Current state: {statusLabel(selectedReturn.status)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Return details"
                onClick={closeDetails}
                disabled={Boolean(actionLoading)}
                style={{ border: 0, background: 'transparent', color: 'var(--text-secondary)', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            {detailLoading && (
              <p role="status" style={{ color: 'var(--text-secondary)' }}>
                <Loader size={16} className="animate-spin" /> Refreshing Return state...
              </p>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                marginBottom: 24
              }}
            >
              <div><small style={{ color: 'var(--text-secondary)' }}>Order #</small><div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{orderLabel(selectedReturn)}</div></div>
              <div><small style={{ color: 'var(--text-secondary)' }}>Customer</small><div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{customerLabel(selectedReturn)}</div></div>
              <div><small style={{ color: 'var(--text-secondary)' }}>Authoritative refund</small><div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Rs. {(selectedReturn.refundAmount || 0).toLocaleString()}</div></div>
              <div><small style={{ color: 'var(--text-secondary)' }}>Approved by</small><div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{actorLabel(selectedReturn.approvedBy)}</div></div>
            </div>

            <div style={{ padding: 16, backgroundColor: 'var(--bg-primary)', borderRadius: 10, marginBottom: 20 }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 10 }}>
                Returned historical items
              </h3>
              {selectedReturn.items?.length ? selectedReturn.items.map((item, index) => (
                <div key={`${item.variantId || 'standard'}-${index}`} style={{ marginTop: index ? 12 : 0 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {typeof item.product === 'object' ? item.product.name || item.name : item.name || 'Historical item'}
                  </strong>
                  <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                    Quantity {item.quantity || 0} · {item.reasonDetails || item.reason || 'No reason details'}
                  </p>
                </div>
              )) : <p style={{ color: 'var(--text-secondary)' }}>No item details returned.</p>}
            </div>

            {selectedReturn.status === 'inventory_reconciliation' && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: '1px solid var(--warning-text)',
                  backgroundColor: 'var(--card-bg)',
                  marginBottom: 20
                }}
              >
                <strong style={{ color: 'var(--warning-text)' }}>
                  Financial refund confirmed; inventory requires reconciliation.
                </strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                  Retry automatic restoration after catalog correction, or record a verified manual resolution.
                </p>
              </div>
            )}

            {selectedRefundAudit && (
              <div style={{ padding: 16, border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 20 }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 10 }}>
                  Safe reconciliation audit
                </h3>
                <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, auto) 1fr', gap: 8, color: 'var(--text-secondary)' }}>
                  <dt>Manual refund confirmed by</dt><dd>{actorLabel(selectedRefundAudit.manualConfirmedBy)}</dd>
                  <dt>Manual confirmation time</dt><dd>{displayTime(selectedRefundAudit.manualConfirmedAt)}</dd>
                  <dt>Inventory status</dt><dd>{selectedRefundAudit.inventoryReconciliationStatus || 'Not recorded'}</dd>
                  <dt>Reconciliation reason</dt><dd>{reconciliationReason(selectedRefundAudit.inventoryReconciliationReasonCode)}</dd>
                  <dt>Reconciled by</dt><dd>{actorLabel(selectedRefundAudit.inventoryReconciledBy)}</dd>
                  <dt>Reconciled at</dt><dd>{displayTime(selectedRefundAudit.inventoryReconciledAt)}</dd>
                  <dt>Operational note</dt><dd>{selectedRefundAudit.inventoryReconciliationNote || 'Not recorded'}</dd>
                </dl>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={closeDetails}
                disabled={Boolean(actionLoading)}
                style={{
                  padding: '11px 18px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 10,
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 700
                }}
              >
                Close
              </button>
              {selectedActions.map((action) => {
                const colors = actionButtonColors(action);
                const isBusy = actionLoading === action.id;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => chooseAction(action)}
                    disabled={Boolean(actionLoading) || detailLoading}
                    aria-busy={isBusy}
                    style={{
                      ...colors,
                      padding: '11px 18px',
                      border: 0,
                      borderRadius: 10,
                      cursor: actionLoading || detailLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7
                    }}
                  >
                    {isBusy && <Loader size={16} className="animate-spin" />}
                    {action.label}
                  </button>
                );
              })}
              {selectedActions.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', alignSelf: 'center' }}>
                  This Return state is terminal.
                </span>
              )}
            </div>
          </section>
        </div>
      )}

      {pendingAction && (
        <ReturnActionDialog
          action={pendingAction}
          busy={actionLoading === pendingAction.id}
          onCancel={() => {
            if (!actionLoading) setPendingAction(null);
          }}
          onConfirm={(note) => void executeAction(pendingAction, note)}
        />
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
