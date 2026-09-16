'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Truck, AlertTriangle, History } from 'lucide-react';

export default function ShippingPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Deprecation & Migration Notice Header */}
      <div className="p-6 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-xs space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
            <AlertTriangle size={24} />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-black text-amber-900">
              Legacy Shipping Zones Authority Retired
            </h1>
            <p className="text-xs text-amber-800 leading-relaxed">
              The legacy mutable Shipping Zones system has been retired. Shipping rules, multi-origin fulfillment routing, tiered weight bands, exact-currency rates, and cutoff timing governance are now exclusively managed through versioned <strong>Commerce Governance</strong>.
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
            <ShieldCheck size={16} className="text-emerald-700" />
            <span>Immutable Governance Active (Phase 6D Control Plane)</span>
          </div>

          <Link
            href="/commerce"
            className="px-4 py-2 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition inline-flex items-center gap-2"
          >
            Open Commerce Governance <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Migration & Architecture Summary Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4 text-xs">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Truck size={18} className="text-[#ff8a00]" />
          Governed Shipping Capabilities
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-slate-600">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <h3 className="font-bold text-slate-900">Versioned & Immutable</h3>
            <p className="text-[11px] leading-normal">
              Rules are authored in draft versions, validated for integrity, and published with atomic version increments. No live checkout state is mutated directly.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <h3 className="font-bold text-slate-900">Exact Multi-Currency & Weight Bands</h3>
            <p className="text-[11px] leading-normal">
              Rates use exact integer minor units and exponents. Weight tiers, remote area surcharges, and free shipping thresholds support all global currencies.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <h3 className="font-bold text-slate-900">Delivery Promises & Working Days</h3>
            <p className="text-[11px] leading-normal">
              Precise cutoff times (HH:mm in origin timezone), custom fulfillment working days (ISO 1–7), and processing transit ranges produce signed promises.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <h3 className="font-bold text-slate-900">Multi-Origin Split Fulfillment</h3>
            <p className="text-[11px] leading-normal">
              Authoritative ATP allocations split orders across multiple fulfillment locations with isolated package rates, promises, and tracking.
            </p>
          </div>
        </div>
      </div>

      {/* Historical Note */}
      <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
        <History size={16} className="shrink-0 text-slate-400" />
        <span>
          Legacy zone database collections remain preserved for read-only audit records and historical migration references. Mutation endpoints have been disabled.
        </span>
      </div>
    </div>
  );
}
