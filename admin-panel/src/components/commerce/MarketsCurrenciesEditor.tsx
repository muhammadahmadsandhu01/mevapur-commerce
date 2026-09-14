'use client';

import React, { useState } from 'react';
import { Globe, DollarSign } from 'lucide-react';

interface MarketsCurrenciesEditorProps {
  enabledCountries: string[];
  enabledCurrencies: string[];
  onCountriesChange: (countries: string[]) => void;
  onCurrenciesChange: (currencies: string[]) => void;
  disabled?: boolean;
}

const COMMON_COUNTRIES = [
  { code: 'PK', name: 'Pakistan' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'DE', name: 'Germany' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'QA', name: 'Qatar' },
  { code: 'OM', name: 'Oman' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
];

const COMMON_CURRENCIES = ['PKR', 'AED', 'USD', 'GBP', 'EUR', 'SAR', 'KWD', 'CAD', 'AUD', 'CNY', 'JPY'];

export default function MarketsCurrenciesEditor({
  enabledCountries,
  enabledCurrencies,
  onCountriesChange,
  onCurrenciesChange,
  disabled,
}: MarketsCurrenciesEditorProps) {
  const [customCountry, setCustomCountry] = useState('');
  const [customCurrency, setCustomCurrency] = useState('');

  const handleToggleCountry = (code: string) => {
    if (disabled) return;
    const upper = code.trim().toUpperCase();
    if (enabledCountries.includes(upper)) {
      if (enabledCountries.length <= 1) {
        alert('At least one sales destination country must be enabled.');
        return;
      }
      onCountriesChange(enabledCountries.filter((c) => c !== upper));
    } else {
      onCountriesChange([...enabledCountries, upper]);
    }
  };

  const handleAddCustomCountry = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !customCountry.trim()) return;
    const upper = customCountry.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(upper) && !enabledCountries.includes(upper)) {
      onCountriesChange([...enabledCountries, upper]);
      setCustomCountry('');
    }
  };

  const handleToggleCurrency = (code: string) => {
    if (disabled) return;
    const upper = code.trim().toUpperCase();
    if (enabledCurrencies.includes(upper)) {
      if (enabledCurrencies.length <= 1) {
        alert('At least one presentment currency must be enabled.');
        return;
      }
      onCurrenciesChange(enabledCurrencies.filter((c) => c !== upper));
    } else {
      onCurrenciesChange([...enabledCurrencies, upper]);
    }
  };

  const handleAddCustomCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !customCurrency.trim()) return;
    const upper = customCurrency.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(upper) && !enabledCurrencies.includes(upper)) {
      onCurrenciesChange([...enabledCurrencies, upper]);
      setCustomCurrency('');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-8">
      {/* Sales Markets Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <Globe className="text-[#ff8a00]" size={20} />
          <div>
            <h3 className="text-base font-bold text-slate-900">Enabled Sales Markets (Destinations)</h3>
            <p className="text-xs text-slate-500">Only enabled ISO 3166-1 destination countries are eligible for checkout quoting.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {COMMON_COUNTRIES.map((c) => {
            const isEnabled = enabledCountries.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                disabled={disabled}
                onClick={() => handleToggleCountry(c.code)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                  isEnabled
                    ? 'bg-orange-50 border-[#ff8a00] text-[#0b132b]'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <span>{c.name} ({c.code})</span>
                {isEnabled && <span className="text-[#ff8a00] font-black">✓</span>}
              </button>
            );
          })}

          {/* Render any additional non-common custom countries */}
          {enabledCountries
            .filter((c) => !COMMON_COUNTRIES.some((common) => common.code === c))
            .map((c) => (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => handleToggleCountry(c)}
                className="px-3 py-1.5 rounded-xl border bg-orange-50 border-[#ff8a00] text-[#0b132b] text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>{c}</span>
                <span className="text-[#ff8a00] font-black">✓</span>
              </button>
            ))}
        </div>

        {!disabled && (
          <form onSubmit={handleAddCustomCountry} className="flex gap-2 max-w-xs pt-2">
            <input
              type="text"
              maxLength={2}
              value={customCountry}
              onChange={(e) => setCustomCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="Add ISO code (e.g. FR, IT, CA)"
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs uppercase font-bold outline-none"
            />
            <button
              type="submit"
              disabled={!customCountry.trim() || customCountry.length !== 2}
              className="px-3 py-1.5 bg-[#0b132b] text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
      </div>

      {/* Enabled Currencies Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <DollarSign className="text-emerald-600" size={20} />
          <div>
            <h3 className="text-base font-bold text-slate-900">Supported Presentment Currencies</h3>
            <p className="text-xs text-slate-500">Currencies accepted during customer checkout quoting (ISO 4217).</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {COMMON_CURRENCIES.map((curr) => {
            const isEnabled = enabledCurrencies.includes(curr);
            return (
              <button
                key={curr}
                type="button"
                disabled={disabled}
                onClick={() => handleToggleCurrency(curr)}
                className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                  isEnabled
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <span>{curr}</span>
                {isEnabled && <span className="text-emerald-700 font-black">✓</span>}
              </button>
            );
          })}

          {enabledCurrencies
            .filter((c) => !COMMON_CURRENCIES.includes(c))
            .map((c) => (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => handleToggleCurrency(c)}
                className="px-3.5 py-1.5 rounded-xl border bg-emerald-50 border-emerald-500 text-emerald-900 text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>{c}</span>
                <span className="text-emerald-700 font-black">✓</span>
              </button>
            ))}
        </div>

        {!disabled && (
          <form onSubmit={handleAddCustomCurrency} className="flex gap-2 max-w-xs pt-2">
            <input
              type="text"
              maxLength={3}
              value={customCurrency}
              onChange={(e) => setCustomCurrency(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="Add ISO currency (e.g. AUD, CHF)"
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs uppercase font-bold outline-none"
            />
            <button
              type="submit"
              disabled={!customCurrency.trim() || customCurrency.length !== 3}
              className="px-3 py-1.5 bg-[#0b132b] text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
