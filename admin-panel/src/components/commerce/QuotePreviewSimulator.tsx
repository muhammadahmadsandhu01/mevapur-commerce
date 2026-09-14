'use client';

import React, { useState } from 'react';
import { Play, Loader2, Clock } from 'lucide-react';
import { commerceGovernanceService } from '../../services/commerceGovernanceService';
import type { CommerceConfigurationVersion, QuotePreviewResponse } from '../../types/commerceGovernance';

interface QuotePreviewSimulatorProps {
  version: CommerceConfigurationVersion;
}

export default function QuotePreviewSimulator({ version }: QuotePreviewSimulatorProps) {
  const [destinationCountry, setDestinationCountry] = useState(
    version.merchantProfile?.enabledCountries?.[0] || 'PK'
  );
  const [city, setCity] = useState('Dubai');
  const [currency, setCurrency] = useState(version.merchantProfile?.defaultCurrency || 'PKR');
  const [shippingServiceLevel, setShippingServiceLevel] = useState<'standard' | 'express'>('standard');
  const [syntheticPrice, setSyntheticPrice] = useState('2000');
  const [syntheticQty, setSyntheticQty] = useState('1');

  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<QuotePreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPreviewResult(null);

    try {
      const payload = {
        configId: String(version.version || version._id),
        merchantScopeId: version.merchantScopeId || 'default',
        destination: {
          countryCode: destinationCountry.toUpperCase().trim(),
          city: city.trim() || undefined,
        },
        currency: currency.toUpperCase().trim(),
        shippingServiceLevel,
        items: [
          {
            name: 'Simulation Preview Item',
            price: Math.max(1, parseFloat(syntheticPrice) || 100),
            quantity: Math.max(1, parseInt(syntheticQty, 10) || 1),
          },
        ],
      };

      const res = await commerceGovernanceService.previewQuote(payload);
      setPreviewResult(res);
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : 'Simulation failed');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Play size={18} className="text-blue-600" />
          <h3 className="text-base font-bold text-slate-900">Read-Only Quote Simulation (Preview)</h3>
          <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-50 text-blue-800 border border-blue-200">
            Zero Mutation Guarantee
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Simulate landed cost quotes against this specific configuration version ({version.status} v{version.version}).
          This playground is purely computational and never creates orders, payments, holds, or audit side-effects.
        </p>
      </div>

      <form onSubmit={handleSimulate} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Destination Country (ISO)</label>
            <input
              type="text"
              maxLength={2}
              value={destinationCountry}
              onChange={(e) => setDestinationCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="e.g. AE, US, GB, PK"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-bold uppercase"
              required
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Destination City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Dubai, London, New York"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Presentment Currency (ISO)</label>
            <input
              type="text"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="e.g. AED, USD, PKR"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-bold uppercase"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Shipping Speed</label>
            <select
              value={shippingServiceLevel}
              onChange={(e) => setShippingServiceLevel(e.target.value as 'standard' | 'express')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-semibold cursor-pointer"
            >
              <option value="standard">standard</option>
              <option value="express">express</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Synthetic Price</label>
            <input
              type="number"
              min={1}
              value={syntheticPrice}
              onChange={(e) => setSyntheticPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              value={syntheticQty}
              onChange={(e) => setSyntheticQty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Run Read-Only Simulation
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
          {error}
        </div>
      )}

      {previewResult && (
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <span className="font-extrabold text-slate-900">
              Simulation Result for {previewResult.destinationCountry} ({previewResult.currency})
            </span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded">
              Incoterm: {previewResult.incoterm}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-slate-500 text-[11px] block">Subtotal</span>
              <span className="text-sm font-black text-slate-900">
                {previewResult.currency} {previewResult.totals.subtotal.toLocaleString()}
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-slate-500 text-[11px] block">Shipping</span>
              <span className="text-sm font-black text-slate-900">
                {previewResult.currency} {previewResult.totals.shipping.toLocaleString()}
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-slate-500 text-[11px] block">
                Taxes ({previewResult.totals.taxType})
              </span>
              <span className="text-sm font-black text-slate-900">
                {previewResult.currency} {previewResult.totals.tax.toLocaleString()}
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-slate-500 text-[11px] block">Customs Duties</span>
              <span className="text-sm font-black text-slate-900">
                {previewResult.currency} {previewResult.totals.duties.toLocaleString()}
              </span>
            </div>

            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="text-[#9a3412] font-bold text-[11px] block">Grand Total</span>
              <span className="text-base font-black text-[#0b132b]">
                {previewResult.currency} {previewResult.totals.grandTotal.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-200">
            <span>
              Applied Rules: Shipping{' '}
              <span className="font-mono font-bold text-slate-800">
                {previewResult.appliedRules.shippingRuleId || 'None'}
              </span>{' '}
              · Tax{' '}
              <span className="font-mono font-bold text-slate-800">
                {previewResult.appliedRules.taxRuleId || 'None'}
              </span>
            </span>
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <Clock size={12} /> Delivery: {previewResult.deliveryEstimate.minDays} – {previewResult.deliveryEstimate.maxDays} days
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
