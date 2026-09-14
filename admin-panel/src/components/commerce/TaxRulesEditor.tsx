'use client';

import React, { useState } from 'react';
import { FileCheck, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { TaxRule } from '../../types/commerceGovernance';
import { formatRationalPercentage } from '../../lib/exactMoney';

interface TaxRulesEditorProps {
  rules: TaxRule[];
  merchantCountry?: string;
  onChange: (rules: TaxRule[]) => void;
  disabled?: boolean;
}

export default function TaxRulesEditor({
  rules,
  onChange,
  disabled,
}: TaxRulesEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAddRule = () => {
    const newRule: TaxRule = {
      ruleId: `tax_${Date.now()}`,
      destinationCountry: 'AE',
      taxType: 'VAT',
      taxTreatment: 'exclusive',
      taxableBasis: 'subtotal',
      taxRateNumerator: 500,
      taxRateDenominator: 10000, // 5%
      dutyRateNumerator: 0,
      dutyRateDenominator: 10000,
      roundingMode: 'HALF_UP',
      incoterm: 'DAP',
      sourceAuthority: 'Federal Tax Authority (FTA)',
      sourceReference: 'UAE VAT Law Decree 8/2017',
      verificationStatus: 'VERIFIED_LEGAL_RULE',
      requiresTax: true,
      requiresDuty: false,
      enabled: true,
    };
    onChange([...rules, newRule]);
    setEditingIndex(rules.length);
  };

  const handleUpdateRule = (index: number, updates: Partial<TaxRule>) => {
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
          <FileCheck className="text-[#ff8a00]" size={20} />
          <div>
            <h3 className="text-base font-bold text-slate-900">Exact Rational Tax & Customs Rules</h3>
            <p className="text-xs text-slate-500">
              Deterministic rational tax arithmetic (exact integer numerator/denominator) and customs duty rules.
            </p>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleAddRule}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Tax Rule
          </button>
        )}
      </div>

      <div className="space-y-4">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl">
            No tax rules defined. Add destination tax rules to enforce exact tax and customs quotes.
          </div>
        ) : (
          rules.map((rule, idx) => {
            const isEditing = editingIndex === idx;
            const taxPct = formatRationalPercentage(rule.taxRateNumerator, rule.taxRateDenominator || 10000);
            const dutyPct = formatRationalPercentage(rule.dutyRateNumerator || 0, rule.dutyRateDenominator || 10000);

            return (
              <div
                key={rule.ruleId || idx}
                className={`p-4 border rounded-xl transition text-xs space-y-3 ${
                  rule.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-900">{rule.destinationCountry}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[11px]">
                      {rule.taxType} ({taxPct})
                    </span>
                    {rule.requiresDuty && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold rounded text-[11px]">
                        Duty: {dutyPct} ({rule.incoterm})
                      </span>
                    )}
                    <span className="text-slate-500 text-[11px]">
                      Basis: <span className="font-bold text-slate-700">{rule.taxTreatment} {rule.taxableBasis}</span>
                    </span>
                    {rule.verificationStatus === 'VERIFIED_LEGAL_RULE' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                        <CheckCircle2 size={11} /> Legal Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                        <AlertTriangle size={11} /> Estimate
                      </span>
                    )}
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
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Tax Type</label>
                      <select
                        value={rule.taxType}
                        onChange={(e) => handleUpdateRule(idx, { taxType: e.target.value as TaxRule['taxType'] })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                      >
                        <option value="VAT">VAT</option>
                        <option value="GST">GST</option>
                        <option value="SALES_TAX">SALES_TAX</option>
                        <option value="CUSTOMS_VAT">CUSTOMS_VAT</option>
                        <option value="EXEMPT">EXEMPT</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Tax Treatment</label>
                      <select
                        value={rule.taxTreatment}
                        onChange={(e) => handleUpdateRule(idx, { taxTreatment: e.target.value as TaxRule['taxTreatment'] })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                      >
                        <option value="exclusive">Exclusive (Added to subtotal)</option>
                        <option value="inclusive">Inclusive (Extracted from subtotal)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Tax Rate Numerator (out of 10,000)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10000000}
                        value={rule.taxRateNumerator}
                        onChange={(e) => handleUpdateRule(idx, { taxRateNumerator: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        placeholder="e.g. 1700 for 17%"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Incoterm</label>
                      <select
                        value={rule.incoterm}
                        onChange={(e) => handleUpdateRule(idx, { incoterm: e.target.value as TaxRule['incoterm'] })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                      >
                        <option value="DOMESTIC">DOMESTIC</option>
                        <option value="DAP">DAP (Collect on Delivery)</option>
                        <option value="DDP">DDP (Prepaid at Checkout)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Verification Status</label>
                      <select
                        value={rule.verificationStatus}
                        onChange={(e) => handleUpdateRule(idx, { verificationStatus: e.target.value as TaxRule['verificationStatus'] })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                      >
                        <option value="VERIFIED_LEGAL_RULE">VERIFIED_LEGAL_RULE</option>
                        <option value="UNVERIFIED_ESTIMATE">UNVERIFIED_ESTIMATE</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Legal Source Authority</label>
                      <input
                        type="text"
                        value={rule.sourceAuthority}
                        onChange={(e) => handleUpdateRule(idx, { sourceAuthority: e.target.value })}
                        placeholder="e.g. Federal Board of Revenue (FBR) / HMRC"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Source Law / Reference</label>
                      <input
                        type="text"
                        value={rule.sourceReference}
                        onChange={(e) => handleUpdateRule(idx, { sourceReference: e.target.value })}
                        placeholder="e.g. Sales Tax Act 1990 Sec 3"
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
