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
import { RotateCcw, Package, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ReturnRequestFormProps {
  initialOrderId?: string;
  initialProductId?: string;
  initialVariantId?: string;
  onSubmitted?: () => Promise<void>;
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
        .filter(({ line }) => {
          if (!initialProductId) return false;
          const pid = historicalProductId(line);
          const pObj = typeof line.product === 'object' && line.product !== null ? line.product : null;
          return (
            pid === initialProductId ||
            (line as unknown as { productId?: string })?.productId === initialProductId ||
            (pObj && (pObj._id === initialProductId || (pObj as { slug?: string }).slug === initialProductId))
          );
        })
        .filter(({ line }) => (
          !initialVariantId || String(line.variantId || '') === initialVariantId
        ));
      const preselected = matchingLines.length > 0
        ? matchingLines[0]
        : (loadedOrder.items.length === 1 ? { line: loadedOrder.items[0], index: 0 } : null);
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
      setOrderReference(initialOrderId);
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
      await onSubmitted?.();
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
        await onSubmitted?.();
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
    <form onSubmit={submitReturn} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-[#ff8a00]">
          <RotateCcw className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#0b132b]">Request a Return</h2>
          <p className="text-xs text-slate-500">
            Select an item from your delivered order to request a return. Verified and processed by {branding.siteName}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="return-order-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Order Number <span className="text-red-500">*</span>
          </label>
          <input
            id="return-order-input"
            required
            value={orderReference}
            onChange={(event) => {
              setOrderReference(event.target.value);
              setOrder(null);
              setSelectedLineKey('');
            }}
            placeholder="HZ-YYYYMMDD-..."
            autoComplete="off"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] outline-none transition"
          />
        </div>
        <div>
          <button
            type="button"
            onClick={() => void loadOrder(orderReference)}
            disabled={loadingOrder || submitting}
            aria-busy={loadingOrder}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b132b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1c2a4f] disabled:opacity-50 transition shadow-xs cursor-pointer h-[42px]"
          >
            {loadingOrder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#ff8a00]" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                <span>Load order items</span>
              </>
            )}
          </button>
        </div>
      </div>

      {order && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Historical items from {order.orderId}
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              isDelivered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {order.orderStatus}
            </span>
          </div>
          {!isDelivered && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Only delivered orders inside the return window are eligible for return claims.</span>
            </div>
          )}
          <div className="space-y-2">
            {order.items.map((line, index) => {
              const key = lineKey(line, index);
              const isSelected = selectedLineKey === key;
              const productName = typeof line.product === 'object'
                ? line.product.name || line.name
                : line.name;
              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'border-[#ff8a00] bg-orange-50/30 ring-1 ring-[#ff8a00]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${!isDelivered ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="return-order-line"
                    value={key}
                    checked={isSelected}
                    disabled={!isDelivered || submitting}
                    onChange={() => selectLine(key)}
                    className="mt-1 h-4 w-4 text-[#ff8a00] focus:ring-[#ff8a00] border-slate-300"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 truncate">{productName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {variantDescription(line)} · Purchased quantity: <span className="font-semibold text-slate-700">{line.quantity}</span>
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {selectedLine && (
          <div>
            <label htmlFor="return-quantity-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Quantity to Return <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="return-quantity-input"
                type="number"
                required
                min={1}
                max={selectedMaximum}
                step={1}
                inputMode="numeric"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-medium">
                Max: {selectedMaximum}
              </span>
            </div>
          </div>
        )}

        <div className={selectedLine ? '' : 'sm:col-span-2'}>
          <label htmlFor="return-reason-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Reason for Return <span className="text-red-500">*</span>
          </label>
          <select
            id="return-reason-select"
            value={reason}
            onChange={(event) => setReason(event.target.value as ReturnReason)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] outline-none bg-white cursor-pointer"
          >
            <option value="not_as_described">Not as described</option>
            <option value="damaged">Damaged or defective</option>
            <option value="wrong_item">Wrong item delivered</option>
            <option value="not_satisfied">Not satisfied with quality</option>
            <option value="duplicate">Duplicate item ordered</option>
            <option value="other">Other reason</option>
          </select>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label htmlFor="return-details-textarea" className="block text-xs font-semibold text-slate-700">
            Issue Description <span className="text-slate-500 font-normal">(Optional)</span>
          </label>
          <span className="text-[11px] text-slate-500">{details.length} / 500</span>
        </div>
        <textarea
          id="return-details-textarea"
          rows={3}
          placeholder="Describe the issue with the item (condition upon delivery, defects, etc.)..."
          maxLength={500}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          className="w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] outline-none transition resize-none"
        />
      </div>

      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl p-3.5 text-xs flex items-center gap-2.5 ${
            message.includes('submitted') || message.includes('success')
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {message.includes('submitted') || message.includes('success') ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          )}
          <span>{message}</span>
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={submitting || loadingOrder || !selectedLine || !isDelivered}
          aria-busy={submitting}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff8a00] px-6 py-2.5 text-sm font-bold text-[#0b132b] hover:bg-[#e67c00] disabled:opacity-50 transition shadow-sm cursor-pointer"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin text-[#0b132b]" />}
          <span>{submitting ? 'Submitting return…' : 'Submit Return Request'}</span>
        </button>
      </div>
    </form>
  );
}
