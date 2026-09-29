'use client';

import React from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
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
    <div
      className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs mt-4 space-y-6"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        padding: '24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        marginTop: '16px'
      }}
    >
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          borderBottom: '1px solid #f1f5f9',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className="p-2 rounded-xl bg-orange-50 text-[#ff8a00]"
            style={{
              padding: '8px',
              borderRadius: '12px',
              backgroundColor: '#fff7ed',
              color: '#ff8a00',
              display: 'inline-flex'
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Integrity Validation
            </h3>
            <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
              Run authoritative schema and cross-field integrity checks on this draft version.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={loading || disabled}
          onClick={onValidate}
          className="inline-flex items-center gap-2 bg-[#ff8a00] hover:bg-[#ea580c] text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
          style={{
            backgroundColor: '#ff8a00',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            border: 'none',
            cursor: loading || disabled ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {loading ? 'Validating...' : 'Run Validation'}
        </button>
      </div>

      {result ? (
        <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {result.isValid ? (
            <div
              className="p-5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-start gap-3.5"
              style={{
                padding: '20px',
                backgroundColor: 'rgba(236, 253, 245, 0.8)',
                border: '1px solid #a7f3d0',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px'
              }}
            >
              <div
                className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0 mt-0.5"
                style={{ padding: '6px', borderRadius: '12px', backgroundColor: '#d1fae5', color: '#047857', display: 'inline-flex' }}
              >
                <CheckCircle2 size={18} />
              </div>
              <div className="text-xs" style={{ fontSize: '12px' }}>
                <span className="font-bold text-emerald-900 block text-sm" style={{ fontWeight: '700', color: '#064e3b', fontSize: '14px', display: 'block' }}>
                  Draft Configuration is Valid
                </span>
                <span className="text-emerald-800 mt-1 block" style={{ color: '#065f46', marginTop: '4px', display: 'block' }}>
                  Version {result.version} passed all integrity checks at {new Date(result.checkedAt).toLocaleTimeString()}.
                </span>
              </div>
            </div>
          ) : (
            <div
              className="p-5 bg-rose-50/80 border border-rose-200 rounded-2xl space-y-3"
              style={{
                padding: '20px',
                backgroundColor: 'rgba(255, 241, 242, 0.8)',
                border: '1px solid #fecdd3',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9f1239', fontWeight: '700', fontSize: '13px' }}>
                <AlertCircle size={16} />
                <span>Integrity Validation Failed ({result.errors.length} errors)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-rose-700 pl-5 list-disc" style={{ paddingLeft: '20px', margin: 0, fontSize: '12px', color: '#be123c', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {result.errors.map((err, idx) => (
                  <li key={idx}>
                    <span className="font-mono text-[11px] font-bold" style={{ fontFamily: 'monospace', fontWeight: '700' }}>[{err.path}]</span>: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings && result.warnings.length > 0 && (
            <div
              className="p-5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3"
              style={{
                padding: '20px',
                backgroundColor: 'rgba(254, 243, 199, 0.8)',
                border: '1px solid #fde68a',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: '700', fontSize: '13px' }}>
                <AlertTriangle size={16} />
                <span>Configuration Warnings ({result.warnings.length})</span>
              </div>
              <ul className="space-y-1 text-xs text-amber-700 pl-5 list-disc" style={{ paddingLeft: '20px', margin: 0, fontSize: '12px', color: '#b45309', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {result.warnings.map((w, idx) => (
                  <li key={idx}>
                    <span className="font-mono text-[11px] font-bold" style={{ fontFamily: 'monospace', fontWeight: '700' }}>[{w.path}]</span>: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div
          className="p-8 text-center text-xs text-slate-500 font-medium border border-dashed border-slate-200 rounded-2xl bg-slate-50/50"
          style={{
            padding: '36px',
            textAlign: 'center',
            fontSize: '12px',
            color: '#64748b',
            fontWeight: '500',
            border: '1px dashed #cbd5e1',
            borderRadius: '16px',
            backgroundColor: 'rgba(248, 250, 252, 0.5)'
          }}
        >
          Click &quot;Run Validation&quot; to evaluate this draft configuration against authoritative business rules.
        </div>
      )}
    </div>
  );
}
