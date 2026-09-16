'use client';

import React, { useState } from 'react';
import {
  Truck,
  Plus,
  Trash2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ShippingRule, WeightBand } from '../../types/commerceGovernance';
import { formatExactMoney, getCurrencyExponent } from '../../lib/exactMoney';

interface ShippingRulesEditorProps {
  rules: ShippingRule[];
  defaultCurrency: string;
  merchantCountry: string;
  onChange: (rules: ShippingRule[]) => void;
  disabled?: boolean;
}

const ISO_WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
];

const COMMON_INCOTERMS: Array<'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW'> = [
  'DOMESTIC',
  'DAP',
  'DDP',
  'CIF',
  'FOB',
  'EXW',
];

export default function ShippingRulesEditor({
  rules,
  defaultCurrency,
  merchantCountry,
  onChange,
  disabled,
}: ShippingRulesEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'routing' | 'timing' | 'weights' | 'remote'>('routing');

  const handleAddRule = () => {
    const currency = defaultCurrency || (rules[0]?.currency) || '';
    const exponent = currency ? getCurrencyExponent(currency) : 2;
    const originCountry = merchantCountry || (rules[0]?.originCountry) || '';
    const newRule: ShippingRule = {
      ruleId: `ship_${Date.now()}`,
      name: 'Standard International Delivery',
      serviceCode: 'standard',
      displayName: 'Standard Tracked Delivery',
      originCountry,
      destinationCountry: 'AE',
      destinationSubdivisions: [],
      postalCodeRanges: [],
      currency,
      baseRateExact: {
        amountMinor: String(250 * Math.pow(10, exponent)),
        currency,
        exponent,
      },
      freeShippingThresholdExact: null,
      remoteRateExact: null,
      remoteCities: [],
      remotePostalPrefixes: [],
      deliveryMinDays: 3,
      deliveryMaxDays: 7,
      remoteDeliveryMinDays: null,
      remoteDeliveryMaxDays: null,
      processingCutoffLocal: '14:00',
      workingDays: [1, 2, 3, 4, 5],
      processingMinBusinessDays: 1,
      processingMaxBusinessDays: 2,
      weightBands: [],
      priority: 100,
      supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
      enabled: true,
    };
    onChange([...rules, newRule]);
    setEditingIndex(rules.length);
    setActiveSubTab('routing');
  };

  const handleUpdateRule = (index: number, updates: Partial<ShippingRule>) => {
    const updated = rules.map((r, idx) => (idx === index ? { ...r, ...updates } : r));
    onChange(updated);
  };

  const handleDeleteRule = (index: number) => {
    onChange(rules.filter((_, idx) => idx !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  // Weight Band Helpers
  const handleAddWeightBand = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const currency = rule.currency || defaultCurrency || '';
    const exponent = rule.baseRateExact?.exponent ?? (currency ? getCurrencyExponent(currency) : 2);
    const existingBands = rule.weightBands || [];
    const lastBand = existingBands[existingBands.length - 1];
    const nextMin = lastBand ? lastBand.maxWeightGrams : 0;
    const nextMax = nextMin + 1000;

    const newBand: WeightBand = {
      minWeightGrams: nextMin,
      maxWeightGrams: nextMax,
      pricingMode: 'REPLACE_BASE',
      rateExact: {
        amountMinor: String(350 * Math.pow(10, exponent)),
        currency,
        exponent,
      },
    };

    handleUpdateRule(ruleIndex, {
      weightBands: [...existingBands, newBand],
    });
  };

  const handleUpdateWeightBand = (ruleIndex: number, bandIndex: number, updates: Partial<WeightBand>) => {
    const rule = rules[ruleIndex];
    const bands = (rule.weightBands || []).map((b, idx) => (idx === bandIndex ? { ...b, ...updates } : b));
    handleUpdateRule(ruleIndex, { weightBands: bands });
  };

  const handleDeleteWeightBand = (ruleIndex: number, bandIndex: number) => {
    const rule = rules[ruleIndex];
    const bands = (rule.weightBands || []).filter((_, idx) => idx !== bandIndex);
    handleUpdateRule(ruleIndex, { weightBands: bands });
  };

  const toggleWorkingDay = (ruleIndex: number, day: number) => {
    const rule = rules[ruleIndex];
    const current = rule.workingDays || [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    handleUpdateRule(ruleIndex, { workingDays: next });
  };

  const toggleIncoterm = (ruleIndex: number, term: 'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW') => {
    const rule = rules[ruleIndex];
    const current = rule.supportedIncoterms || [];
    const next = current.includes(term)
      ? current.filter((t) => t !== term)
      : [...current, term];
    handleUpdateRule(ruleIndex, { supportedIncoterms: next });
  };

  // Rule Validation Helpers
  const getRuleValidationErrors = (rule: ShippingRule) => {
    const errors: string[] = [];

    if (!rule.serviceCode?.trim()) {
      errors.push('Service code is required.');
    }
    if (!rule.originCountry || rule.originCountry.length !== 2) {
      errors.push('Origin country must be a valid 2-letter ISO code.');
    }
    if (!rule.destinationCountry || rule.destinationCountry.length !== 2) {
      errors.push('Destination country must be a valid 2-letter ISO code.');
    }
    if (rule.deliveryMaxDays < rule.deliveryMinDays) {
      errors.push(`Max delivery days (${rule.deliveryMaxDays}) cannot be less than min delivery days (${rule.deliveryMinDays}).`);
    }
    if (
      rule.processingMaxBusinessDays !== undefined &&
      rule.processingMinBusinessDays !== undefined &&
      rule.processingMaxBusinessDays < rule.processingMinBusinessDays
    ) {
      errors.push(
        `Max processing days (${rule.processingMaxBusinessDays}) cannot be less than min processing days (${rule.processingMinBusinessDays}).`
      );
    }
    if (
      rule.remoteDeliveryMaxDays !== null &&
      rule.remoteDeliveryMaxDays !== undefined &&
      rule.remoteDeliveryMinDays !== null &&
      rule.remoteDeliveryMinDays !== undefined &&
      rule.remoteDeliveryMaxDays < rule.remoteDeliveryMinDays
    ) {
      errors.push(
        `Max remote delivery days (${rule.remoteDeliveryMaxDays}) cannot be less than min remote delivery days (${rule.remoteDeliveryMinDays}).`
      );
    }
    if (rule.processingCutoffLocal && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.processingCutoffLocal)) {
      errors.push('Processing cutoff must strictly follow HH:mm format (00:00 to 23:59).');
    }
    if (!rule.workingDays || rule.workingDays.length === 0) {
      errors.push('At least one working day must be selected.');
    }
    if (rule.workingDays && new Set(rule.workingDays).size !== rule.workingDays.length) {
      errors.push('Duplicate working days detected.');
    }

    // Weight bands overlap & bounds checks
    if (rule.weightBands && rule.weightBands.length > 0) {
      for (let i = 0; i < rule.weightBands.length; i++) {
        const b = rule.weightBands[i];
        if (b.minWeightGrams < 0) {
          errors.push(`Tier ${i + 1}: Min weight cannot be negative.`);
        }
        if (b.maxWeightGrams <= b.minWeightGrams) {
          errors.push(`Tier ${i + 1}: Max weight (${b.maxWeightGrams}g) must be greater than min weight (${b.minWeightGrams}g).`);
        }
      }

      const sortedBands = [...rule.weightBands].sort((a, b) => a.minWeightGrams - b.minWeightGrams);
      for (let i = 0; i < sortedBands.length - 1; i++) {
        if (sortedBands[i].maxWeightGrams > sortedBands[i + 1].minWeightGrams) {
          errors.push(`Weight bands overlap between ${sortedBands[i].minWeightGrams}-${sortedBands[i].maxWeightGrams}g and ${sortedBands[i + 1].minWeightGrams}-${sortedBands[i + 1].maxWeightGrams}g.`);
          break;
        }
      }
    }

    return errors;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Truck className="text-[#ff8a00]" size={20} />
          <div>
            <h3 className="text-base font-bold text-slate-900">Governed Shipping Rules & Timing</h3>
            <p className="text-xs text-slate-500">
              Arbitrary service codes, exact multi-currency rates, weight tiers, remote areas, and cutoff timing governance.
            </p>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleAddRule}
            className="px-3 py-1.5 bg-[#0b132b] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
          >
            <Plus size={14} /> Add Shipping Rule
          </button>
        )}
      </div>

      <div className="space-y-4">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl">
            No shipping rules defined. Add rules to govern checkout quote calculation and delivery promises.
          </div>
        ) : (
          rules.map((rule, idx) => {
            const isEditing = editingIndex === idx;
            const errors = getRuleValidationErrors(rule);

            return (
              <div
                key={rule.ruleId || idx}
                className={`p-4 border rounded-xl transition text-xs space-y-3 ${
                  rule.enabled
                    ? errors.length > 0
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-slate-200 bg-white'
                    : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                {/* Rule Header Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-black text-slate-900">{rule.name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] rounded uppercase font-bold">
                      {rule.originCountry} → {rule.destinationCountry}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-mono text-[10px] rounded uppercase font-bold border border-blue-200">
                      Code: {rule.serviceCode}
                    </span>
                    <span className="font-bold text-emerald-700">
                      {formatExactMoney(rule.baseRateExact)}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      ({rule.deliveryMinDays}–{rule.deliveryMaxDays} days)
                    </span>
                    {rule.processingCutoffLocal && (
                      <span className="text-slate-500 text-[11px] flex items-center gap-1">
                        <Clock size={11} className="text-slate-400" /> Cutoff: {rule.processingCutoffLocal}
                      </span>
                    )}
                    {errors.length > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold text-[10px] rounded-full flex items-center gap-1">
                        <AlertCircle size={10} /> {errors.length} issue{errors.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {!disabled && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingIndex(isEditing ? null : idx)}
                        className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded-lg font-semibold transition flex items-center gap-1"
                      >
                        {isEditing ? (
                          <>
                            Done <ChevronUp size={12} />
                          </>
                        ) : (
                          <>
                            Edit <ChevronDown size={12} />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(idx)}
                        className="p-1 hover:bg-rose-100 text-rose-600 rounded transition"
                        title="Delete rule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Rule Editor */}
                {isEditing && (
                  <div className="pt-3 border-t border-slate-200 space-y-4 bg-slate-50/70 p-4 rounded-xl">
                    {/* Validation Alert */}
                    {errors.length > 0 && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-1">
                        <p className="font-bold text-rose-900 flex items-center gap-1.5 text-xs">
                          <AlertCircle size={14} className="text-rose-600" /> Validation Issues in Rule:
                        </p>
                        <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-rose-800">
                          {errors.map((err, errIdx) => (
                            <li key={errIdx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Sub-tabs for Rule Editing */}
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('routing')}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          activeSubTab === 'routing' ? 'bg-[#0b132b] text-white' : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Routing & Rates
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('timing')}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          activeSubTab === 'timing' ? 'bg-[#0b132b] text-white' : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Cutoff & Timing Promise
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('weights')}
                        className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                          activeSubTab === 'weights' ? 'bg-[#0b132b] text-white' : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Weight Bands ({rule.weightBands?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('remote')}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          activeSubTab === 'remote' ? 'bg-[#0b132b] text-white' : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Remote Areas
                      </button>
                    </div>

                    {/* TAB 1: Routing & Rates */}
                    {activeSubTab === 'routing' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <div>
                            <label htmlFor={`rule-name-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Rule Name
                            </label>
                            <input
                              id={`rule-name-${idx}`}
                              type="text"
                              value={rule.name}
                              onChange={(e) => handleUpdateRule(idx, { name: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-semibold"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-serviceCode-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Governed Service Code (Arbitrary Identifier)
                            </label>
                            <input
                              id={`rule-serviceCode-${idx}`}
                              type="text"
                              value={rule.serviceCode}
                              onChange={(e) => handleUpdateRule(idx, { serviceCode: e.target.value.toLowerCase().trim() })}
                              placeholder="e.g. standard, express, priority_cargo"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono font-bold"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-displayName-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Display Name (Storefront Label)
                            </label>
                            <input
                              id={`rule-displayName-${idx}`}
                              type="text"
                              value={rule.displayName || ''}
                              onChange={(e) => handleUpdateRule(idx, { displayName: e.target.value })}
                              placeholder="e.g. Aramex UAE Priority Air"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-originCountry-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Origin Country (ISO-2)
                            </label>
                            <input
                              id={`rule-originCountry-${idx}`}
                              type="text"
                              maxLength={2}
                              value={rule.originCountry}
                              onChange={(e) => handleUpdateRule(idx, { originCountry: e.target.value.toUpperCase().slice(0, 2) })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-bold uppercase"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-destCountry-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Destination Country (ISO-2)
                            </label>
                            <input
                              id={`rule-destCountry-${idx}`}
                              type="text"
                              maxLength={2}
                              value={rule.destinationCountry}
                              onChange={(e) => handleUpdateRule(idx, { destinationCountry: e.target.value.toUpperCase().slice(0, 2) })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-bold uppercase"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-currency-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Currency (ISO-3)
                            </label>
                            <input
                              id={`rule-currency-${idx}`}
                              type="text"
                              maxLength={3}
                              value={rule.currency}
                              onChange={(e) => {
                                const newCurr = e.target.value.toUpperCase().slice(0, 3);
                                const newExp = getCurrencyExponent(newCurr);
                                handleUpdateRule(idx, {
                                  currency: newCurr,
                                  baseRateExact: {
                                    ...rule.baseRateExact,
                                    currency: newCurr,
                                    exponent: newExp,
                                  },
                                });
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-bold uppercase font-mono"
                            />
                          </div>
                        </div>

                        {/* Exact Money Base Rate & Free Threshold */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
                          <div>
                            <label htmlFor={`rule-baseRate-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Base Rate Minor Units ({rule.currency})
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                id={`rule-baseRate-${idx}`}
                                type="text"
                                value={String(rule.baseRateExact?.amountMinor || '0')}
                                onChange={(e) => {
                                  const cleaned = e.target.value.replace(/[^\d]/g, '') || '0';
                                  handleUpdateRule(idx, {
                                    baseRateExact: {
                                      amountMinor: cleaned,
                                      currency: rule.currency || defaultCurrency || '',
                                      exponent: rule.baseRateExact?.exponent ?? (rule.currency ? getCurrencyExponent(rule.currency) : 2),
                                    },
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono font-bold"
                              />
                              <span className="text-[11px] text-slate-500 font-semibold shrink-0">
                                exp: {rule.baseRateExact?.exponent ?? 2}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] font-bold text-emerald-700">
                              Formatted: {formatExactMoney(rule.baseRateExact)}
                            </p>
                          </div>

                          <div>
                            <label htmlFor={`rule-freeThreshold-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Free Shipping Threshold Minor (Optional)
                            </label>
                            <input
                              id={`rule-freeThreshold-${idx}`}
                              type="text"
                              value={String(rule.freeShippingThresholdExact?.amountMinor || '')}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d]/g, '');
                                handleUpdateRule(idx, {
                                  freeShippingThresholdExact: val
                                    ? {
                                        amountMinor: val,
                                        currency: rule.currency || defaultCurrency || '',
                                        exponent: rule.baseRateExact?.exponent ?? (rule.currency ? getCurrencyExponent(rule.currency) : 2),
                                      }
                                    : null,
                                });
                              }}
                              placeholder="Leave blank if none"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                            {rule.freeShippingThresholdExact && (
                              <p className="mt-1 text-[11px] font-bold text-emerald-700">
                                Free above: {formatExactMoney(rule.freeShippingThresholdExact)}
                              </p>
                            )}
                          </div>

                          <div>
                            <label htmlFor={`rule-priority-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Evaluation Priority (Higher = Precedence)
                            </label>
                            <input
                              id={`rule-priority-${idx}`}
                              type="number"
                              min={0}
                              max={10000}
                              value={rule.priority ?? 100}
                              onChange={(e) => handleUpdateRule(idx, { priority: parseInt(e.target.value, 10) || 0 })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>
                        </div>

                        {/* Destination Subdivisions & Postal Ranges */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor={`rule-subdivisions-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Destination Subdivisions (Comma-separated Province/State codes)
                            </label>
                            <input
                              id={`rule-subdivisions-${idx}`}
                              type="text"
                              value={(rule.destinationSubdivisions || []).join(', ')}
                              onChange={(e) => {
                                const list = e.target.value
                                  .split(',')
                                  .map((s) => s.trim().toUpperCase())
                                  .filter(Boolean);
                                handleUpdateRule(idx, { destinationSubdivisions: list });
                              }}
                              placeholder="e.g. DXB, SHJ, AUH or CA, NY (Empty = All)"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Supported Incoterms</label>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {COMMON_INCOTERMS.map((term) => {
                                const isChecked = (rule.supportedIncoterms || []).includes(term);
                                return (
                                  <label key={term} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleIncoterm(idx, term)}
                                      className="rounded text-[#ff8a00] focus:ring-[#ff8a00]"
                                    />
                                    {term}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: Timing & Delivery Promise */}
                    {activeSubTab === 'timing' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label htmlFor={`rule-min-days-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Transit Min Days
                            </label>
                            <input
                              id={`rule-min-days-${idx}`}
                              type="number"
                              min={0}
                              max={120}
                              value={rule.deliveryMinDays}
                              onChange={(e) => handleUpdateRule(idx, { deliveryMinDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-max-days-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Transit Max Days
                            </label>
                            <input
                              id={`rule-max-days-${idx}`}
                              type="number"
                              min={0}
                              max={120}
                              value={rule.deliveryMaxDays}
                              onChange={(e) => handleUpdateRule(idx, { deliveryMaxDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-proc-min-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Processing Min Days
                            </label>
                            <input
                              id={`rule-proc-min-${idx}`}
                              type="number"
                              min={0}
                              max={120}
                              value={rule.processingMinBusinessDays ?? 1}
                              onChange={(e) =>
                                handleUpdateRule(idx, { processingMinBusinessDays: Math.max(0, parseInt(e.target.value, 10) || 0) })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-proc-max-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Processing Max Days
                            </label>
                            <input
                              id={`rule-proc-max-${idx}`}
                              type="number"
                              min={0}
                              max={120}
                              value={rule.processingMaxBusinessDays ?? 2}
                              onChange={(e) =>
                                handleUpdateRule(idx, { processingMaxBusinessDays: Math.max(0, parseInt(e.target.value, 10) || 0) })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>
                        </div>

                        {/* Cutoff and Working Days */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-white rounded-lg border border-slate-200">
                          <div>
                            <label htmlFor={`rule-cutoff-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Processing Cutoff Local (Strict HH:mm 24-hr format)
                            </label>
                            <input
                              id={`rule-cutoff-${idx}`}
                              type="text"
                              value={rule.processingCutoffLocal || ''}
                              onChange={(e) => handleUpdateRule(idx, { processingCutoffLocal: e.target.value.trim() })}
                              placeholder="e.g. 14:00 (14:00 cutoff in origin timezone)"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono font-bold"
                            />
                            <p className="mt-1 text-[11px] text-slate-500">
                              Orders placed after cutoff time roll over to the next business day. Cutoff is evaluated against the origin fulfillment location time zone.
                            </p>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Fulfillment Working Days (ISO 1=Mon ... 7=Sun)
                            </label>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {ISO_WEEKDAYS.map(({ day, label }) => {
                                const isSelected = (rule.workingDays || []).includes(day);
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => toggleWorkingDay(idx, day)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                                      isSelected
                                        ? 'bg-[#0b132b] text-white border-[#0b132b]'
                                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-400">
                              Holiday Calendars: <strong className="font-semibold text-slate-600">FOUNDATION_ONLY</strong> (Standard business day calculation without external holiday API dependencies).
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: Weight Bands */}
                    {activeSubTab === 'weights' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-600 font-medium">
                            Configure weight-based tiered rates for heavier packages.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleAddWeightBand(idx)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition flex items-center gap-1"
                          >
                            <Plus size={12} /> Add Weight Tier
                          </button>
                        </div>

                        {(!rule.weightBands || rule.weightBands.length === 0) ? (
                          <div className="p-4 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg text-xs">
                            No weight tiers defined for this rule. Base rate applies unconditionally for all weights.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {rule.weightBands.map((band, bandIdx) => (
                              <div
                                key={bandIdx}
                                className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center p-2.5 bg-white border border-slate-200 rounded-lg text-xs"
                              >
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Weight Range (Grams)</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      value={band.minWeightGrams}
                                      onChange={(e) =>
                                        handleUpdateWeightBand(idx, bandIdx, {
                                          minWeightGrams: Math.max(0, parseInt(e.target.value, 10) || 0),
                                        })
                                      }
                                      className="w-20 px-2 py-1 border rounded text-xs"
                                    />
                                    <span>–</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={band.maxWeightGrams}
                                      onChange={(e) =>
                                        handleUpdateWeightBand(idx, bandIdx, {
                                          maxWeightGrams: Math.max(0, parseInt(e.target.value, 10) || 0),
                                        })
                                      }
                                      className="w-20 px-2 py-1 border rounded text-xs"
                                    />
                                    <span className="text-[11px] text-slate-400">g</span>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Pricing Mode</label>
                                  <select
                                    value={band.pricingMode || 'REPLACE_BASE'}
                                    onChange={(e) =>
                                      handleUpdateWeightBand(idx, bandIdx, {
                                        pricingMode: e.target.value as 'REPLACE_BASE' | 'ADD_TO_BASE',
                                      })
                                    }
                                    className="w-full px-2 py-1 border rounded text-xs font-semibold"
                                  >
                                    <option value="REPLACE_BASE">REPLACE_BASE (Flat Tier Rate)</option>
                                    <option value="ADD_TO_BASE">ADD_TO_BASE (Add on top of Base)</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Rate ({rule.currency}) Minor
                                  </label>
                                  <input
                                    type="text"
                                    value={String(band.rateExact?.amountMinor || '0')}
                                    onChange={(e) =>
                                      handleUpdateWeightBand(idx, bandIdx, {
                                        rateExact: {
                                          amountMinor: e.target.value.replace(/[^\d]/g, '') || '0',
                                          currency: rule.currency || defaultCurrency || '',
                                          exponent: rule.baseRateExact?.exponent ?? (rule.currency ? getCurrencyExponent(rule.currency) : 2),
                                        },
                                      })
                                    }
                                    className="w-full px-2 py-1 border rounded text-xs font-mono font-bold"
                                  />
                                  <p className="text-[10px] text-emerald-700 font-bold mt-0.5">
                                    {formatExactMoney(band.rateExact)}
                                  </p>
                                </div>

                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteWeightBand(idx, bandIdx)}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded transition"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 4: Remote Areas */}
                    {activeSubTab === 'remote' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor={`rule-remote-cities-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Remote Cities (Comma-separated)
                            </label>
                            <input
                              id={`rule-remote-cities-${idx}`}
                              type="text"
                              value={(rule.remoteCities || []).join(', ')}
                              onChange={(e) => {
                                const list = e.target.value
                                  .split(',')
                                  .map((c) => c.trim())
                                  .filter(Boolean);
                                handleUpdateRule(idx, { remoteCities: list });
                              }}
                              placeholder="e.g. Gwadar, Skardu, Al Dhafra"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-remote-prefixes-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Remote Postal Prefixes (Comma-separated)
                            </label>
                            <input
                              id={`rule-remote-prefixes-${idx}`}
                              type="text"
                              value={(rule.remotePostalPrefixes || []).join(', ')}
                              onChange={(e) => {
                                const list = e.target.value
                                  .split(',')
                                  .map((p) => p.trim())
                                  .filter(Boolean);
                                handleUpdateRule(idx, { remotePostalPrefixes: list });
                              }}
                              placeholder="e.g. 98, 99, 000"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
                          <div>
                            <label htmlFor={`rule-remote-rate-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Remote Surcharge Minor ({rule.currency})
                            </label>
                            <input
                              id={`rule-remote-rate-${idx}`}
                              type="text"
                              value={String(rule.remoteRateExact?.amountMinor || '')}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d]/g, '');
                                handleUpdateRule(idx, {
                                  remoteRateExact: val
                                    ? {
                                        amountMinor: val,
                                        currency: rule.currency || defaultCurrency || '',
                                        exponent: rule.baseRateExact?.exponent ?? (rule.currency ? getCurrencyExponent(rule.currency) : 2),
                                      }
                                    : null,
                                });
                              }}
                              placeholder="e.g. 5000"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white font-mono"
                            />
                            {rule.remoteRateExact && (
                              <p className="mt-1 text-[11px] font-bold text-amber-800">
                                Surcharge: {formatExactMoney(rule.remoteRateExact)}
                              </p>
                            )}
                          </div>

                          <div>
                            <label htmlFor={`rule-remote-min-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Remote Min Delivery Days
                            </label>
                            <input
                              id={`rule-remote-min-${idx}`}
                              type="number"
                              min={0}
                              max={120}
                              value={rule.remoteDeliveryMinDays ?? ''}
                              onChange={(e) =>
                                handleUpdateRule(idx, {
                                  remoteDeliveryMinDays: e.target.value ? Math.max(0, parseInt(e.target.value, 10) || 0) : null,
                                })
                              }
                              placeholder="Inherit from standard"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>

                          <div>
                            <label htmlFor={`rule-remote-max-${idx}`} className="block text-[11px] font-bold text-slate-700 mb-1">
                              Remote Max Delivery Days
                            </label>
                            <input
                              id={`rule-remote-max-${idx}`}
                              type="number"
                              min={0}
                              max={120}
                              value={rule.remoteDeliveryMaxDays ?? ''}
                              onChange={(e) =>
                                handleUpdateRule(idx, {
                                  remoteDeliveryMaxDays: e.target.value ? Math.max(0, parseInt(e.target.value, 10) || 0) : null,
                                })
                              }
                              placeholder="Inherit from standard"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
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
