'use client';

import React from 'react';
import { Building2 } from 'lucide-react';
import type { MerchantProfile } from '../../types/commerceGovernance';

interface MerchantProfileEditorProps {
  profile: MerchantProfile;
  onChange: (profile: MerchantProfile) => void;
  disabled?: boolean;
}

export default function MerchantProfileEditor({ profile, onChange, disabled }: MerchantProfileEditorProps) {
  const handleChange = (field: keyof MerchantProfile, value: unknown) => {
    onChange({
      ...profile,
      [field]: value,
    });
  };

  const handleIncotermToggle = (incoterm: 'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW') => {
    const current = profile.supportedIncoterms || [];
    const updated = current.includes(incoterm)
      ? current.filter((i) => i !== incoterm)
      : [...current, incoterm];
    handleChange('supportedIncoterms', updated);
  };

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs mt-4 space-y-6"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        padding: '24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        marginTop: '16px'
      }}
    >
      <div
        className="flex items-center gap-3 pb-4 border-b border-slate-100"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid #f1f5f9'
        }}
      >
        <div
          className="p-2 rounded-xl bg-orange-50 text-[#ff8a00]"
          style={{
            padding: '8px',
            borderRadius: '12px',
            backgroundColor: '#fff7ed',
            color: '#ff8a00',
            display: 'inline-flex'
          }}
        >
          <Building2 size={20} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
            Merchant Commercial Profile
          </h3>
          <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
            Base merchant entity, origin country, selling mode, and commercial terms.
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 text-xs"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginTop: '20px',
          fontSize: '12px'
        }}
      >
        {/* Legal Name */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
            Legal Business Name
          </label>
          <input
            type="text"
            disabled={disabled}
            value={profile.legalName || ''}
            onChange={(e) => handleChange('legalName', e.target.value)}
            placeholder="e.g. Harzaar Global Commercial Ltd"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] outline-none shadow-xs disabled:bg-slate-50"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              color: '#0f172a',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Merchant Country */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
            Merchant Origin Country (ISO 3166-1) <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            disabled={disabled}
            maxLength={2}
            value={profile.merchantCountry}
            onChange={(e) => handleChange('merchantCountry', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="e.g. PK, AE, GB, US, DE"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] outline-none shadow-xs uppercase font-bold disabled:bg-slate-50"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              color: '#0f172a',
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Selling Mode */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
            Selling Mode <span className="text-rose-600">*</span>
          </label>
          <select
            disabled={disabled}
            value={profile.sellingMode}
            onChange={(e) => handleChange('sellingMode', e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] outline-none shadow-xs font-semibold cursor-pointer disabled:bg-slate-50"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              color: '#0f172a',
              fontSize: '12px',
              fontWeight: '600',
              outline: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              boxSizing: 'border-box'
            }}
          >
            <option value="domestic">Domestic Only</option>
            <option value="international">International Only</option>
            <option value="hybrid">Hybrid (Domestic & Worldwide)</option>
          </select>
        </div>

        {/* Base Currency */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
            Base Accounting Currency (ISO 4217) <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            disabled={disabled}
            maxLength={3}
            value={profile.baseCurrency}
            onChange={(e) => handleChange('baseCurrency', e.target.value.toUpperCase().slice(0, 3))}
            placeholder="e.g. PKR, USD, EUR, GBP, AED"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] outline-none shadow-xs uppercase font-bold disabled:bg-slate-50"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              color: '#0f172a',
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Default Currency */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
            Default Presentment Currency <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            disabled={disabled}
            maxLength={3}
            value={profile.defaultCurrency}
            onChange={(e) => handleChange('defaultCurrency', e.target.value.toUpperCase().slice(0, 3))}
            placeholder="e.g. PKR, USD, EUR, GBP, AED"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] outline-none shadow-xs uppercase font-bold disabled:bg-slate-50"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              color: '#0f172a',
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Default Locale & Timezone */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
            Default Time Zone (IANA)
          </label>
          <input
            type="text"
            disabled={disabled}
            value={profile.defaultTimeZone || 'Asia/Karachi'}
            onChange={(e) => handleChange('defaultTimeZone', e.target.value)}
            placeholder="e.g. Asia/Karachi, Europe/London, America/New_York"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] outline-none shadow-xs disabled:bg-slate-50"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              color: '#0f172a',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Supported Incoterms */}
        <div className="md:col-span-2 pt-2" style={{ gridColumn: '1 / -1', paddingTop: '8px' }}>
          <label className="block font-semibold text-slate-700 mb-2" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
            Supported Incoterms <span className="text-rose-600">*</span>
          </label>
          <div className="flex flex-wrap gap-2.5 mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
            {(['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW'] as const).map((term) => {
              const checked = (profile.supportedIncoterms || []).includes(term);
              return (
                <label
                  key={term}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                    checked
                      ? 'border-[#ff8a00] bg-orange-50 text-[#ff8a00]'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 14px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    border: checked ? '1px solid #ff8a00' : '1px solid #e2e8f0',
                    backgroundColor: checked ? '#fff7ed' : '#f8fafc',
                    color: checked ? '#ff8a00' : '#334155',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => handleIncotermToggle(term)}
                    className="w-4 h-4 text-[#ff8a00] rounded border-slate-300 focus:ring-[#ff8a00]"
                    style={{ accentColor: '#ff8a00' }}
                  />
                  <span>{term}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
