'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  accountService,
  buildReturnRequestPayload,
  getAccountApiErrorMessage,
  historicalProductId,
  type HistoricalOrder,
  type HistoricalOrderLine,
  type ReturnReason
} from '@/services/account.service';
import { branding } from '@/config/branding';

interface ReturnRequestFormProps {
  initialOrderId?: string;
  initialProductId?: string;
  initialVariantId?: string;
  onSubmitted: () => Promise<void>;
}

const lineKey = (line: HistoricalOrderLine, index: number): string => (
  `${historicalProductId(line)}:${line.variantId || 'no-variant'}:${index}`
);

const variantDescription = (line: HistoricalOrderLine): string => {
  const details = [line.variant, line.sku ? `SKU ${line.sku}` : ''].filter(Boolean);
  if (details.length > 0) return details.join(' · ');
  return line.variantId ? 'Historical variant' : 'Standard item';
};

const MAX_RETURN_QUANTITY_PER_REQUEST = 20;

export default function ReturnRequestForm({
  initialOrderId = '',
  initialProductId = '',
  initialVariantId = '',
  onSubmitted
}: ReturnRequestFormProps) {
  const [orderReference, setOrderReference] = useState(initialOrderId);
  const [order, setOrder] = useState<HistoricalOrder | null>(null);
  const [selectedLineKey, setSelectedLineKey] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [reason, setReason] = useState<ReturnReason>('not_as_described');
  const [details, setDetails] = useState('');
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const submissionLock = useRef(false);

  const selectedLine = useMemo(() => {
    if (!order) return null;
    return order.items.find((line, index) => (
      lineKey(line, index) === selectedLineKey
    )) || null;
  }, [order, selectedLineKey]);

  const loadOrder = useCallback(async (reference: string) => {
    const normalizedReference = reference.trim();
    if (!normalizedReference) {
      setMessage('Enter an order number before loading its historical items.');
      return;
    }

    setLoadingOrder(true);
    setMessage('');
    try {
      const loadedOrder = await accountService.order(normalizedReference);
      setOrder(loadedOrder);
      setOrderReference(loadedOrder.orderId || normalizedReference);
      setQuantityInput('1');

      const matchingLines = loadedOrder.items
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => historicalProductId(line) === initialProductId)
        .filter(({ line }) => (
          !initialVariantId || String(line.variantId || '') === initialVariantId
        ));
      const preselected = matchingLines.length === 1 ? matchingLines[0] : null;
      setSelectedLineKey(
        preselected ? lineKey(preselected.line, preselected.index) : ''
      );

      if (loadedOrder.orderStatus !== 'Delivered') {
        setMessage('Only delivered orders inside the return window are eligible.');
      }
    } catch (error) {
      setOrder(null);
      setSelectedLineKey('');
      setMessage(getAccountApiErrorMessage(
        error,
        'The order could not be loaded. Check the order number and try again.'
      ));
    } finally {
      setLoadingOrder(false);
    }
  }, [initialProductId, initialVariantId]);

  useEffect(() => {
    if (!initialOrderId) return;
    const timer = window.setTimeout(() => {
      void loadOrder(initialOrderId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialOrderId, loadOrder]);

  const selectLine = (key: string) => {
    setSelectedLineKey(key);
    setQuantityInput('1');
    setMessage('');
  };

  const submitReturn = async (event: FormEvent) => {
    event.preventDefault();
    if (submissionLock.current || submitting) return;
    if (!order || !selectedLine) {
      setMessage('Select an exact historical order line before submitting.');
      return;
    }

    const maximumQuantity = Math.min(
      selectedLine.quantity,
      MAX_RETURN_QUANTITY_PER_REQUEST
    );
    const quantity = Number(quantityInput);
    if (
      !Number.isInteger(quantity)
      || quantity <= 0
      || quantity > maximumQuantity
    ) {
      setMessage(`Quantity must be a whole number from 1 to ${maximumQuantity}.`);
      return;
    }

    submissionLock.current = true;
    setSubmitting(true);
    setMessage('');
    try {
      await accountService.requestReturn(buildReturnRequestPayload({
        orderId: order.orderId || order._id,
        line: selectedLine,
        quantity,
        reason,
        details
      }));
      await onSubmitted();
      await loadOrder(order.orderId || order._id);
      setMessage('Return request submitted for review.');
      setSelectedLineKey('');
      setQuantityInput('1');
      setDetails('');
    } catch (error) {
      const requestErrorMessage = getAccountApiErrorMessage(
        error,
        'The return request could not be submitted. Refresh the order and try again.'
      );
      try {
        await onSubmitted();
        await loadOrder(order.orderId || order._id);
      } catch {
        // The request error remains authoritative if the follow-up refresh also fails.
      }
      setMessage(requestErrorMessage);
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  const isDelivered = order?.orderStatus === 'Delivered';
  const selectedMaximum = selectedLine
    ? Math.min(selectedLine.quantity, MAX_RETURN_QUANTITY_PER_REQUEST)
    : 0;

  return (
    <form onSubmit={submitReturn} style={{ display: 'grid', gap: 12 }}>
      <h3>Request a return</h3>
      <p>
        Select the exact item purchased in your delivered order. Refund amounts
        are verified by {branding.siteName} after review.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 260px' }}>
          Order number
          <input
            required
            value={orderReference}
            onChange={(event) => {
              setOrderReference(event.target.value);
              setOrder(null);
              setSelectedLineKey('');
            }}
            placeholder="ORD-..."
            autoComplete="off"
            style={{ width: '100%' }}
          />
        </label>
        <button
          type="button"
          onClick={() => void loadOrder(orderReference)}
          disabled={loadingOrder || submitting}
          aria-busy={loadingOrder}
          style={{ alignSelf: 'end' }}
        >
          {loadingOrder ? 'Loading items…' : 'Load order items'}
        </button>
      </div>

      {order && (
        <fieldset
          disabled={!isDelivered || submitting}
          style={{ border: '1px solid #D1D5DB', borderRadius: 12, padding: 12 }}
        >
          <legend style={{ fontWeight: 700, color: '#111827' }}>
            Historical items from {order.orderId}
          </legend>
          <div style={{ display: 'grid', gap: 10 }}>
            {order.items.map((line, index) => {
              const key = lineKey(line, index);
              const productName = typeof line.product === 'object'
                ? line.product.name || line.name
                : line.name;
              return (
                <label
                  key={key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(0, 1fr)',
                    gap: 10,
                    padding: 12,
                    border: selectedLineKey === key
                      ? '2px solid #FF8A00'
                      : '1px solid #E5E7EB',
                    borderRadius: 10,
                    backgroundColor: '#FFFFFF',
                    cursor: isDelivered ? 'pointer' : 'not-allowed'
                  }}
                >
                  <input
                    type="radio"
                    name="return-order-line"
                    value={key}
                    checked={selectedLineKey === key}
                    onChange={() => selectLine(key)}
                  />
                  <span>
                    <strong style={{ display: 'block', color: '#111827' }}>
                      {productName}
                    </strong>
                    <span style={{ display: 'block', color: '#6B7280', fontSize: 14 }}>
                      {variantDescription(line)} · Purchased quantity {line.quantity}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {selectedLine && (
        <label>
          Quantity to return
          <input
            type="number"
            required
            min={1}
            max={selectedMaximum}
            step={1}
            inputMode="numeric"
            value={quantityInput}
            onChange={(event) => setQuantityInput(event.target.value)}
          />
          <span style={{ marginLeft: 8, color: '#6B7280', fontSize: 13 }}>
            Maximum {selectedMaximum} per request
          </span>
        </label>
      )}

      <label>
        Reason
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as ReturnReason)}
        >
          <option value="not_as_described">Not as described</option>
          <option value="damaged">Damaged</option>
          <option value="wrong_item">Wrong item</option>
          <option value="not_satisfied">Not satisfied</option>
          <option value="duplicate">Duplicate item</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label>
        Details
        <textarea
          placeholder="Describe the issue"
          maxLength={500}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </label>

      {message && <p role="status" aria-live="polite">{message}</p>}
      <button
        type="submit"
        disabled={submitting || loadingOrder || !selectedLine || !isDelivered}
        aria-busy={submitting}
      >
        {submitting ? 'Submitting return…' : 'Submit return request'}
      </button>
    </form>
  );
}
