'use client';

import React from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import type { FulfillmentOrigin } from '../../types/commerceGovernance';

interface FulfillmentOriginsEditorProps {
  origins: FulfillmentOrigin[];
  onChange: (origins: FulfillmentOrigin[]) => void;
  disabled?: boolean;
}

export default function FulfillmentOriginsEditor({ origins, onChange, disabled }: FulfillmentOriginsEditorProps) {
  const handleAddOrigin = () => {
    const newOrigin: FulfillmentOrigin = {
      originId: `orig_${Date.now()}`,
      name: 'Primary Fulfillment Warehouse',
      country: 'PK',
      city: 'Lahore',
      subdivision: 'Punjab',
      postalCode: '54000',
      timeZone: 'Asia/Karachi',
      enabled: true,
      isDefault: origins.length === 0,
    };
    onChange([...origins, newOrigin]);
  };

  const handleUpdateOrigin = (index: number, field: keyof FulfillmentOrigin, value: unknown) => {
    const updated = origins.map((orig, idx) => {
      if (idx === index) {
        return { ...orig, [field]: value };
      }
      if (field === 'isDefault' && value === true) {
        return { ...orig, isDefault: false };
      }
      return orig;
    });
    onChange(updated);
  };

  const handleDeleteOrigin = (index: number) => {
    if (origins.length <= 1) {
      alert('At least one fulfillment origin is required.');
      return;
    }
    const updated = origins.filter((_, idx) => idx !== index);
    if (origins[index]?.isDefault && updated.length > 0) {
      updated[0].isDefault = true;
    }
    onChange(updated);
  };

  return (
    <div
      className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 space-y-6 mt-4"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        marginTop: '16px'
      }}
    >
      <div
        className="flex items-center justify-between pb-4 border-b border-slate-100"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}
      >
        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className="p-2 rounded-xl bg-orange-50 text-[#ff8a00]"
            style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#fff7ed', color: '#ff8a00', display: 'inline-flex' }}
          >
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Fulfillment Origins
            </h3>
            <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
              Warehouses, dispatch hubs, and shipping fulfillment physical origins.
            </p>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleAddOrigin}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0b132b] hover:bg-[#1c2a4f] text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
            style={{
              backgroundColor: '#0b132b',
              color: '#ffffff',
              padding: '8px 14px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Plus size={14} /> Add Origin
          </button>
        )}
      </div>

      <div className="space-y-4">
        {origins.map((orig, idx) => (
          <div
            key={orig.originId || idx}
            className="p-4 border border-slate-200/90 rounded-xl bg-slate-50/70 space-y-3 text-xs shadow-2xs"
            style={{
              backgroundColor: 'rgba(248, 250, 252, 0.7)',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              borderRadius: '12px',
              padding: '16px'
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div className="flex items-center gap-2.5" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="font-bold text-slate-900 text-sm" style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{orig.name || 'Unnamed Warehouse'}</span>
                {orig.isDefault && (
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px] rounded-full"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 10px',
                      backgroundColor: '#ecfdf5',
                      color: '#047857',
                      border: '1px solid #a7f3d0',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    Default Origin
                  </span>
                )}
              </div>
              {!disabled && (
                <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleUpdateOrigin(idx, 'isDefault', true)}
                    disabled={orig.isDefault}
                    className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline font-semibold disabled:opacity-40 disabled:no-underline cursor-pointer"
                    style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600, background: 'none', border: 'none', cursor: orig.isDefault ? 'default' : 'pointer' }}
                  >
                    Make Default
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteOrigin(idx)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 transition cursor-pointer"
                    style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#e11d48', backgroundColor: '#ffffff', cursor: 'pointer' }}
                    title="Delete origin"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', paddingTop: '4px' }}>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Origin Name</label>
                <input
                  type="text"
                  disabled={disabled}
                  value={orig.name}
                  onChange={(e) => handleUpdateOrigin(idx, 'name', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] shadow-xs"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Country (ISO 3166-1)</label>
                <input
                  type="text"
                  maxLength={2}
                  disabled={disabled}
                  value={orig.country}
                  onChange={(e) => handleUpdateOrigin(idx, 'country', e.target.value.toUpperCase().slice(0, 2))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 uppercase font-bold outline-none focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] shadow-xs"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>City</label>
                <input
                  type="text"
                  disabled={disabled}
                  value={orig.city}
                  onChange={(e) => handleUpdateOrigin(idx, 'city', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] shadow-xs"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Timezone</label>
                <input
                  type="text"
                  disabled={disabled}
                  value={orig.timeZone}
                  onChange={(e) => handleUpdateOrigin(idx, 'timeZone', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] shadow-xs"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
