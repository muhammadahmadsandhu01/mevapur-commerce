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
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">Active</span>;
      case 'validated':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-blue-100 text-blue-900 border border-blue-300">Validated</span>;
      case 'draft':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-amber-100 text-amber-900 border border-amber-300">Draft</span>;
      case 'scheduled':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-purple-100 text-purple-900 border border-purple-300">Scheduled</span>;
      case 'superseded':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-slate-100 text-slate-700 border border-slate-300">Superseded</span>;
      case 'retired':
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-rose-100 text-rose-800 border border-rose-300">Retired</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-black rounded-full bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers size={18} className="text-[#ff8a00]" /> Configuration Versions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable version history with optimistic lock tracking and lifecycle state.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateDraft}
          className="px-4 py-2 bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-black text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
        >
          <Plus size={15} /> New Draft Version
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-600 font-bold uppercase tracking-wider">
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Markets & Rules</th>
              <th className="py-3 px-4">Lock</th>
              <th className="py-3 px-4">Effective Dates</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {versions.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
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
                      isSelected ? 'bg-orange-50/30' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-black text-slate-900">
                      v{ver.version}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(ver.status)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {ver.merchantProfile?.enabledCountries?.length || 0}
                      </span> markets · <span className="font-semibold text-slate-800">
                        {ver.shippingRules?.length || 0}
                      </span> shipping · <span className="font-semibold text-slate-800">
                        {ver.taxRules?.length || 0}
                      </span> tax
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                      vLock:{ver.lockVersion}
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-600">
                      {ver.effectiveFrom ? (
                        <div>
                          From: <span className="font-semibold text-slate-800">{new Date(ver.effectiveFrom).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Not active</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {/* Simulation / Preview */}
                        <button
                          type="button"
                          onClick={() => onSimulate(ver)}
                          title="Simulate quote with this version"
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition"
                        >
                          <Play size={14} />
                        </button>

                        {/* Edit Draft */}
                        {ver.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => onEditDraft(ver)}
                            title="Edit Draft"
                            className="p-1.5 hover:bg-orange-50 text-[#ff8a00] rounded-lg transition"
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
                            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition"
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
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition"
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
                            className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition"
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
                            className="p-1.5 hover:bg-red-100 text-red-700 rounded-lg transition"
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
