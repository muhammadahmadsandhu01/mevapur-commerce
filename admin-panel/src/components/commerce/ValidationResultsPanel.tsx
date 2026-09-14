'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import type { ValidationResult } from '../../types/commerceGovernance';

interface ValidationResultsPanelProps {
  result: ValidationResult | null;
  loading: boolean;
  onValidate: () => void;
  disabled?: boolean;
}

export default function ValidationResultsPanel({
  result,
  loading,
  onValidate,
  disabled,
}: ValidationResultsPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">Integrity Validation</h3>
          <p className="text-xs text-slate-500">Run authoritative schema and cross-field integrity checks on this draft version.</p>
        </div>
        <button
          type="button"
          disabled={loading || disabled}
          onClick={onValidate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? 'Validating...' : 'Run Validation'}
        </button>
      </div>

      {result ? (
        <div className="space-y-3">
          {result.isValid ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="text-emerald-700 shrink-0 mt-0.5" size={18} />
              <div className="text-xs">
                <span className="font-bold text-emerald-900 block">Draft Configuration is Valid</span>
                <span className="text-emerald-800">
                  Version {result.version} passed all integrity checks at {new Date(result.checkedAt).toLocaleTimeString()}.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <AlertCircle size={16} />
                <span>Integrity Validation Failed ({result.errors.length} errors)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-rose-700 pl-5 list-disc">
                {result.errors.map((err, idx) => (
                  <li key={idx}>
                    <span className="font-mono text-[11px] font-bold">[{err.path}]</span>: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings && result.warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                <AlertTriangle size={16} />
                <span>Configuration Warnings ({result.warnings.length})</span>
              </div>
              <ul className="space-y-1 text-xs text-amber-700 pl-5 list-disc">
                {result.warnings.map((w, idx) => (
                  <li key={idx}>
                    <span className="font-mono text-[11px] font-bold">[{w.path}]</span>: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-slate-400 font-semibold border border-dashed border-slate-200 rounded-xl">
          Click &quot;Run Validation&quot; to evaluate this draft configuration against authoritative business rules.
        </div>
      )}
    </div>
  );
}
