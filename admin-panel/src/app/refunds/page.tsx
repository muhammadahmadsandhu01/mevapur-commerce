'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Loader,
  RotateCcw,
  XCircle
} from 'lucide-react';
import api from '@/lib/api';
import ProviderPaymentActions from '@/modules/payments/core/ProviderPaymentActions';
import { paymentAdminService } from '@/modules/payments/core/paymentAdmin.service';
import type {
  AdminPaymentSummary as PaymentSummary,
  AdminProviderStatus,
  PaymentStatus
} from '@/modules/payments/core/types';

type RefundStatus =
  | 'Pending'
  | 'Processing'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

interface RefundSummary {
  _id: string;
  refundNumber: string;
  payment: PaymentSummary;
  order?: { _id: string; orderId: string };
  customer?: { fullName: string; email: string };
  provider: string;
  providerRefundId?: string;
  amount: number;
  currency: 'PKR';
  status: RefundStatus;
  reason?: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const refundableStatuses = new Set<PaymentStatus>([
  'Completed',
  'PartiallyRefunded'
]);

const badgeFor = (status: PaymentStatus | RefundStatus) => {
  switch (status) {
    case 'Completed':
    case 'Refunded':
      return { bg: 'rgba(22, 163, 74, 0.12)', color: 'var(--success-text)', icon: CheckCircle };
    case 'Failed':
    case 'Cancelled':
      return { bg: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger-text)', icon: XCircle };
    case 'Pending':
    case 'Processing':
      return { bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-text)', icon: Clock };
    default:
      return { bg: 'var(--info-light)', color: 'var(--info-text)', icon: AlertCircle };
  }
};

export default function RefundsPage() {
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<AdminProviderStatus[]>([]);
  const [refunds, setRefunds] = useState<RefundSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | RefundStatus>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [paymentActionId, setPaymentActionId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const refundAttemptRef = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const refundParams: { page: number; limit: number; status?: RefundStatus } = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (statusFilter !== 'all') refundParams.status = statusFilter;

      const paymentParams: { page: number; limit: number; provider?: string } = {
        page: 1,
        limit: 20
      };
      if (providerFilter !== 'all') paymentParams.provider = providerFilter;

      const [paymentResponse, refundResponse, statuses] = await Promise.all([
        api.get('/payments', { params: paymentParams }),
        api.get('/refunds', { params: refundParams }),
        paymentAdminService.getProviderStatuses()
      ]);

      setPayments(paymentResponse.data.data.payments || []);
      setRefunds(refundResponse.data.data.refunds || []);
      setProviderStatuses(statuses);
      setPagination(refundResponse.data.data.pagination || pagination);
    } catch {
      setMessage({
        kind: 'error',
        text: 'Payment and refund records could not be loaded.'
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.page, providerFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const beginRefund = (payment: PaymentSummary) => {
    const remaining = Math.max(
      0,
      Number(((payment.paidAmount || payment.amount) - payment.refundedAmount).toFixed(2))
    );
    setPaymentId(payment._id);
    setAmount(remaining.toFixed(2));
    setReason('');
    setMessage(null);
    refundAttemptRef.current = null;
  };

  const runPaymentAction = async (
    payment: PaymentSummary,
    action: 'collect' | 'approve' | 'reject'
  ) => {
    setPaymentActionId(payment._id);
    setMessage(null);
    try {
      if (action === 'collect') {
        await paymentAdminService.collectCod(payment._id);
      } else {
        await paymentAdminService.reviewManual(payment._id, action);
      }
      setMessage({
        kind: 'success',
        text: action === 'collect'
          ? 'COD collection recorded.'
          : `Manual payment ${action === 'approve' ? 'approved' : 'rejected'}.`
      });
      await loadData();
    } catch {
      setMessage({
        kind: 'error',
        text: 'The payment action was rejected by the backend.'
      });
    } finally {
      setPaymentActionId('');
    }
  };

  const submitRefund = async (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!paymentId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage({ kind: 'error', text: 'A valid payment and amount are required.' });
      return;
    }

    const fingerprint = JSON.stringify({
      paymentId,
      amount: numericAmount,
      reason: reason.trim()
    });
    if (refundAttemptRef.current?.fingerprint !== fingerprint) {
      refundAttemptRef.current = {
        fingerprint,
        key: `admin-refund-${globalThis.crypto.randomUUID()}`
      };
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await api.post(
        `/payments/${paymentId}/refunds`,
        {
          amount: numericAmount,
          reason: reason.trim() || undefined
        },
        {
          headers: {
            'Idempotency-Key': refundAttemptRef.current.key
          }
        }
      );
      setMessage({
        kind: 'success',
        text: 'Refund request was accepted by the backend.'
      });
      setPaymentId('');
      setAmount('');
      setReason('');
      refundAttemptRef.current = null;
      await loadData();
    } catch {
      setMessage({
        kind: 'error',
        text: 'The refund could not be completed. No payment status was changed by the browser.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '28px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '800',
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}>
          Payments &amp; Refunds
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Provider-confirmed payment state and admin-only refund operations.
        </p>
      </header>

      {message && (
        <div
          role="alert"
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            borderRadius: '10px',
            border: `1px solid ${message.kind === 'success' ? '#16A34A' : '#DC2626'}`,
            background: message.kind === 'success' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.1)',
            color: message.kind === 'success' ? 'var(--success-text)' : 'var(--danger-text)'
          }}
        >
          {message.text}
        </div>
      )}

      <section style={{
        marginBottom: '28px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        background: 'var(--card-bg)',
        padding: '18px 20px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '14px' }}>
          Provider registry
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '10px'
        }}>
          {providerStatuses.map((provider) => (
            <div key={provider.code} style={{
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '12px'
            }}>
              <div style={{ fontWeight: '800' }}>{provider.displayName}</div>
              <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {provider.available
                  ? 'Available'
                  : provider.reason || 'Unavailable'}
              </div>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                installed {String(provider.installed)} · edition {String(provider.included)} · enabled {String(provider.enabled)} · configured {String(provider.configured)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{
        marginBottom: '28px',
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        background: 'var(--card-bg)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
            Recent payments
          </h2>
          <select
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
            aria-label="Filter payments by provider"
            style={{
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="all">All providers</option>
            {providerStatuses.map((provider) => (
              <option key={provider.code} value={provider.code}>
                {provider.displayName}
              </option>
            ))}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Payment', 'Provider reference', 'Amount', 'Refunded', 'Status', 'Action'].map((heading) => (
                  <th key={heading} scope="col" style={{
                    padding: '14px 18px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const badge = badgeFor(payment.status);
                const BadgeIcon = badge.icon;
                return (
                  <tr key={payment._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                      <div>{payment._id}</div>
                      <div style={{ fontFamily: 'inherit', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {payment.providerDisplayName || payment.provider}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                      {payment.safeProviderReference
                        || payment.providerPaymentId
                        || payment.customerReferenceMasked
                        || 'Pending'}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: '700' }}>
                      Rs. {payment.amount.toFixed(2)}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      Rs. {payment.refundedAmount.toFixed(2)}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderRadius: '999px',
                        padding: '6px 10px',
                        background: badge.bg,
                        color: badge.color,
                        fontWeight: '700',
                        fontSize: '12px'
                      }}>
                        <BadgeIcon size={14} /> {payment.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                        <ProviderPaymentActions
                          payment={payment}
                          disabled={paymentActionId === payment._id}
                          onCollect={() => void runPaymentAction(payment, 'collect')}
                          onReview={(decision) => void runPaymentAction(payment, decision)}
                        />
                        {payment.capabilities?.refund && (
                          <button
                            type="button"
                            disabled={!refundableStatuses.has(payment.status)}
                            onClick={() => beginRefund(payment)}
                            style={{
                              border: 0,
                              borderRadius: '8px',
                              padding: '9px 12px',
                              background: 'var(--primary)',
                              color: '#0B132B',
                              fontWeight: '700',
                              cursor: refundableStatuses.has(payment.status)
                                ? 'pointer'
                                : 'not-allowed',
                              opacity: refundableStatuses.has(payment.status) ? 1 : 0.45
                            }}
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && payments.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No payment records found.
          </div>
        )}
      </section>

      {paymentId && (
        <form
          onSubmit={submitRefund}
          style={{
            marginBottom: '28px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            background: 'var(--card-bg)',
            padding: '20px'
          }}
        >
          <h2 style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            fontSize: '18px',
            fontWeight: '800'
          }}>
            <RotateCcw size={20} /> Create provider refund
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px'
          }}>
            <label style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
              Payment record
              <input
                value={paymentId}
                readOnly
                style={{
                  padding: '11px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)'
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
              Refund amount (PKR)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                style={{
                  padding: '11px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)'
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
              Reason
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={200}
                placeholder="Optional internal reason"
                style={{
                  padding: '11px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)'
                }}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              border: 0,
              borderRadius: '8px',
              padding: '11px 16px',
              background: 'var(--primary)',
              color: '#0B132B',
              fontWeight: '700',
              cursor: submitting ? 'wait' : 'pointer'
            }}
          >
            {submitting ? <Loader className="animate-spin" size={17} /> : <CreditCard size={17} />}
            Submit refund
          </button>
        </form>
      )}

      <section style={{
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        background: 'var(--card-bg)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800' }}>
            Refund ledger
          </h2>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'all' | RefundStatus);
              setPagination((current) => ({ ...current, page: 1 }));
            }}
            style={{
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="all">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Completed">Completed</option>
            <option value="Failed">Failed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Loader className="animate-spin" size={28} color="#FF8A00" />
          </div>
        ) : refunds.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No refund records found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Refund', 'Customer', 'Provider reference', 'Amount', 'Status', 'Created'].map((heading) => (
                    <th key={heading} style={{
                      padding: '14px 18px',
                      textAlign: 'left',
                      fontSize: '12px',
                      color: 'var(--text-secondary)'
                    }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => {
                  const badge = badgeFor(refund.status);
                  const BadgeIcon = badge.icon;
                  return (
                    <tr key={refund._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                        {refund.refundNumber}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {refund.customer?.fullName || 'Unavailable'}
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                        {refund.providerRefundId || 'Pending'}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: '700' }}>
                        Rs. {refund.amount.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          borderRadius: '999px',
                          padding: '6px 10px',
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: '700',
                          fontSize: '12px'
                        }}>
                          <BadgeIcon size={14} /> {refund.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {new Date(refund.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
