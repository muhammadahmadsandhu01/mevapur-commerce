'use client';

import React, { useState } from 'react';
import { Play, Loader2, Clock, Truck, Package, AlertCircle, CheckCircle2 } from 'lucide-react';
import { commerceGovernanceService } from '../../services/commerceGovernanceService';
import type { CommerceConfigurationVersion, QuotePreviewResponse } from '../../types/commerceGovernance';
import { formatExactMoney, getCurrencyExponent } from '../../lib/exactMoney';

interface QuotePreviewSimulatorProps {
  version: CommerceConfigurationVersion;
}

export default function QuotePreviewSimulator({ version }: QuotePreviewSimulatorProps) {
  const defaultCountry = version.merchantProfile?.enabledCountries?.[0] || version.merchantProfile?.merchantCountry || '';
  const defaultCurrency = version.merchantProfile?.defaultCurrency || version.merchantProfile?.baseCurrency || '';

  const [destinationCountry, setDestinationCountry] = useState(defaultCountry);
  const [province, setProvince] = useState('Dubai');
  const [city, setCity] = useState('Dubai');
  const [postalCode, setPostalCode] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [shippingServiceLevel, setShippingServiceLevel] = useState('standard');
  const [syntheticPriceMinor, setSyntheticPriceMinor] = useState('20000');
  const [syntheticQty, setSyntheticQty] = useState('1');
  const [syntheticWeightGrams, setSyntheticWeightGrams] = useState('500');

  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<QuotePreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Available service codes configured in this version
  const configuredServiceCodes = Array.from(
    new Set((version.shippingRules || []).filter((r) => r.enabled).map((r) => r.serviceCode))
  );

  let currentExponent: number | null = null;
  try {
    if (currency) {
      currentExponent = getCurrencyExponent(currency);
    }
  } catch {
    currentExponent = null;
  }

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPreviewResult(null);

    const cleanDest = destinationCountry.trim().toUpperCase();
    if (!cleanDest || cleanDest.length !== 2) {
      setError('Destination country is required and must be a 2-letter ISO code (e.g. AE, US, GB).');
      return;
    }

    const cleanCurrency = currency.trim().toUpperCase();
    if (!cleanCurrency || cleanCurrency.length !== 3) {
      setError('Presentment currency is required and must be a 3-letter ISO code (e.g. AED, USD).');
      return;
    }

    let exponent: number;
    try {
      exponent = getCurrencyExponent(cleanCurrency);
    } catch {
      setError(`Unknown currency code "${cleanCurrency}". Please select a valid ISO-4217 currency.`);
      return;
    }

    const cleanMinor = syntheticPriceMinor.trim();
    if (!/^\d+$/.test(cleanMinor) || cleanMinor === '0') {
      setError('Item price minor units must be a valid positive integer string (e.g. 20000 for 200.00).');
      return;
    }

    const cleanQty = syntheticQty.trim();
    if (!/^[1-9]\d*$/.test(cleanQty)) {
      setError('Item quantity must be a positive integer greater than 0.');
      return;
    }

    const cleanWeight = syntheticWeightGrams.trim();
    if (!/^\d+$/.test(cleanWeight)) {
      setError('Item weight must be a valid non-negative integer in grams.');
      return;
    }

    setLoading(true);

    try {
      // Deterministically compute exact major units without floating point corruption
      const minorBigInt = BigInt(cleanMinor);
      const divisor = 10 ** exponent;
      const exactMajorPrice = Number(minorBigInt) / divisor;

      const payload = {
        configId: String(version.version || version._id),
        destination: {
          countryCode: cleanDest,
          province: province.trim() || undefined,
          city: city.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
        },
        currency: cleanCurrency,
        shippingServiceLevel: shippingServiceLevel.trim() || undefined,
        items: [
          {
            name: 'Simulation Preview Item',
            price: exactMajorPrice,
            quantity: parseInt(cleanQty, 10),
            weightGrams: parseInt(cleanWeight, 10),
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label htmlFor="sim-destCountry" className="block font-bold text-slate-700 mb-1">
              Destination Country (ISO-2)
            </label>
            <input
              id="sim-destCountry"
              type="text"
              maxLength={2}
              value={destinationCountry}
              onChange={(e) => setDestinationCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="e.g. AE, US, GB"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-bold uppercase"
              required
            />
          </div>

          <div>
            <label htmlFor="sim-province" className="block font-bold text-slate-700 mb-1">
              Province / State / Emirate
            </label>
            <input
              id="sim-province"
              type="text"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder="e.g. Dubai, Abu Dhabi, Sindh"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="sim-city" className="block font-bold text-slate-700 mb-1">
              City
            </label>
            <input
              id="sim-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Dubai, London, Karachi"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="sim-postalCode" className="block font-bold text-slate-700 mb-1">
              Postal Code (Optional)
            </label>
            <input
              id="sim-postalCode"
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="e.g. 00000, 75500"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-mono"
            />
          </div>

          <div>
            <label htmlFor="sim-currency" className="block font-bold text-slate-700 mb-1">
              Presentment Currency (ISO-3)
            </label>
            <input
              id="sim-currency"
              type="text"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="e.g. AED, USD, EUR"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-bold uppercase font-mono"
              required
            />
          </div>

          <div>
            <label htmlFor="sim-serviceCode" className="block font-bold text-slate-700 mb-1">
              Service Code (Governed Identifier)
            </label>
            <div className="flex gap-1.5">
              <input
                id="sim-serviceCode"
                type="text"
                value={shippingServiceLevel}
                onChange={(e) => setShippingServiceLevel(e.target.value)}
                placeholder="e.g. standard, express, priority_cargo"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-semibold"
              />
            </div>
            {configuredServiceCodes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {configuredServiceCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setShippingServiceLevel(code)}
                    className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-mono"
                  >
                    {code}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="sim-price-minor" className="block font-bold text-slate-700 mb-1">
              Item Price Minor Units ({currency || '—'})
            </label>
            <input
              id="sim-price-minor"
              type="text"
              value={syntheticPriceMinor}
              onChange={(e) => setSyntheticPriceMinor(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="e.g. 20000"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-mono font-bold"
              required
            />
            {syntheticPriceMinor && currency && currentExponent !== null ? (
              <p className="mt-1 text-[11px] font-bold text-emerald-700">
                Exact: {formatExactMoney({ amountMinor: syntheticPriceMinor, currency, exponent: currentExponent })}
              </p>
            ) : syntheticPriceMinor && currency ? (
              <p className="mt-1 text-[11px] font-bold text-amber-700">
                Unknown currency exponent: Configuration required
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="sim-qty" className="block font-bold text-slate-700 mb-1">
              Item Quantity
            </label>
            <input
              id="sim-qty"
              type="number"
              min={1}
              value={syntheticQty}
              onChange={(e) => setSyntheticQty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-mono"
              required
            />
          </div>

          <div>
            <label htmlFor="sim-weight" className="block font-bold text-slate-700 mb-1">
              Item Weight (Grams)
            </label>
            <input
              id="sim-weight"
              type="number"
              min={0}
              value={syntheticWeightGrams}
              onChange={(e) => setSyntheticWeightGrams(e.target.value)}
              placeholder="e.g. 500"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-mono"
              required
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
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-start gap-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-900">Simulation Unserviceable / Error</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {previewResult && (
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span className="font-extrabold text-slate-900">
                Simulation Result for {previewResult.destinationCountry} ({previewResult.currency})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded">
                Incoterm: {previewResult.incoterm}
              </span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                Status: {previewResult.previewStatus}
              </span>
            </div>
          </div>

          {(() => {
            let resultExp = 2;
            try {
              resultExp = previewResult.totals.grandTotalExact?.exponent ?? (previewResult.currency ? getCurrencyExponent(previewResult.currency) : (currentExponent ?? 2));
            } catch {
              resultExp = 2;
            }
            return (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px] block">Subtotal</span>
                  <span className="text-sm font-black text-slate-900">
                    {previewResult.totals.subtotalExact
                      ? formatExactMoney(previewResult.totals.subtotalExact)
                      : formatExactMoney({ amountMinor: String(Math.round(previewResult.totals.subtotal * (10 ** resultExp))), currency: previewResult.currency, exponent: resultExp })}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px] block">Shipping</span>
                  <span className="text-sm font-black text-slate-900">
                    {previewResult.totals.shippingExact
                      ? formatExactMoney(previewResult.totals.shippingExact)
                      : formatExactMoney({ amountMinor: String(Math.round(previewResult.totals.shipping * (10 ** resultExp))), currency: previewResult.currency, exponent: resultExp })}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px] block">Taxes ({previewResult.totals.taxType})</span>
                  <span className="text-sm font-black text-slate-900">
                    {previewResult.totals.taxExact
                      ? formatExactMoney(previewResult.totals.taxExact)
                      : formatExactMoney({ amountMinor: String(Math.round(previewResult.totals.tax * (10 ** resultExp))), currency: previewResult.currency, exponent: resultExp })}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px] block">Customs Duties</span>
                  <span className="text-sm font-black text-slate-900">
                    {previewResult.totals.dutiesExact
                      ? formatExactMoney(previewResult.totals.dutiesExact)
                      : formatExactMoney({ amountMinor: String(Math.round(previewResult.totals.duties * (10 ** resultExp))), currency: previewResult.currency, exponent: resultExp })}
                  </span>
                </div>

                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <span className="text-[#9a3412] font-bold text-[11px] block">Grand Total</span>
                  <span className="text-base font-black text-[#0b132b]">
                    {previewResult.totals.grandTotalExact
                      ? formatExactMoney(previewResult.totals.grandTotalExact)
                      : formatExactMoney({ amountMinor: String(Math.round(previewResult.totals.grandTotal * (10 ** resultExp))), currency: previewResult.currency, exponent: resultExp })}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Delivery Promise & Applied Rules */}
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <div className="flex items-center gap-2">
                <Truck size={13} className="text-[#ff8a00]" />
                <span>
                  Applied Shipping Rule:{' '}
                  <strong className="font-mono text-slate-900 font-bold">
                    {previewResult.appliedRules.shippingRuleId || 'None'}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Tax Rule:{' '}
                  <strong className="font-mono text-slate-900 font-bold">
                    {previewResult.appliedRules.taxRuleId || 'None'}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-1 font-semibold text-slate-700">
                <Clock size={12} />
                <span>
                  Delivery Window: {previewResult.deliveryEstimate?.minDays}–{previewResult.deliveryEstimate?.maxDays} days
                </span>
              </div>
            </div>

            {previewResult.deliveryPromise && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-700 font-medium">
                <span>{previewResult.deliveryPromise.promiseText || 'Standard Delivery'}</span>
                {previewResult.deliveryPromise.dispatchDate && (
                  <span>Dispatch by: <strong>{previewResult.deliveryPromise.dispatchDate}</strong></span>
                )}
              </div>
            )}
          </div>

          {/* Split Shipment Groups Breakdown */}
          {previewResult.shipmentGroups && previewResult.shipmentGroups.length > 1 && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Package size={13} className="text-[#ff8a00]" /> Split Fulfillment ({previewResult.shipmentGroups.length} Packages)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {previewResult.shipmentGroups.map((grp, idx) => (
                  <div key={grp.groupId || idx} className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>Package {idx + 1} ({grp.originCountry || grp.locationCode || 'Fulfillment Center'})</span>
                      <span>
                        {grp.shippingAmountExact
                          ? formatExactMoney(grp.shippingAmountExact)
                          : formatExactMoney({
                              amountMinor: String(Math.round((grp.shippingAmount || 0) * (10 ** (currentExponent ?? 2)))),
                              currency: previewResult.currency,
                              exponent: currentExponent ?? undefined,
                            })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Service: <span className="font-semibold text-slate-800">{grp.serviceLevel}</span>
                    </p>
                    {grp.items && grp.items.length > 0 && (
                      <p className="text-[11px] text-slate-500">
                        Items: {grp.items.map((i) => `${i.name || i.productId} (×${i.quantity})`).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
