'use client';

import { CheckCircle, CreditCard, Loader2 } from 'lucide-react';
import type {
  AvailablePaymentMethod,
  PaymentProvider
} from './types';

interface PaymentMethodSelectorProps {
  methods: AvailablePaymentMethod[];
  value: PaymentProvider;
  loading: boolean;
  onChange: (provider: PaymentProvider) => void;
}

const iconFor = (provider: PaymentProvider) => {
  if (provider === 'cod') return 'Rs';
  if (provider === 'bank_transfer') return 'BT';
  if (provider === 'raast') return 'R';
  return 'CC';
};

export default function PaymentMethodSelector({
  methods,
  value,
  loading,
  onChange
}: PaymentMethodSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-gray-600">
        <Loader2 className="animate-spin" size={18} />
        Checking available payment methods…
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        No payment method is currently available for this delivery address.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {methods.map((method) => {
        const selected = value === method.code;
        return (
          <label
            key={method.code}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition ${
              selected
                ? 'border-teal-700 bg-teal-50'
                : 'border-gray-200 bg-white hover:border-teal-300'
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={method.code}
              checked={selected}
              onChange={() => onChange(method.code)}
              className="sr-only"
            />
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-700">
              {method.paymentType === 'automated'
                ? <CreditCard size={18} />
                : iconFor(method.code)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-gray-900">
                {method.displayName}
              </span>
              <span className="block text-xs capitalize text-gray-500">
                {method.paymentType} payment
              </span>
            </span>
            {selected && <CheckCircle className="text-teal-700" size={19} />}
          </label>
        );
      })}
    </div>
  );
}
