'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface ConcurrencyConflictModalProps {
  isOpen: boolean;
  expectedLockVersion: number;
  onReloadLatest: () => void;
  onClose: () => void;
}

export default function ConcurrencyConflictModal({
  isOpen,
  expectedLockVersion,
  onReloadLatest,
  onClose,
}: ConcurrencyConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 id="conflict-title" className="text-base font-bold text-slate-900">
                Concurrency Conflict (409)
              </h3>
              <p className="text-xs text-slate-500">Lock Version Mismatch: vLock:{expectedLockVersion}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
            aria-label="Close conflict dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-xs text-slate-600 space-y-2">
          <p>
            Another administrator has updated or modified this configuration version while you were editing.
          </p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl font-semibold text-amber-900">
            Your unsaved changes have been preserved in the editor. To prevent overwriting recent modifications, please reload the latest server version and reconcile your updates.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition"
          >
            Keep My Edits
          </button>
          <button
            type="button"
            onClick={onReloadLatest}
            className="px-5 py-2 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <RefreshCw size={13} />
            Fetch Latest Server Version
          </button>
        </div>
      </div>
    </div>
  );
}
