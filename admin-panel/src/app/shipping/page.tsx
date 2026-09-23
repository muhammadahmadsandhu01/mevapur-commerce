'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  AlertTriangle,
  Search,
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  UserCheck,
  UserX,
  X,
  RefreshCw
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface CodServiceabilityRule {
  _id: string;
  merchantScopeId: string;
  countryCode: string;
  normalizedCity: string;
  normalizedPostalCode: string;
  zoneKey?: string;
  isServiceable: boolean;
  status: 'active' | 'inactive';
  effectiveFrom: string;
  effectiveTo: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomerCodStatus {
  customerId: string;
  merchantScopeId: string;
  restricted: boolean;
  reasonCode: string | null;
  manualBlockActive: boolean;
  manualBlockReasonCode?: string | null;
  temporaryLockActive: boolean;
  temporaryLockUntil?: string | null;
  temporaryLockReasonCode?: string | null;
  automaticLockSource?: string | null;
  overrideActive: boolean;
  overrideMode: string;
  overrideUntil?: string | null;
}

interface OfferingItem {
  _id: string;
  sku: string;
  marketCountry: string;
  codEligible: boolean;
  lockVersion: number;
  productId?: {
    _id: string;
    name: string;
    sku: string;
    price: number;
  };
}

interface AuditLogItem {
  _id: string;
  eventId: string;
  eventName: string;
  status: string;
  createdAt: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export default function ShippingPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'rules' | 'offerings' | 'audit'>('rules');

  // Offerings state
  const [offerings, setOfferings] = useState<OfferingItem[]>([]);
  const [offeringsLoading, setOfferingsLoading] = useState(false);

  // Audit history state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Rules state
  const [rules, setRules] = useState<CodServiceabilityRule[]>([]);
  const [totalRules, setTotalRules] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchCity, setSearchCity] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  // Add/Edit Rule Modal
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleCity, setRuleCity] = useState('');
  const [rulePostalCode, setRulePostalCode] = useState('');
  const [ruleZoneKey, setRuleZoneKey] = useState('');
  const [ruleIsServiceable, setRuleIsServiceable] = useState(true);
  const [ruleStatus, setRuleStatus] = useState<'active' | 'inactive'>('active');
  const [ruleNotes, setRuleNotes] = useState('');
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleModalError, setRuleModalError] = useState<string | null>(null);

  // Customer COD Lookup Modal
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerLookupId, setCustomerLookupId] = useState('');
  const [customerStatus, setCustomerStatus] = useState<CustomerCodStatus | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerActionError, setCustomerActionError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Override Form
  const [overrideMode, setOverrideMode] = useState<'NONE' | 'UNTIL' | 'INDEFINITE'>('UNTIL');
  const [overrideDays, setOverrideDays] = useState('7');
  const [overrideReason, setOverrideReason] = useState('CUSTOMER_APPEAL_APPROVED');

  const fetchRules = useCallback(async () => {
    try {
      const params: Record<string, string> = { countryCode: 'PK' };
      if (searchCity.trim()) params.city = searchCity.trim();
      if (filterStatus !== 'all') params.status = filterStatus;

      const res = await api.get('/admin/cod/rules', { params });
      if (res.data?.success) {
        setRules(res.data.data.rules || []);
        setTotalRules(res.data.data.total || 0);
        setError(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch COD serviceability rules');
    } finally {
      setLoading(false);
    }
  }, [searchCity, filterStatus]);

  const fetchOfferings = useCallback(async () => {
    setOfferingsLoading(true);
    try {
      const res = await api.get('/admin/cod/offerings');
      if (res.data?.success) {
        setOfferings(res.data.data.offerings || []);
        setError(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch offerings');
    } finally {
      setOfferingsLoading(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await api.get('/admin/cod/audit-history');
      if (res.data?.success) {
        setAuditLogs(res.data.data.logs || []);
        setError(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch governance audit history');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const handleToggleOfferingCod = async (offering: OfferingItem) => {
    if (!isAdmin) return;
    try {
      const res = await api.put(`/admin/cod/offerings/${offering._id}/eligibility`, {
        codEligible: !offering.codEligible
      });
      if (res.data?.success) {
        setOfferings((prev) =>
          prev.map((o) => (o._id === offering._id ? { ...o, codEligible: !o.codEligible } : o))
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update offering COD eligibility');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRules();
    }, 50);
    return () => clearTimeout(timer);
  }, [fetchRules]);

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleCity.trim()) {
      setRuleModalError('City is required');
      return;
    }
    setRuleSaving(true);
    setRuleModalError(null);
    try {
      await api.post('/admin/cod/rules', {
        countryCode: 'PK',
        city: ruleCity.trim(),
        postalCode: rulePostalCode.trim(),
        zoneKey: ruleZoneKey.trim(),
        isServiceable: ruleIsServiceable,
        status: ruleStatus,
        notes: ruleNotes.trim()
      });
      setIsRuleModalOpen(false);
      setRuleCity('');
      setRulePostalCode('');
      setRuleZoneKey('');
      setRuleNotes('');
      void fetchRules();
    } catch (err: unknown) {
      setRuleModalError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setRuleSaving(false);
    }
  };

  const handleLookupCustomer = async () => {
    if (!customerLookupId.trim()) return;
    setCustomerLoading(true);
    setCustomerActionError(null);
    setActionSuccessMessage(null);
    try {
      const res = await api.get(`/admin/cod/customers/${customerLookupId.trim()}/status`);
      if (res.data?.success) {
        setCustomerStatus(res.data.data);
      }
    } catch (err: unknown) {
      setCustomerActionError(err instanceof Error ? err.message : 'Failed to retrieve customer status');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleBlockCustomer = async () => {
    if (!customerLookupId.trim() || !isAdmin) return;
    setCustomerLoading(true);
    setCustomerActionError(null);
    try {
      await api.post(`/admin/cod/customers/${customerLookupId.trim()}/block`, {
        reasonCode: 'COD_CUSTOMER_BLOCKED',
        notes: 'Administrative manual block'
      });
      setActionSuccessMessage('Customer COD manually blocked');
      void handleLookupCustomer();
    } catch (err: unknown) {
      setCustomerActionError(err instanceof Error ? err.message : 'Failed to block customer COD');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleUnblockCustomer = async () => {
    if (!customerLookupId.trim() || !isAdmin) return;
    setCustomerLoading(true);
    setCustomerActionError(null);
    try {
      await api.post(`/admin/cod/customers/${customerLookupId.trim()}/unblock`, {
        reasonCode: 'ADMIN_UNBLOCK'
      });
      setActionSuccessMessage('Customer COD unblocked');
      void handleLookupCustomer();
    } catch (err: unknown) {
      setCustomerActionError(err instanceof Error ? err.message : 'Failed to unblock customer COD');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleApplyOverride = async () => {
    if (!customerLookupId.trim() || !isAdmin) return;
    setCustomerLoading(true);
    setCustomerActionError(null);
    try {
      let overrideUntil: string | null = null;
      if (overrideMode === 'UNTIL') {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(overrideDays, 10));
        overrideUntil = d.toISOString();
      }
      await api.post(`/admin/cod/customers/${customerLookupId.trim()}/override`, {
        overrideMode,
        overrideUntil,
        overrideReasonCode: overrideReason
      });
      setActionSuccessMessage(`Customer COD override applied (${overrideMode})`);
      void handleLookupCustomer();
    } catch (err: unknown) {
      setCustomerActionError(err instanceof Error ? err.message : 'Failed to apply override');
    } finally {
      setCustomerLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Truck size={26} className="text-[#ff8a00]" />
            Pakistan COD Serviceability & Shipping Governance
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Governs domestic Pakistan Cash on Delivery serviceability by postal zone and evaluates customer risk restrictions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCustomerModalOpen(true)}
            className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2"
          >
            <UserCheck size={15} className="text-[#0b132b]" />
            Customer COD Risk Status
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setRuleCity('');
                setRulePostalCode('');
                setRuleZoneKey('');
                setRuleNotes('');
                setIsRuleModalOpen(true);
              }}
              className="px-4 py-2.5 bg-[#ff8a00] hover:bg-[#e07a00] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2"
            >
              <Plus size={16} />
              Add Serviceability Rule
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${activeTab === 'rules' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Serviceability Rules
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('offerings');
            void fetchOfferings();
          }}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${activeTab === 'offerings' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Product Offering COD Eligibility
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('audit');
            void fetchAuditLogs();
          }}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${activeTab === 'audit' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Governance Audit History
        </button>
      </div>

      {/* Rules Governance Section */}
      {activeTab === 'rules' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by city (e.g. Islamabad)"
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#ff8a00] focus:border-transparent outline-none"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 focus:ring-2 focus:ring-[#ff8a00] outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Total Rules: <strong>{totalRules}</strong></span>
            <button
              onClick={() => void fetchRules()}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 size={24} className="animate-spin text-[#ff8a00]" />
            <span className="text-xs">Loading serviceability rules...</span>
          </div>
        ) : rules.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No COD serviceability rules found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="pb-3 pr-4">City</th>
                  <th className="pb-3 pr-4">Postal Code</th>
                  <th className="pb-3 pr-4">Zone Key</th>
                  <th className="pb-3 pr-4">Serviceability</th>
                  <th className="pb-3 pr-4">Rule Status</th>
                  <th className="pb-3 pr-4">Notes</th>
                  <th className="pb-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => (
                  <tr key={rule._id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 pr-4 font-bold text-slate-900">{rule.normalizedCity}</td>
                    <td className="py-3 pr-4 font-mono text-slate-600">
                      {rule.normalizedPostalCode ? (
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                          {rule.normalizedPostalCode}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">City-wide (All)</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{rule.zoneKey || '—'}</td>
                    <td className="py-3 pr-4">
                      {rule.isServiceable ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <CheckCircle size={12} className="text-emerald-600" /> Serviceable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full">
                          <XCircle size={12} className="text-rose-600" /> Blocked
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        rule.status === 'active' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {rule.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500 max-w-xs truncate">{rule.notes || '—'}</td>
                    <td className="py-3 text-slate-400 text-[11px]">
                      {new Date(rule.updatedAt || rule.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Product Market Offerings COD Eligibility Section */}
      {activeTab === 'offerings' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Product Market Offering COD Governance</h3>
            <p className="text-xs text-slate-500">Enable or disable Cash on Delivery eligibility per product market offering.</p>
          </div>
          <button
            onClick={() => void fetchOfferings()}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            title="Refresh Offerings"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {offeringsLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 size={24} className="animate-spin text-[#ff8a00]" />
            <span className="text-xs">Loading offerings...</span>
          </div>
        ) : offerings.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No product market offerings found for Pakistan market.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="pb-3 pr-4">Product Name</th>
                  <th className="pb-3 pr-4">SKU</th>
                  <th className="pb-3 pr-4">Market</th>
                  <th className="pb-3 pr-4">COD Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offerings.map((offering) => (
                  <tr key={offering._id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 pr-4 font-bold text-slate-900">
                      {offering.productId?.name || 'Product Offering'}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-600">{offering.sku}</td>
                    <td className="py-3 pr-4 font-bold text-slate-500">{offering.marketCountry}</td>
                    <td className="py-3 pr-4">
                      {offering.codEligible ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <CheckCircle size={12} className="text-emerald-600" /> COD Eligible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full">
                          <XCircle size={12} className="text-rose-600" /> COD Ineligible
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => void handleToggleOfferingCod(offering)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            offering.codEligible
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {offering.codEligible ? 'Disable COD' : 'Enable COD'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Read-only (Support)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Governance Audit History Section */}
      {activeTab === 'audit' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">COD Governance Audit Trail</h3>
            <p className="text-xs text-slate-500">Immutable ledger of administrative policy actions and delivery outcomes.</p>
          </div>
          <button
            onClick={() => void fetchAuditLogs()}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            title="Refresh Audit Trail"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {auditLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 size={24} className="animate-spin text-[#ff8a00]" />
            <span className="text-xs">Loading audit trail...</span>
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No audit records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="pb-3 pr-4">Event</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">IP Address</th>
                  <th className="pb-3 pr-4">Date / Time</th>
                  <th className="pb-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 pr-4 font-mono font-bold text-slate-900">{log.eventName}</td>
                    <td className="py-3 pr-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-bold">
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-500">{log.ipAddress || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 text-slate-600 font-mono text-[11px] max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Commerce Governance Notice & Migration Link */}
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl shadow-xs space-y-4 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-800 rounded-xl shrink-0 mt-0.5">
              <ShieldCheck size={20} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Legacy Shipping Zones Authority Retired
                </h2>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                  Immutable Governance Active
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                The legacy mutable Shipping Zones system has been retired in favor of versioned Commerce Governance. Cross-border shipping rates, weight band matrices, destination country de-minimis calculations, and fulfillment cutoff times are managed through versioned <strong>Global Commerce Governance</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <Link
            href="/commerce"
            className="px-4 py-2 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition inline-flex items-center gap-2"
          >
            Open Commerce Governance <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Add / Edit Serviceability Rule Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Add Pakistan COD Rule</h3>
              <button
                onClick={() => setIsRuleModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            {ruleModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {ruleModalError}
              </div>
            )}

            <form onSubmit={handleSaveRule} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">City *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Islamabad, Karachi, Lahore"
                  value={ruleCity}
                  onChange={(e) => setRuleCity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Postal Code (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave blank for entire city (e.g. 44000)"
                  value={rulePostalCode}
                  onChange={(e) => setRulePostalCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Specific postal codes take precedence over city-wide rules.</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Zone Identifier (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. ISB-NORTH, KHI-SOUTH"
                  value={ruleZoneKey}
                  onChange={(e) => setRuleZoneKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Serviceability</label>
                  <select
                    value={ruleIsServiceable ? 'true' : 'false'}
                    onChange={(e) => setRuleIsServiceable(e.target.value === 'true')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#ff8a00]"
                  >
                    <option value="true">Serviceable (Allow COD)</option>
                    <option value="false">Unserviceable (Block COD)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rule Status</label>
                  <select
                    value={ruleStatus}
                    onChange={(e) => setRuleStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#ff8a00]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Operational notes or reason for coverage"
                  value={ruleNotes}
                  onChange={(e) => setRuleNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ruleSaving}
                  className="px-4 py-2 bg-[#ff8a00] hover:bg-[#e07a00] text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {ruleSaving && <Loader2 size={14} className="animate-spin" />}
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer COD Risk Status Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck size={18} className="text-[#ff8a00]" />
                Customer COD Risk Status & Governance
              </h3>
              <button
                onClick={() => {
                  setIsCustomerModalOpen(false);
                  setCustomerStatus(null);
                  setCustomerLookupId('');
                  setCustomerActionError(null);
                  setActionSuccessMessage(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            {customerActionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {customerActionError}
              </div>
            )}

            {actionSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold">
                {actionSuccessMessage}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Customer User ID (ObjectId)"
                value={customerLookupId}
                onChange={(e) => setCustomerLookupId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
              />
              <button
                type="button"
                onClick={handleLookupCustomer}
                disabled={customerLoading || !customerLookupId.trim()}
                className="px-4 py-2 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {customerLoading && <Loader2 size={13} className="animate-spin" />}
                Lookup
              </button>
            </div>

            {customerStatus && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Effective COD Status:</span>
                  {customerStatus.restricted ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                      <XCircle size={12} /> Restricted ({customerStatus.reasonCode || 'COD_BLOCKED'})
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <CheckCircle size={12} /> Eligible
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-2 border-t border-slate-200">
                  <div>
                    <span className="text-slate-400">Manual Block:</span>{' '}
                    <strong>{customerStatus.manualBlockActive ? 'Active' : 'No'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Temporary Lock:</span>{' '}
                    <strong>
                      {customerStatus.temporaryLockActive ? `Until ${new Date(customerStatus.temporaryLockUntil || '').toLocaleDateString()}` : 'None'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Administrative Override:</span>{' '}
                    <strong>{customerStatus.overrideActive ? `${customerStatus.overrideMode}` : 'None'}</strong>
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs">Administrative Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      {customerStatus.manualBlockActive ? (
                        <button
                          type="button"
                          onClick={handleUnblockCustomer}
                          disabled={customerLoading}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                        >
                          <UserCheck size={13} /> Unblock Customer COD
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleBlockCustomer}
                          disabled={customerLoading}
                          className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                        >
                          <UserX size={13} /> Manually Block COD
                        </button>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <span className="text-[11px] font-bold text-slate-700">Set Administrative Override:</span>
                      <div className="flex gap-2">
                        <select
                          value={overrideMode}
                          onChange={(e) => setOverrideMode(e.target.value as 'NONE' | 'UNTIL' | 'INDEFINITE')}
                          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                        >
                          <option value="UNTIL">Temporary (Days)</option>
                          <option value="INDEFINITE">Indefinite Override</option>
                          <option value="NONE">Clear Override (NONE)</option>
                        </select>

                        {overrideMode === 'UNTIL' && (
                          <input
                            type="number"
                            min="1"
                            max="90"
                            value={overrideDays}
                            onChange={(e) => setOverrideDays(e.target.value)}
                            className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center"
                          />
                        )}

                        <select
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                        >
                          <option value="CUSTOMER_APPEAL_APPROVED">Appeal Approved</option>
                          <option value="VIP_EXCEPTION">VIP Exception</option>
                          <option value="COURIER_ERROR_CORRECTION">Courier Error Correction</option>
                        </select>

                        <button
                          type="button"
                          onClick={handleApplyOverride}
                          disabled={customerLoading}
                          className="px-3 py-1.5 bg-[#0b132b] hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition"
                        >
                          Apply Override
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
