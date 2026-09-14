'use client';

import React, { useState } from 'react';
import { Truck, Plus, Trash2 } from 'lucide-react';
import type { ShippingRule } from '../../types/commerceGovernance';
import { formatExactMoney } from '../../lib/exactMoney';

interface ShippingRulesEditorProps {
  rules: ShippingRule[];
  defaultCurrency: string;
  merchantCountry: string;
  onChange: (rules: ShippingRule[]) => void;
  disabled?: boolean;
}

export default function ShippingRulesEditor({
  rules,
  defaultCurrency,
  merchantCountry,
  onChange,
  disabled,
}: ShippingRulesEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAddRule = () => {
    const newRule: ShippingRule = {
      ruleId: `ship_${Date.now()}`,
      name: 'Standard International Delivery',
      serviceCode: 'standard',
      displayName: 'Standard Tracked Delivery',
      originCountry: merchantCountry || 'PK',
      destinationCountry: 'AE',
      currency: defaultCurrency || 'PKR',
      baseRateExact: {
        amountMinor: '25000',
        currency: defaultCurrency || 'PKR',
        exponent: 2,
      },
      deliveryMinDays: 3,
      deliveryMaxDays: 7,
      weightBands: [],
      enabled: true,
    };
    onChange([...rules, newRule]);
    setEditingIndex(rules.length);
  };

  const handleUpdateRule = (index: number, updates: Partial<ShippingRule>) => {
    const updated = rules.map((r, idx) => (idx === index ? { ...r, ...updates } : r));
    onChange(updated);
  };

  const handleDeleteRule = (index: number) => {
    onChange(rules.filter((_, idx) => idx !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Truck className="text-[#ff8a00]" size={20} />
          <div>
            <h3 className="text-base font-bold text-slate-900">Shipping Rules & Zones</h3>
            <p className="text-xs text-slate-500">Destination routing rates, delivery promises, and weight tier rules.</p>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleAddRule}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Shipping Rule
          </button>
        )}
      </div>

      <div className="space-y-4">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl">
            No shipping rules defined. Add rules to allow checkout quote calculations.
          </div>
        ) : (
          rules.map((rule, idx) => {
            const isEditing = editingIndex === idx;
            return (
              <div
                key={rule.ruleId || idx}
                className={`p-4 border rounded-xl transition text-xs space-y-3 ${
                  rule.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-900">{rule.name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] rounded uppercase font-bold">
                      {rule.originCountry} → {rule.destinationCountry}
                    </span>
                    <span className="font-bold text-emerald-700">
                      {formatExactMoney(rule.baseRateExact)}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      ({rule.deliveryMinDays} - {rule.deliveryMaxDays} days)
                    </span>
                  </div>

                  {!disabled && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingIndex(isEditing ? null : idx)}
                        className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded-lg font-semibold transition"
                      >
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(idx)}
                        className="p-1 hover:bg-rose-100 text-rose-600 rounded transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-lg">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Rule Name</label>
                      <input
                        type="text"
                        value={rule.name}
                        onChange={(e) => handleUpdateRule(idx, { name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Service Code</label>
                      <select
                        value={rule.serviceCode}
                        onChange={(e) => handleUpdateRule(idx, { serviceCode: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                      >
                        <option value="standard">standard</option>
                        <option value="express">express</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Destination Country</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={rule.destinationCountry}
                        onChange={(e) => handleUpdateRule(idx, { destinationCountry: e.target.value.toUpperCase().slice(0, 2) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-bold uppercase"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Base Rate (Minor Amount)</label>
                      <input
                        type="text"
                        value={String(rule.baseRateExact?.amountMinor || '0')}
                        onChange={(e) =>
                          handleUpdateRule(idx, {
                            baseRateExact: {
                              amountMinor: e.target.value.replace(/[^\d]/g, '') || '0',
                              currency: rule.currency || defaultCurrency || 'PKR',
                              exponent: 2,
                            },
                          })
                        }
                        placeholder="e.g. 25000 for 250.00"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Min Delivery Days</label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={rule.deliveryMinDays}
                        onChange={(e) => handleUpdateRule(idx, { deliveryMinDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Max Delivery Days</label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={rule.deliveryMaxDays}
                        onChange={(e) => handleUpdateRule(idx, { deliveryMaxDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
