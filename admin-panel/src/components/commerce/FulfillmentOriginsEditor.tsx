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
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <MapPin className="text-[#ff8a00]" size={20} />
          <div>
            <h3 className="text-base font-bold text-slate-900">Fulfillment Origins</h3>
            <p className="text-xs text-slate-500">Warehouses, dispatch hubs, and shipping fulfillment physical origins.</p>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleAddOrigin}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Origin
          </button>
        )}
      </div>

      <div className="space-y-4">
        {origins.map((orig, idx) => (
          <div
            key={orig.originId || idx}
            className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{orig.name || 'Unnamed Warehouse'}</span>
                {orig.isDefault && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">
                    Default Origin
                  </span>
                )}
              </div>
              {!disabled && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateOrigin(idx, 'isDefault', true)}
                    disabled={orig.isDefault}
                    className="text-[11px] text-blue-600 hover:underline font-semibold disabled:opacity-40 disabled:no-underline"
                  >
                    Make Default
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteOrigin(idx)}
                    className="p-1 hover:bg-rose-100 text-rose-600 rounded transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Origin Name</label>
                <input
                  type="text"
                  disabled={disabled}
                  value={orig.name}
                  onChange={(e) => handleUpdateOrigin(idx, 'name', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Country (ISO 3166-1)</label>
                <input
                  type="text"
                  maxLength={2}
                  disabled={disabled}
                  value={orig.country}
                  onChange={(e) => handleUpdateOrigin(idx, 'country', e.target.value.toUpperCase().slice(0, 2))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 uppercase font-bold bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">City</label>
                <input
                  type="text"
                  disabled={disabled}
                  value={orig.city}
                  onChange={(e) => handleUpdateOrigin(idx, 'city', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Timezone</label>
                <input
                  type="text"
                  disabled={disabled}
                  value={orig.timeZone}
                  onChange={(e) => handleUpdateOrigin(idx, 'timeZone', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
