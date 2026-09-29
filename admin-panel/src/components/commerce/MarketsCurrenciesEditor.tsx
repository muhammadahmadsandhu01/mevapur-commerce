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
    <div
      className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 space-y-8 mt-4"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        marginTop: '16px'
      }}
    >
      {/* Sales Markets Section */}
      <div className="space-y-4">
        <div
          className="flex items-center gap-3 pb-3 border-b border-slate-100"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}
        >
          <div
            className="p-2 rounded-xl bg-orange-50 text-[#ff8a00]"
            style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#fff7ed', color: '#ff8a00', display: 'inline-flex' }}
          >
            <Globe size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Enabled Sales Markets (Destinations)
            </h3>
            <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
              Only enabled ISO 3166-1 destination countries are eligible for checkout quoting.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {COMMON_COUNTRIES.map((c) => {
            const isEnabled = enabledCountries.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                disabled={disabled}
                onClick={() => handleToggleCountry(c.code)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                  isEnabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
                style={{
                  padding: '6px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: isEnabled ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                  backgroundColor: isEnabled ? '#ecfdf5' : '#f1f5f9',
                  color: isEnabled ? '#047857' : '#334155',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{c.name} ({c.code})</span>
                {isEnabled && <span className="text-emerald-600 font-black">✓</span>}
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
                className="px-3 py-1.5 rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                style={{
                  padding: '6px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: '1px solid #a7f3d0',
                  backgroundColor: '#ecfdf5',
                  color: '#047857',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{c}</span>
                <span className="text-emerald-600 font-black">✓</span>
              </button>
            ))}
        </div>

        {!disabled && (
          <form onSubmit={handleAddCustomCountry} className="flex gap-2 max-w-sm pt-2" style={{ display: 'flex', gap: '8px', maxWidth: '360px', paddingTop: '8px' }}>
            <input
              type="text"
              maxLength={2}
              value={customCountry}
              onChange={(e) => setCustomCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="Add ISO code (e.g. FR, IT, CA)"
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs uppercase font-bold text-slate-900 outline-none focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] shadow-xs"
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            />
            <button
              type="submit"
              disabled={!customCountry.trim() || customCountry.length !== 2}
              className="px-4 py-2 bg-[#ff8a00] hover:bg-[#ea580c] text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              style={{
                padding: '8px 16px',
                backgroundColor: '#ff8a00',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '12px',
                border: 'none',
                cursor: !customCountry.trim() || customCountry.length !== 2 ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
            >
              Add
            </button>
          </form>
        )}
      </div>

      {/* Enabled Currencies Section */}
      <div className="space-y-4">
        <div
          className="flex items-center gap-3 pb-3 border-b border-slate-100"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}
        >
          <div
            className="p-2 rounded-xl bg-emerald-50 text-emerald-600"
            style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#ecfdf5', color: '#059669', display: 'inline-flex' }}
          >
            <DollarSign size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Supported Presentment Currencies
            </h3>
            <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
              Currencies accepted during customer checkout quoting (ISO 4217).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {COMMON_CURRENCIES.map((curr) => {
            const isEnabled = enabledCurrencies.includes(curr);
            return (
              <button
                key={curr}
                type="button"
                disabled={disabled}
                onClick={() => handleToggleCurrency(curr)}
                className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                  isEnabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
                style={{
                  padding: '6px 14px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: isEnabled ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                  backgroundColor: isEnabled ? '#ecfdf5' : '#f1f5f9',
                  color: isEnabled ? '#047857' : '#334155',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{curr}</span>
                {isEnabled && <span className="text-emerald-600 font-black">✓</span>}
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
                className="px-3.5 py-1.5 rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                style={{
                  padding: '6px 14px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: '1px solid #a7f3d0',
                  backgroundColor: '#ecfdf5',
                  color: '#047857',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{c}</span>
                <span className="text-emerald-600 font-black">✓</span>
              </button>
            ))}
        </div>

        {!disabled && (
          <form onSubmit={handleAddCustomCurrency} className="flex gap-2 max-w-sm pt-2" style={{ display: 'flex', gap: '8px', maxWidth: '360px', paddingTop: '8px' }}>
            <input
              type="text"
              maxLength={3}
              value={customCurrency}
              onChange={(e) => setCustomCurrency(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="Add ISO currency (e.g. AUD, CHF)"
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs uppercase font-bold text-slate-900 outline-none focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] shadow-xs"
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            />
            <button
              type="submit"
              disabled={!customCurrency.trim() || customCurrency.length !== 3}
              className="px-4 py-2 bg-[#ff8a00] hover:bg-[#ea580c] text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              style={{
                padding: '8px 16px',
                backgroundColor: '#ff8a00',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '12px',
                border: 'none',
                cursor: !customCurrency.trim() || customCurrency.length !== 3 ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
            >
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
