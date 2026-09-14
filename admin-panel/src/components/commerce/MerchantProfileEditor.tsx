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
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <Building2 className="text-[#ff8a00]" size={20} />
        <div>
          <h3 className="text-base font-bold text-slate-900">Merchant Commercial Profile</h3>
          <p className="text-xs text-slate-500">Base merchant entity, origin country, selling mode, and commercial terms.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        {/* Legal Name */}
        <div>
          <label className="block font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Legal Business Name
          </label>
          <input
            type="text"
            disabled={disabled}
            value={profile.legalName || ''}
            onChange={(e) => handleChange('legalName', e.target.value)}
            placeholder="e.g. MevaPur Global Commercial Ltd"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-slate-900 outline-none disabled:bg-slate-50"
          />
        </div>

        {/* Merchant Country */}
        <div>
          <label className="block font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Merchant Origin Country (ISO 3166-1) <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            disabled={disabled}
            maxLength={2}
            value={profile.merchantCountry}
            onChange={(e) => handleChange('merchantCountry', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="e.g. PK, AE, GB, US, DE"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-slate-900 outline-none uppercase font-bold disabled:bg-slate-50"
          />
        </div>

        {/* Selling Mode */}
        <div>
          <label className="block font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Selling Mode <span className="text-rose-600">*</span>
          </label>
          <select
            disabled={disabled}
            value={profile.sellingMode}
            onChange={(e) => handleChange('sellingMode', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-slate-900 outline-none font-semibold cursor-pointer disabled:bg-slate-50"
          >
            <option value="domestic">Domestic Only</option>
            <option value="international">International Only</option>
            <option value="hybrid">Hybrid (Domestic & Worldwide)</option>
          </select>
        </div>

        {/* Base Currency */}
        <div>
          <label className="block font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Base Accounting Currency (ISO 4217) <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            disabled={disabled}
            maxLength={3}
            value={profile.baseCurrency}
            onChange={(e) => handleChange('baseCurrency', e.target.value.toUpperCase().slice(0, 3))}
            placeholder="e.g. PKR, USD, EUR, GBP, AED"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-slate-900 outline-none uppercase font-bold disabled:bg-slate-50"
          />
        </div>

        {/* Default Currency */}
        <div>
          <label className="block font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Default Presentment Currency <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            disabled={disabled}
            maxLength={3}
            value={profile.defaultCurrency}
            onChange={(e) => handleChange('defaultCurrency', e.target.value.toUpperCase().slice(0, 3))}
            placeholder="e.g. PKR, USD, EUR, GBP, AED"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-slate-900 outline-none uppercase font-bold disabled:bg-slate-50"
          />
        </div>

        {/* Default Locale & Timezone */}
        <div>
          <label className="block font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Default Time Zone (IANA)
          </label>
          <input
            type="text"
            disabled={disabled}
            value={profile.defaultTimeZone || 'Asia/Karachi'}
            onChange={(e) => handleChange('defaultTimeZone', e.target.value)}
            placeholder="e.g. Asia/Karachi, Europe/London, America/New_York"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-slate-900 outline-none disabled:bg-slate-50"
          />
        </div>

        {/* Supported Incoterms */}
        <div className="sm:col-span-2 pt-2">
          <label className="block font-bold text-slate-800 uppercase tracking-wider mb-2">
            Supported Incoterms <span className="text-rose-600">*</span>
          </label>
          <div className="flex flex-wrap gap-3">
            {(['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW'] as const).map((term) => {
              const checked = (profile.supportedIncoterms || []).includes(term);
              return (
                <label
                  key={term}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                    checked
                      ? 'border-[#ff8a00] bg-orange-50/50 text-[#0b132b]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => handleIncotermToggle(term)}
                    className="w-4 h-4 text-[#ff8a00] rounded border-slate-300 focus:ring-[#ff8a00]"
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
