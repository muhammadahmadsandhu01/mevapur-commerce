'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

interface CMSOutageRetryProps {
  error: string;
}

export default function CMSOutageRetry({ error }: CMSOutageRetryProps) {
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-6 sm:p-8 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle size={22} className="text-amber-800 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-base font-bold text-amber-900">Unable to load page</h2>
          <p className="mt-1 text-sm text-amber-900">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition cursor-pointer"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}
