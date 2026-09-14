'use client';

import React, { useEffect, useRef } from 'react';
import { AlertOctagon, CheckCircle2, Archive, X, Loader2 } from 'lucide-react';

interface LifecycleConfirmModalProps {
  isOpen: boolean;
  actionType: 'activate' | 'retire' | 'revoke' | null;
  versionNumber: number;
  loading: boolean;
  reason?: string;
  onReasonChange?: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function LifecycleConfirmModal({
  isOpen,
  actionType,
  versionNumber,
  loading,
  reason = '',
  onReasonChange,
  onConfirm,
  onClose,
}: LifecycleConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !actionType) return null;

  const isActivate = actionType === 'activate';
  const isRevoke = actionType === 'revoke';
  const isRetire = actionType === 'retire';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isActivate
                  ? 'bg-emerald-100 text-emerald-800'
                  : isRevoke
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isActivate && <CheckCircle2 size={22} />}
              {isRevoke && <AlertOctagon size={22} />}
              {isRetire && <Archive size={22} />}
            </div>
            <div>
              <h3 id="modal-title" className="text-base font-bold text-slate-900">
                {isActivate
                  ? `Activate Version v${versionNumber}`
                  : isRevoke
                  ? `Emergency Revoke v${versionNumber}`
                  : `Retire Version v${versionNumber}`}
              </h3>
              <p className="text-xs text-slate-500">Super Administrator Authorization Required</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-xs text-slate-600 space-y-2">
          {isActivate && (
            <p>
              Activating <strong className="text-slate-900">v{versionNumber}</strong> will immediately promote it as the single active authoritative commerce configuration for checkout quoting, replacing any currently active version.
            </p>
          )}

          {isRetire && (
            <p>
              Retiring <strong className="text-slate-900">v{versionNumber}</strong> will mark it as superseded. If no other active version exists, public international checkout quoting will fail closed.
            </p>
          )}

          {isRevoke && (
            <p>
              Emergency revoking <strong className="text-slate-900">v{versionNumber}</strong> immediately revokes all signed quote tokens issued under this version key and halts quote acceptance.
            </p>
          )}

          {(isRetire || isRevoke) && onReasonChange && (
            <div className="pt-2">
              <label htmlFor="lifecycle-reason" className="block font-bold text-slate-700 mb-1">
                Reason for {isRevoke ? 'Emergency Revocation' : 'Retirement'}
              </label>
              <textarea
                id="lifecycle-reason"
                rows={2}
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Audit log justification notes..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-xs outline-none focus:ring-1 focus:ring-slate-400 bg-white"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 ${
              isActivate
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : isRevoke
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {isActivate ? 'Confirm & Activate' : isRevoke ? 'Confirm Revocation' : 'Confirm Retirement'}
          </button>
        </div>
      </div>
    </div>
  );
}
