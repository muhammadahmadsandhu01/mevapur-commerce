'use client';

import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Globe,
  DollarSign,
  Truck,
  FileCheck,
  Layers,
} from 'lucide-react';
import type { ReadinessStatus } from '../../types/commerceGovernance';

interface ReadinessOverviewProps {
  readiness: ReadinessStatus | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function ReadinessOverview({ readiness, loading, onRefresh }: ReadinessOverviewProps) {
  if (loading && !readiness) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium">
        Loading governance readiness report...
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-600">
        Readiness metrics unavailable for current scope.
      </div>
    );
  }

  // Determine readiness classification
  let readinessState: 'CONFIGURATION_CAPABLE' | 'TEST_CONFIGURED' | 'DORMANT' | 'UNVERIFIED' = 'UNVERIFIED';
  let badgeColor = 'bg-amber-100 text-amber-900 border-amber-300';

  if (readiness.hasActiveConfiguration && readiness.unverifiedTaxRulesCount === 0 && readiness.shippingRulesCount > 0) {
    readinessState = 'CONFIGURATION_CAPABLE';
    badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-300';
  } else if (readiness.hasActiveConfiguration && readiness.shippingRulesCount > 0) {
    readinessState = 'TEST_CONFIGURED';
    badgeColor = 'bg-blue-100 text-blue-900 border-blue-300';
  } else if (readiness.recentVersions && readiness.recentVersions.length > 0) {
    readinessState = 'DORMANT';
    badgeColor = 'bg-slate-100 text-slate-800 border-slate-300';
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#ff8a00] shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">Commerce Readiness Overview</h2>
              <span className={`px-2.5 py-0.5 text-xs font-black rounded-full border ${badgeColor}`}>
                {readinessState}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Scope: <span className="font-bold text-slate-800">{readiness.merchantScopeId}</span> · Active Version: <span className="font-bold text-slate-800">{readiness.activeVersion ? `v${readiness.activeVersion}` : 'None'}</span> · Selling Mode: <span className="font-bold uppercase text-slate-800">{readiness.activeSellingMode || 'UNCONFIGURED'}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition self-start md:self-auto"
        >
          Refresh Status
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <Layers size={14} className="text-[#ff8a00]" /> Active Version
          </div>
          <div className="text-xl font-black text-slate-900">
            {readiness.activeVersion ? `v${readiness.activeVersion}` : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {readiness.hasActiveConfiguration ? 'Live in production' : 'No active version'}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <Globe size={14} className="text-blue-500" /> Sales Markets
          </div>
          <div className="text-xl font-black text-slate-900">
            {readiness.enabledCountriesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">ISO 3166-1 destinations</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <DollarSign size={14} className="text-emerald-500" /> Currencies
          </div>
          <div className="text-xl font-black text-slate-900">
            {readiness.enabledCurrenciesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">ISO 4217 presentment</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <Truck size={14} className="text-amber-500" /> Shipping Rules
          </div>
          <div className="text-xl font-black text-slate-900">
            {readiness.shippingRulesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Active rate zones</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <FileCheck size={14} className="text-purple-500" /> Tax Rules
          </div>
          <div className="text-xl font-black text-slate-900">
            {readiness.taxRulesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Exact rational rules</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
            <AlertTriangle size={14} className="text-rose-500" /> Unverified
          </div>
          <div className="text-xl font-black text-rose-600">
            {readiness.unverifiedTaxRulesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Estimated tax rates</div>
        </div>
      </div>
    </div>
  );
}
