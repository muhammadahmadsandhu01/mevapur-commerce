'use client';

import React, { useState } from 'react';
import { FileCheck, Plus, Trash2, CheckCircle2, AlertTriangle, Scale, Shield, Landmark } from 'lucide-react';
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
      priority: 100,
      destinationCountry: 'AE',
      destinationSubdivision: '',
      taxType: 'VAT',
      taxTreatment: 'exclusive',
      taxableBasis: 'subtotal',
      taxRateNumerator: 500,
      taxRateDenominator: 10000, // 5%
      dutyRateNumerator: 0,
      dutyRateDenominator: 10000,
      roundingMode: 'HALF_UP',
      roundingScope: 'subtotal',
      incoterm: 'DAP',
      customsValueIncludesShipping: false,
      customsValueIncludesInsurance: false,
      dutyRefundPolicy: 'NON_REFUNDABLE',
      taxRefundPolicy: 'REFUNDABLE',
      providerType: 'MANUAL_GOVERNED',
      providerReference: '',
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
        className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '8px' }}
      >
        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className="p-2 rounded-xl bg-orange-50 text-[#ff8a00]"
            style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#fff7ed', color: '#ff8a00', display: 'inline-flex' }}
          >
            <FileCheck size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Exact Rational Tax & Customs Rules
            </h3>
            <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
              Deterministic rational tax arithmetic, customs valuation, de-minimis thresholds, and refund allocation policies.
            </p>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleAddRule}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#ff8a00] hover:bg-[#ea580c] text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
            style={{
              backgroundColor: '#ff8a00',
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
            <Plus size={14} /> Add Tax & Customs Rule
          </button>
        )}
      </div>

      <div className="space-y-4">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl">
            No tax or customs rules configured. Add destination rules to enforce deterministic landed cost governance.
          </div>
        ) : (
          rules.map((rule, idx) => {
            const isEditing = editingIndex === idx;
            const taxPct = formatRationalPercentage(rule.taxRateNumerator, rule.taxRateDenominator || 10000);
            const dutyPct = formatRationalPercentage(rule.dutyRateNumerator || 0, rule.dutyRateDenominator || 10000);
            const isDDP = rule.incoterm === 'DDP';
            const isDAP = rule.incoterm === 'DAP';

            return (
              <div
                key={rule.ruleId || idx}
                className={`p-4 border rounded-xl transition text-xs space-y-3 bg-white shadow-xs ${
                  rule.enabled ? 'border-slate-200/90 hover:border-slate-300' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(226, 232, 240, 0.9)',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div className="flex items-center gap-2 flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      className="font-bold text-slate-900 text-sm px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200"
                      style={{
                        display: 'inline-flex',
                        padding: '4px 10px',
                        backgroundColor: '#f1f5f9',
                        color: '#0f172a',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        fontWeight: 700
                      }}
                    >
                      {rule.destinationCountry}
                    </span>
                    {rule.destinationSubdivision && (
                      <span
                        className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded text-[10px] border border-slate-200"
                        style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          fontSize: '10px',
                          fontWeight: 700
                        }}
                      >
                        {rule.destinationSubdivision}
                      </span>
                    )}
                    <span
                      className="px-2.5 py-1 bg-slate-100 text-slate-800 font-semibold rounded-lg text-[11px] border border-slate-200"
                      style={{
                        display: 'inline-flex',
                        padding: '4px 8px',
                        backgroundColor: '#f1f5f9',
                        color: '#1e293b',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '11px',
                        fontWeight: 600
                      }}
                    >
                      {rule.taxType} ({taxPct}) · {rule.taxTreatment}
                    </span>
                    <span
                      className={`px-2.5 py-1 font-semibold rounded-lg text-[11px] border ${
                        isDDP ? 'bg-blue-50 text-blue-800 border-blue-200' : isDAP ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                      style={{
                        display: 'inline-flex',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: isDDP ? '#eff6ff' : isDAP ? '#fffbeb' : '#f1f5f9',
                        color: isDDP ? '#1e40af' : isDAP ? '#78350f' : '#1e293b',
                        border: isDDP ? '1px solid #bfdbfe' : isDAP ? '1px solid #fde68a' : '1px solid #e2e8f0'
                      }}
                    >
                      Incoterm: {rule.incoterm}
                    </span>
                    {(rule.dutyRateNumerator || 0) > 0 && (
                      <span
                        className="px-2.5 py-1 bg-purple-50 text-purple-900 font-semibold rounded-lg text-[11px] border border-purple-200"
                        style={{
                          display: 'inline-flex',
                          padding: '4px 8px',
                          backgroundColor: '#faf5ff',
                          color: '#581c87',
                          borderRadius: '8px',
                          border: '1px solid #e9d5ff',
                          fontSize: '11px',
                          fontWeight: 600
                        }}
                      >
                        Duty: {dutyPct}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 font-medium" style={{ color: '#64748b', fontSize: '11px', fontWeight: 500 }}>
                      Priority: <strong className="text-slate-800 font-mono" style={{ color: '#1e293b', fontFamily: 'monospace' }}>{rule.priority ?? 100}</strong>
                    </span>
                    {rule.verificationStatus === 'VERIFIED_LEGAL_RULE' ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 10px',
                          backgroundColor: '#ecfdf5',
                          color: '#065f46',
                          borderRadius: '9999px',
                          border: '1px solid #a7f3d0',
                          fontSize: '10px',
                          fontWeight: 600
                        }}
                      >
                        <CheckCircle2 size={11} /> Legal Verified
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 10px',
                          backgroundColor: '#fffbeb',
                          color: '#92400e',
                          borderRadius: '9999px',
                          border: '1px solid #fde68a',
                          fontSize: '10px',
                          fontWeight: 600
                        }}
                      >
                        <AlertTriangle size={11} /> Unverified Estimate
                      </span>
                    )}
                  </div>

                  {!disabled && (
                    <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer mr-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled !== false}
                          onChange={(e) => handleUpdateRule(idx, { enabled: e.target.checked })}
                          className="rounded text-[#ff8a00] focus:ring-[#ff8a00]"
                        />
                        <span>Enabled</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditingIndex(isEditing ? null : idx)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer bg-white"
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          backgroundColor: '#ffffff',
                          color: '#334155',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(idx)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 transition cursor-pointer bg-white"
                        style={{
                          padding: '6px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          backgroundColor: '#ffffff',
                          color: '#e11d48',
                          cursor: 'pointer'
                        }}
                        title="Delete Rule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="pt-4 border-t border-slate-200 space-y-4 bg-slate-50/80 p-4 rounded-xl">
                    {/* Core Route & Priority */}
                    <fieldset className="space-y-2">
                      <legend className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Scale size={13} className="text-[#ff8a00]" /> Jurisdiction & Classification
                      </legend>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Destination Country (ISO-2) <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="text"
                            maxLength={2}
                            value={rule.destinationCountry}
                            onChange={(e) => handleUpdateRule(idx, { destinationCountry: e.target.value.toUpperCase().slice(0, 2) })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-bold uppercase"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Subdivision / State / Emirate
                          </label>
                          <input
                            type="text"
                            value={rule.destinationSubdivision || ''}
                            onChange={(e) => handleUpdateRule(idx, { destinationSubdivision: e.target.value.trim() || null })}
                            placeholder="e.g. Dubai, CA, Sindh (Optional)"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Priority (Integer)</label>
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={rule.priority ?? 100}
                            onChange={(e) => handleUpdateRule(idx, { priority: parseInt(e.target.value, 10) || 100 })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Incoterm <span className="text-rose-600">*</span>
                          </label>
                          <select
                            value={rule.incoterm}
                            onChange={(e) => handleUpdateRule(idx, { incoterm: e.target.value as TaxRule['incoterm'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="DOMESTIC">DOMESTIC (Standard Domestic Terms)</option>
                            <option value="DAP">DAP (Delivered at Place · Duty unpaid at checkout)</option>
                            <option value="DDP">DDP (Delivered Duty Paid · Duty prepaid at checkout)</option>
                          </select>
                        </div>
                      </div>
                    </fieldset>

                    {/* Tax & Duty Rates (Rational Arithmetic) */}
                    <fieldset className="space-y-2 pt-3 border-t border-slate-200">
                      <legend className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Landmark size={13} className="text-[#ff8a00]" /> Rational Rates & Valuation Basis
                      </legend>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                            value={rule.taxTreatment || 'exclusive'}
                            onChange={(e) => handleUpdateRule(idx, { taxTreatment: e.target.value as TaxRule['taxTreatment'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="exclusive">Exclusive (Added to checkout total)</option>
                            <option value="inclusive">Inclusive (Extracted from item subtotal)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Taxable Basis</label>
                          <select
                            value={rule.taxableBasis || 'subtotal'}
                            onChange={(e) => handleUpdateRule(idx, { taxableBasis: e.target.value as TaxRule['taxableBasis'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="subtotal">Subtotal (Goods value only)</option>
                            <option value="subtotal_shipping">Subtotal + Shipping</option>
                            <option value="cif">CIF Value (Goods + Shipping + Insurance)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Rounding Mode</label>
                          <select
                            value={rule.roundingMode || 'HALF_UP'}
                            onChange={(e) => handleUpdateRule(idx, { roundingMode: e.target.value as TaxRule['roundingMode'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="HALF_UP">HALF_UP (Standard commercial)</option>
                            <option value="HALF_EVEN">HALF_EVEN (Banker rounding)</option>
                            <option value="FLOOR">FLOOR (Truncate down)</option>
                            <option value="CEIL">CEIL (Always round up)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Tax Rate: Numerator / Denominator
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={rule.taxRateNumerator}
                              onChange={(e) => handleUpdateRule(idx, { taxRateNumerator: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              placeholder="Numerator"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                            <span className="font-bold text-slate-400">/</span>
                            <input
                              type="number"
                              min={1}
                              value={rule.taxRateDenominator || 10000}
                              onChange={(e) => handleUpdateRule(idx, { taxRateDenominator: Math.max(1, parseInt(e.target.value, 10) || 10000) })}
                              placeholder="Denominator"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                          </div>
                          <p className="mt-1 text-[10px] font-bold text-slate-600">
                            Effective Tax Rate: {taxPct}
                          </p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Duty Rate: Numerator / Denominator
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={rule.dutyRateNumerator || 0}
                              onChange={(e) => handleUpdateRule(idx, { dutyRateNumerator: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              placeholder="Numerator"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                            <span className="font-bold text-slate-400">/</span>
                            <input
                              type="number"
                              min={1}
                              value={rule.dutyRateDenominator || 10000}
                              onChange={(e) => handleUpdateRule(idx, { dutyRateDenominator: Math.max(1, parseInt(e.target.value, 10) || 10000) })}
                              placeholder="Denominator"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                          </div>
                          <p className="mt-1 text-[10px] font-bold text-slate-600">
                            Effective Duty Rate: {dutyPct}
                          </p>
                        </div>

                        <div className="flex items-center gap-4 pt-4 sm:col-span-2">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-semibold">
                            <input
                              type="checkbox"
                              checked={Boolean(rule.customsValueIncludesShipping)}
                              onChange={(e) => handleUpdateRule(idx, { customsValueIncludesShipping: e.target.checked })}
                              className="rounded text-[#ff8a00] focus:ring-[#ff8a00]"
                            />
                            <span>Customs Valuation Includes Shipping</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-semibold">
                            <input
                              type="checkbox"
                              checked={Boolean(rule.customsValueIncludesInsurance)}
                              onChange={(e) => handleUpdateRule(idx, { customsValueIncludesInsurance: e.target.checked })}
                              className="rounded text-[#ff8a00] focus:ring-[#ff8a00]"
                            />
                            <span>Customs Valuation Includes Insurance</span>
                          </label>
                        </div>
                      </div>
                    </fieldset>

                    {/* De-Minimis Exemption Thresholds */}
                    <fieldset className="space-y-2 pt-3 border-t border-slate-200">
                      <legend className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Shield size={13} className="text-[#ff8a00]" /> De-Minimis Thresholds & Basis Evaluation
                      </legend>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">De-Minimis Basis</label>
                          <select
                            value={rule.deMinimisBasis || ''}
                            onChange={(e) => handleUpdateRule(idx, { deMinimisBasis: (e.target.value || null) as TaxRule['deMinimisBasis'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="">None (No de-minimis evaluated)</option>
                            <option value="GOODS_VALUE">Goods value</option>
                            <option value="CUSTOMS_VALUE">Customs value</option>
                            <option value="CIF">CIF — goods, shipping and insurance</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Comparison Operator</label>
                          <select
                            value={rule.deMinimisComparison || ''}
                            onChange={(e) => handleUpdateRule(idx, { deMinimisComparison: (e.target.value || null) as TaxRule['deMinimisComparison'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="">None</option>
                            <option value="LT">Less Than (&lt;)</option>
                            <option value="LTE">Less Than or Equal (&le;)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Duty De-Minimis Minor Units
                          </label>
                          <input
                            type="text"
                            value={String(rule.customsDutyDeMinimisExact?.amountMinor ?? '')}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d]/g, '');
                              handleUpdateRule(idx, {
                                customsDutyDeMinimisExact: val
                                  ? { amountMinor: val, currency: rule.customsDutyDeMinimisExact?.currency || 'USD', exponent: rule.customsDutyDeMinimisExact?.exponent ?? 2 }
                                  : null,
                              });
                            }}
                            placeholder="e.g. 80000 for $800.00"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Import Tax De-Minimis Minor Units
                          </label>
                          <input
                            type="text"
                            value={String(rule.importTaxDeMinimisExact?.amountMinor ?? '')}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d]/g, '');
                              handleUpdateRule(idx, {
                                importTaxDeMinimisExact: val
                                  ? { amountMinor: val, currency: rule.importTaxDeMinimisExact?.currency || 'USD', exponent: rule.importTaxDeMinimisExact?.exponent ?? 2 }
                                  : null,
                              });
                            }}
                            placeholder="e.g. 15000 for $150.00"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                          />
                        </div>
                      </div>
                    </fieldset>

                    {/* Refund Policies & Legal Provenance */}
                    <fieldset className="space-y-2 pt-3 border-t border-slate-200">
                      <legend className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={13} className="text-[#ff8a00]" /> Refund Governance & Legal Provenance
                      </legend>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Duty Refund Policy <span className="text-rose-600">*</span>
                          </label>
                          <select
                            value={rule.dutyRefundPolicy || 'NON_REFUNDABLE'}
                            onChange={(e) => handleUpdateRule(idx, { dutyRefundPolicy: e.target.value as TaxRule['dutyRefundPolicy'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="NON_REFUNDABLE">NON_REFUNDABLE (Duty retained by customs)</option>
                            <option value="REFUNDABLE">REFUNDABLE (Merchant refunds paid duty)</option>
                            <option value="MANUAL_REVIEW">MANUAL_REVIEW (Requires staff investigation)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Tax Refund Policy <span className="text-rose-600">*</span>
                          </label>
                          <select
                            value={rule.taxRefundPolicy || 'REFUNDABLE'}
                            onChange={(e) => handleUpdateRule(idx, { taxRefundPolicy: e.target.value as TaxRule['taxRefundPolicy'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="REFUNDABLE">REFUNDABLE (Full tax refund upon return)</option>
                            <option value="PROPORTIONAL">PROPORTIONAL (Pro-rated for partial returns)</option>
                            <option value="NON_REFUNDABLE">NON_REFUNDABLE (Tax non-refundable)</option>
                            <option value="MANUAL_REVIEW">MANUAL_REVIEW (Requires compliance review)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Legal Verification Status <span className="text-rose-600">*</span>
                          </label>
                          <select
                            value={rule.verificationStatus || 'VERIFIED_LEGAL_RULE'}
                            onChange={(e) => handleUpdateRule(idx, { verificationStatus: e.target.value as TaxRule['verificationStatus'] })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                          >
                            <option value="VERIFIED_LEGAL_RULE">VERIFIED_LEGAL_RULE (Official Gazette / Statute)</option>
                            <option value="UNVERIFIED_ESTIMATE">UNVERIFIED_ESTIMATE (Operational estimate)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Source Authority <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={rule.sourceAuthority}
                            onChange={(e) => handleUpdateRule(idx, { sourceAuthority: e.target.value })}
                            placeholder="e.g. Federal Board of Revenue (FBR) / HMRC"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            required
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Source Reference / Statute Law <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={rule.sourceReference}
                            onChange={(e) => handleUpdateRule(idx, { sourceReference: e.target.value })}
                            placeholder="e.g. Sales Tax Act 1990 Sec 3(1) / Customs Tariff Schedule"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            required
                          />
                        </div>
                      </div>
                    </fieldset>
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
