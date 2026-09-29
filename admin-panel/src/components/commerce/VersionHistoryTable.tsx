'use client';

import React from 'react';
import {
  Layers,
  Edit3,
  CheckCircle2,
  Play,
  Archive,
  AlertOctagon,
  Plus,
} from 'lucide-react';
import type { CommerceConfigurationVersion, VersionStatus } from '../../types/commerceGovernance';

interface VersionHistoryTableProps {
  versions: CommerceConfigurationVersion[];
  selectedVersionId: string | null;
  userRole?: string;
  onSelectVersion: (version: CommerceConfigurationVersion) => void;
  onEditDraft: (version: CommerceConfigurationVersion) => void;
  onValidateDraft: (version: CommerceConfigurationVersion) => void;
  onActivate: (version: CommerceConfigurationVersion) => void;
  onRetire: (version: CommerceConfigurationVersion, isEmergency?: boolean) => void;
  onSimulate: (version: CommerceConfigurationVersion) => void;
  onCreateDraft: () => void;
}

export default function VersionHistoryTable({
  versions,
  selectedVersionId,
  userRole,
  onSelectVersion,
  onEditDraft,
  onValidateDraft,
  onActivate,
  onRetire,
  onSimulate,
  onCreateDraft,
}: VersionHistoryTableProps) {
  const isSuperAdmin = userRole === 'super_admin';

  const getStatusBadge = (status: VersionStatus) => {
    switch (status) {
      case 'active':
        return (
          <span
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: '#ecfdf5',
              color: '#047857',
              border: '1px solid #a7f3d0'
            }}
          >
            Active
          </span>
        );
      case 'validated':
        return (
          <span
            className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe'
            }}
          >
            Validated
          </span>
        );
      case 'draft':
        return (
          <span
            className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              border: '1px solid #e2e8f0'
            }}
          >
            Draft
          </span>
        );
      case 'scheduled':
        return (
          <span
            className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: '#faf5ff',
              color: '#7e22ce',
              border: '1px solid #e9d5ff'
            }}
          >
            Scheduled
          </span>
        );
      case 'superseded':
        return (
          <span
            className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: '#f8fafc',
              color: '#64748b',
              border: '1px solid #e2e8f0'
            }}
          >
            Superseded
          </span>
        );
      case 'retired':
        return (
          <span
            className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: '#fff1f2',
              color: '#be123c',
              border: '1px solid #fecdd3'
            }}
          >
            Retired
          </span>
        );
      default:
        return (
          <span
            className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: '#f1f5f9',
              color: '#1e293b'
            }}
          >
            {status}
          </span>
        );
    }
  };

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden mt-4"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        borderRadius: '16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        marginTop: '16px'
      }}
    >
      <div
        className="p-5 border-b border-slate-100 flex items-center justify-between gap-4"
        style={{
          padding: '20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Layers size={18} className="text-[#ff8a00]" style={{ color: '#ff8a00' }} /> Configuration Versions
          </h2>
          <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
            Immutable version history with optimistic lock tracking and lifecycle state.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateDraft}
          className="bg-[#ff8a00] text-white hover:bg-[#ea580c] px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
          style={{
            backgroundColor: '#ff8a00',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s'
          }}
        >
          <Plus size={15} /> + New Draft Version
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
          <thead>
            <tr
              className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                color: '#475569',
                fontSize: '11px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Version</th>
              <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Status</th>
              <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Markets & Rules</th>
              <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Lock</th>
              <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Effective Dates</th>
              <th className="py-3.5 px-4 text-right" style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {versions.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  No configuration versions found for this merchant scope.
                </td>
              </tr>
            ) : (
              versions.map((ver) => {
                const isSelected = selectedVersionId === ver._id;
                return (
                  <tr
                    key={ver._id}
                    onClick={() => onSelectVersion(ver)}
                    className={`hover:bg-slate-50/80 transition cursor-pointer ${
                      isSelected ? 'bg-orange-50/40' : ''
                    }`}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: isSelected ? 'rgba(255, 247, 237, 0.5)' : undefined,
                      cursor: 'pointer'
                    }}
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900" style={{ padding: '14px 16px', fontWeight: '700', color: '#0f172a' }}>
                      v{ver.version}
                    </td>
                    <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                      {getStatusBadge(ver.status)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600" style={{ padding: '14px 16px', color: '#475569' }}>
                      <span className="font-semibold text-slate-800" style={{ fontWeight: '600', color: '#0f172a' }}>
                        {ver.merchantProfile?.enabledCountries?.length || 0}
                      </span> markets · <span className="font-semibold text-slate-800" style={{ fontWeight: '600', color: '#0f172a' }}>
                        {ver.shippingRules?.length || 0}
                      </span> shipping · <span className="font-semibold text-slate-800" style={{ fontWeight: '600', color: '#0f172a' }}>
                        {ver.taxRules?.length || 0}
                      </span> tax
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500" style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                      vLock:{ver.lockVersion}
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-600" style={{ padding: '14px 16px', fontSize: '11px', color: '#64748b' }}>
                      {ver.effectiveFrom ? (
                        <div>
                          From: <span className="font-semibold text-slate-800" style={{ fontWeight: '600', color: '#0f172a' }}>{new Date(ver.effectiveFrom).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400" style={{ color: '#94a3b8' }}>Not active</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()} style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div className="inline-flex items-center gap-1.5 justify-end" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        {/* Simulation / Preview */}
                        <button
                          type="button"
                          onClick={() => onSimulate(ver)}
                          title="Simulate quote with this version"
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                          style={{
                            padding: '6px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Play size={14} />
                        </button>

                        {/* Edit Draft */}
                        {ver.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => onEditDraft(ver)}
                            title="Edit Draft"
                            className="p-1.5 rounded-lg border border-orange-200 hover:bg-orange-50 text-[#ff8a00] transition cursor-pointer"
                            style={{
                              padding: '6px',
                              borderRadius: '8px',
                              border: '1px solid #fed7aa',
                              backgroundColor: '#fff7ed',
                              color: '#ff8a00',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Edit3 size={14} />
                          </button>
                        )}

                        {/* Validate Draft */}
                        {ver.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => onValidateDraft(ver)}
                            title="Run Integrity Validation"
                            className="p-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 text-blue-600 transition cursor-pointer"
                            style={{
                              padding: '6px',
                              borderRadius: '8px',
                              border: '1px solid #bfdbfe',
                              backgroundColor: '#eff6ff',
                              color: '#2563eb',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}

                        {/* Activate (Super Admin only) */}
                        {(ver.status === 'validated' || ver.status === 'scheduled') && isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => onActivate(ver)}
                            title="Activate Version"
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition cursor-pointer"
                            style={{
                              padding: '4px 10px',
                              borderRadius: '8px',
                              backgroundColor: '#059669',
                              color: '#ffffff',
                              fontWeight: '700',
                              fontSize: '11px',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            Activate
                          </button>
                        )}

                        {/* Retire (Super Admin only) */}
                        {ver.status === 'active' && isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => onRetire(ver, false)}
                            title="Retire Version"
                            className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 transition cursor-pointer"
                            style={{
                              padding: '6px',
                              borderRadius: '8px',
                              border: '1px solid #fecdd3',
                              backgroundColor: '#fff1f2',
                              color: '#e11d48',
                              cursor: 'pointer'
                            }}
                          >
                            <Archive size={14} />
                          </button>
                        )}

                        {/* Emergency Revoke (Super Admin only) */}
                        {ver.status === 'active' && isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => onRetire(ver, true)}
                            title="Emergency Revoke"
                            className="p-1.5 rounded-lg border border-red-200 hover:bg-red-100 text-red-700 transition cursor-pointer"
                            style={{
                              padding: '6px',
                              borderRadius: '8px',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fee2e2',
                              color: '#b91c1c',
                              cursor: 'pointer'
                            }}
                          >
                            <AlertOctagon size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
