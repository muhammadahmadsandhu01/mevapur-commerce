'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
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

const formatDate = (val?: string | Date | null) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (val?: string | Date | null) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

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
            className="bg-[#0b132b] text-white hover:bg-[#1c2a4f] px-4 py-2 rounded-xl text-xs font-semibold shadow-xs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#0b132b',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'all 0.2s'
            }}
          >
            <UserCheck size={15} />
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
              className="bg-[#ff8a00] text-white hover:bg-[#ea580c] px-4 py-2 rounded-xl text-xs font-semibold shadow-xs"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#ff8a00',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s'
              }}
            >
              <Plus size={16} />
              + Add Serviceability Rule
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div
        className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit my-4"
        style={{
          display: 'flex',
          gap: '8px',
          padding: '4px',
          backgroundColor: '#f1f5f9',
          borderRadius: '12px',
          width: 'fit-content',
          margin: '16px 0'
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
            activeTab === 'rules'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 font-medium'
          }`}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'rules' ? '600' : '500',
            backgroundColor: activeTab === 'rules' ? '#ffffff' : 'transparent',
            color: activeTab === 'rules' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'rules' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Serviceability Rules
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('offerings');
            void fetchOfferings();
          }}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
            activeTab === 'offerings'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 font-medium'
          }`}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'offerings' ? '600' : '500',
            backgroundColor: activeTab === 'offerings' ? '#ffffff' : 'transparent',
            color: activeTab === 'offerings' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'offerings' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Product Offering COD Eligibility
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('audit');
            void fetchAuditLogs();
          }}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
            activeTab === 'audit'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 font-medium'
          }`}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'audit' ? '600' : '500',
            backgroundColor: activeTab === 'audit' ? '#ffffff' : 'transparent',
            color: activeTab === 'audit' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'audit' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Governance Audit History
        </button>
      </div>

      {/* Rules Governance Section */}
      {activeTab === 'rules' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4" style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
          <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="relative flex-1 sm:w-64" style={{ position: 'relative', width: '260px' }}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Filter by city (e.g. Islamabad)"
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs focus:ring-1 focus:ring-[#ff8a00] focus:border-[#ff8a00] outline-none shadow-xs"
                style={{
                  width: '100%',
                  paddingLeft: '36px',
                  paddingRight: '14px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  fontSize: '12px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none shadow-xs"
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
            <span>Total Rules: <strong>{totalRules}</strong></span>
            <button
              onClick={() => void fetchRules()}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
              title="Refresh"
              style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2" style={{ padding: '12px', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2" style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '8px' }}>
            <Loader2 size={24} className="animate-spin text-[#ff8a00]" />
            <span className="text-xs">Loading serviceability rules...</span>
          </div>
        ) : rules.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs" style={{ padding: '48px 0', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
            No COD serviceability rules found matching your filters.
          </div>
        ) : (
          <div
            className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white shadow-xs mt-4"
            style={{
              borderRadius: '16px',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              marginTop: '16px'
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead
                  className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                >
                  <tr>
                    <th className="py-3 px-4" style={{ padding: '12px 16px' }}>City</th>
                    <th className="py-3 px-4" style={{ padding: '12px 16px' }}>Postal Code</th>
                    <th className="py-3 px-4" style={{ padding: '12px 16px' }}>Zone Key</th>
                    <th className="py-3 px-4" style={{ padding: '12px 16px' }}>Serviceability</th>
                    <th className="py-3 px-4" style={{ padding: '12px 16px' }}>Rule Status</th>
                    <th className="py-3 px-4" style={{ padding: '12px 16px' }}>Notes</th>
                    <th className="py-3 px-4" style={{ padding: '12px 16px' }}>Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {rules.map((rule) => (
                    <tr key={rule._id} className="hover:bg-slate-50/60 transition" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="py-3.5 px-4 text-xs text-slate-700 font-bold" style={{ padding: '14px 16px', fontWeight: '700', color: '#0f172a' }}>{rule.normalizedCity}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-700 font-mono" style={{ padding: '14px 16px', fontFamily: 'monospace' }}>
                        {rule.normalizedPostalCode ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700" style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', color: '#334155' }}>
                            {rule.normalizedPostalCode}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic" style={{ color: '#94a3b8', fontStyle: 'italic' }}>City-wide (All)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700" style={{ padding: '14px 16px', color: '#475569' }}>{rule.zoneKey || '—'}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-700" style={{ padding: '14px 16px' }}>
                        {rule.isServiceable ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 12px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor: '#ecfdf5',
                              color: '#047857',
                              border: '1px solid #a7f3d0'
                            }}
                          >
                            <CheckCircle size={12} className="text-emerald-600" /> Serviceable
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 12px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor: '#fef2f2',
                              color: '#b91c1c',
                              border: '1px solid #fecaca'
                            }}
                          >
                            <XCircle size={12} className="text-red-600" /> Blocked
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700" style={{ padding: '14px 16px' }}>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          rule.status === 'active' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          backgroundColor: rule.status === 'active' ? '#eff6ff' : '#f1f5f9',
                          color: rule.status === 'active' ? '#1d4ed8' : '#475569',
                          border: `1px solid ${rule.status === 'active' ? '#bfdbfe' : '#e2e8f0'}`
                        }}>
                          {rule.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700 max-w-xs truncate" style={{ padding: '14px 16px', color: '#64748b' }}>{rule.notes || '—'}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-700 text-[11px]" style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '11px' }}>
                        {formatDate(rule.updatedAt || rule.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Product Market Offerings COD Eligibility Section */}
      {activeTab === 'offerings' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4" style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h3 className="font-bold text-slate-900 text-sm" style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Product Market Offering COD Governance</h3>
            <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b' }}>Enable or disable Cash on Delivery eligibility per product market offering.</p>
          </div>
          <button
            onClick={() => void fetchOfferings()}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
            title="Refresh Offerings"
            style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#f1f5f9', border: 'none', color: '#334155', cursor: 'pointer' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {offeringsLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2" style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '8px' }}>
            <Loader2 size={24} className="animate-spin text-[#ff8a00]" />
            <span className="text-xs">Loading offerings...</span>
          </div>
        ) : offerings.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs" style={{ padding: '48px 0', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
            No product market offerings found for Pakistan market.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden mt-4" style={{ borderRadius: '16px', border: '1px solid rgba(226, 232, 240, 0.8)', backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: '16px' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <tr>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Product Name</th>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>SKU</th>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Market</th>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>COD Status</th>
                    <th className="py-3.5 px-4 text-right" style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {offerings.map((offering) => (
                    <tr key={offering._id} className="hover:bg-slate-50/50 transition" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="py-3.5 px-4 font-bold text-slate-900" style={{ padding: '14px 16px', fontWeight: '700', color: '#0f172a' }}>
                        {offering.productId?.name || 'Product Offering'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600" style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#475569' }}>{offering.sku}</td>
                      <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700" style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', color: '#334155' }}>
                          {offering.marketCountry || 'PK'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                        {offering.codEligible ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                            <CheckCircle size={12} className="text-emerald-600" /> COD Eligible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                            <XCircle size={12} className="text-red-600" /> COD Ineligible
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right" style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => void handleToggleOfferingCod(offering)}
                            className={`px-3 py-1.5 rounded-lg border font-semibold text-xs transition cursor-pointer ${
                              offering.codEligible
                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: offering.codEligible ? '1px solid #fecaca' : '1px solid #a7f3d0',
                              backgroundColor: offering.codEligible ? '#fef2f2' : '#ecfdf5',
                              color: offering.codEligible ? '#b91c1c' : '#047857',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            {offering.codEligible ? 'Disable COD' : 'Enable COD'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic" style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Read-only (Support)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Governance Audit History Section */}
      {activeTab === 'audit' && (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4" style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h3 className="font-bold text-slate-900 text-sm" style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>COD Governance Audit Trail</h3>
            <p className="text-xs text-slate-500" style={{ fontSize: '12px', color: '#64748b' }}>Immutable ledger of administrative policy actions and delivery outcomes.</p>
          </div>
          <button
            onClick={() => void fetchAuditLogs()}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
            title="Refresh Audit Trail"
            style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#f1f5f9', border: 'none', color: '#334155', cursor: 'pointer' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {auditLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2" style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '8px' }}>
            <Loader2 size={24} className="animate-spin text-[#ff8a00]" />
            <span className="text-xs">Loading audit trail...</span>
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs" style={{ padding: '48px 0', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
            No audit records found.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white shadow-xs mt-4" style={{ borderRadius: '16px', border: '1px solid rgba(226, 232, 240, 0.8)', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginTop: '16px' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <tr>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Event</th>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Status</th>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>IP Address</th>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Date / Time</th>
                    <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50/50 transition" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                        <span className="bg-slate-100 text-slate-800 font-mono text-[11px] px-2 py-0.5 rounded" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '600', backgroundColor: '#f1f5f9', color: '#1e293b', padding: '2px 8px', borderRadius: '4px' }}>
                          {log.eventName}
                        </span>
                      </td>
                      <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-200" style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', backgroundColor: log.status === 'SUCCESS' ? '#ecfdf5' : '#fef2f2', color: log.status === 'SUCCESS' ? '#047857' : '#b91c1c', border: `1px solid ${log.status === 'SUCCESS' ? '#a7f3d0' : '#fecaca'}` }}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-xs" style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#64748b', fontSize: '12px' }}>
                        {log.ipAddress || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-xs" style={{ padding: '14px 16px', color: '#64748b', fontSize: '12px' }}>
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 text-[11px]" style={{ padding: '14px 16px', color: '#475569', fontSize: '11px' }}>
                        {log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-w-md" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '28rem' }}>
                            {Object.entries(log.metadata).map(([key, val]) => (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px]"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  fontSize: '11px'
                                }}
                              >
                                <strong className="text-slate-600 font-semibold" style={{ color: '#475569', fontWeight: '600' }}>{key}:</strong>
                                <span className="text-slate-900 font-mono" style={{ color: '#0f172a', fontFamily: 'monospace' }}>
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400" style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Commerce Governance Notice & Migration Link */}
      <div
        className="bg-slate-50/90 rounded-2xl border border-slate-200 p-6 mt-8 shadow-xs"
        style={{
          backgroundColor: 'rgba(248, 250, 252, 0.9)',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          marginTop: '32px',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div className="flex items-start gap-3" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0"
            style={{
              padding: '8px',
              borderRadius: '12px',
              backgroundColor: '#fef3c7',
              color: '#b45309',
              flexShrink: 0
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900" style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Legacy Shipping Zones Authority Retired
            </h4>
            <span
              className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
              style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Immutable Governance Active
            </span>
            <p
              className="text-xs text-slate-600 mt-2 leading-relaxed"
              style={{ fontSize: '12px', color: '#475569', marginTop: '8px', lineHeight: '1.6', margin: '8px 0 0 0' }}
            >
              The legacy mutable Shipping Zones system has been retired in favor of versioned Commerce Governance. Cross-border shipping rates, weight band matrices, destination country de-minimis calculations, and fulfillment cutoff times are managed through versioned Global Commerce Governance.
            </p>
            <Link
              href="/commerce"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#ff8a00] hover:text-[#ea580c] transition mt-3"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#ff8a00',
                marginTop: '12px',
                textDecoration: 'none'
              }}
            >
              Open Commerce Governance →
            </Link>
          </div>
        </div>
      </div>

      {/* Add / Edit Serviceability Rule Modal */}
      {isRuleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 relative"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              maxWidth: '32rem',
              width: '100%',
              padding: '24px',
              position: 'relative'
            }}
          >
            <div
              className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '16px',
                borderBottom: '1px solid #f1f5f9',
                marginBottom: '20px'
              }}
            >
              <h3 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Add Pakistan COD Rule
              </h3>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  fontSize: '18px',
                  padding: '4px 8px',
                  borderRadius: '8px'
                }}
              >
                ✕
              </button>
            </div>

            {ruleModalError && (
              <div
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 mb-4"
                style={{
                  padding: '12px',
                  backgroundColor: '#fff1f2',
                  border: '1px solid #fecdd3',
                  borderRadius: '12px',
                  color: '#be123c',
                  fontSize: '12px',
                  marginBottom: '16px'
                }}
              >
                {ruleModalError}
              </div>
            )}

            <form onSubmit={handleSaveRule} className="space-y-4 text-xs" style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '12px' }}>
              <div>
                <label className="block font-bold text-slate-700 mb-1" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                  City *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Islamabad, Karachi, Lahore"
                  value={ruleCity}
                  onChange={(e) => setRuleCity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                  Postal Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Leave blank for entire city (e.g. 44000)"
                  value={rulePostalCode}
                  onChange={(e) => setRulePostalCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <p className="text-[10px] text-slate-400 mt-1" style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                  Specific postal codes take precedence over city-wide rules.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                  Zone Identifier (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ISB-NORTH, KHI-SOUTH"
                  value={ruleZoneKey}
                  onChange={(e) => setRuleZoneKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                <div>
                  <label className="block font-bold text-slate-700 mb-1" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                    Serviceability
                  </label>
                  <select
                    value={ruleIsServiceable ? 'true' : 'false'}
                    onChange={(e) => setRuleIsServiceable(e.target.value === 'true')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#ff8a00]"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="true">Serviceable (Allow COD)</option>
                    <option value="false">Unserviceable (Block COD)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                    Rule Status
                  </label>
                  <select
                    value={ruleStatus}
                    onChange={(e) => setRuleStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#ff8a00]"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1" style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Operational notes or reason for coverage"
                  value={ruleNotes}
                  onChange={(e) => setRuleNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div
                className="flex justify-end gap-2 pt-3 border-t border-slate-100"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  paddingTop: '16px',
                  borderTop: '1px solid #f1f5f9'
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    backgroundColor: '#ffffff',
                    color: '#334155',
                    fontWeight: '600',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ruleSaving}
                  className="px-4 py-2 bg-[#ff8a00] hover:bg-[#ea580c] text-white font-semibold rounded-xl text-xs transition disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '12px',
                    backgroundColor: '#ff8a00',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              maxWidth: '32rem',
              width: '100%',
              padding: '24px',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div
              className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '16px',
                borderBottom: '1px solid #f1f5f9',
                marginBottom: '20px'
              }}
            >
              <h3 className="text-base font-bold text-slate-900 inline-flex items-center gap-2" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <UserCheck size={18} className="text-[#ff8a00]" style={{ color: '#ff8a00' }} />
                Customer COD Risk Status & Governance
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCustomerModalOpen(false);
                  setCustomerStatus(null);
                  setCustomerLookupId('');
                  setCustomerActionError(null);
                  setActionSuccessMessage(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  fontSize: '18px',
                  padding: '4px 8px',
                  borderRadius: '8px'
                }}
              >
                ✕
              </button>
            </div>

            {customerActionError && (
              <div
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 mb-4"
                style={{
                  padding: '12px',
                  backgroundColor: '#fff1f2',
                  border: '1px solid #fecdd3',
                  borderRadius: '12px',
                  color: '#be123c',
                  fontSize: '12px',
                  marginBottom: '16px'
                }}
              >
                {customerActionError}
              </div>
            )}

            {actionSuccessMessage && (
              <div
                className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold mb-4"
                style={{
                  padding: '12px',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '12px',
                  color: '#047857',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginBottom: '16px'
                }}
              >
                {actionSuccessMessage}
              </div>
            )}

            <div className="flex gap-2" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Enter Customer User ID (ObjectId)"
                value={customerLookupId}
                onChange={(e) => setCustomerLookupId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#ff8a00]"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '12px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleLookupCustomer}
                disabled={customerLoading || !customerLookupId.trim()}
                className="px-4 py-2 bg-[#0b132b] hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                style={{
                  backgroundColor: '#0b132b',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                {customerLoading && <Loader2 size={13} className="animate-spin" />}
                Lookup
              </button>
            </div>

            {customerStatus && (
              <div
                className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs"
                style={{
                  padding: '16px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '12px'
                }}
              >
                <div
                  className="flex items-center justify-between"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span className="font-semibold text-slate-500" style={{ fontWeight: '600', color: '#64748b' }}>Effective COD Status:</span>
                  {customerStatus.restricted ? (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1"
                      style={{
                        padding: '2px 10px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: '#ffe4e6',
                        color: '#9f1239',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <XCircle size={12} /> Restricted ({customerStatus.reasonCode || 'COD_BLOCKED'})
                    </span>
                  ) : (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1"
                      style={{
                        padding: '2px 10px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <CheckCircle size={12} /> Eligible
                    </span>
                  )}
                </div>

                <div
                  className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-3 border-t border-slate-200"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '8px',
                    fontSize: '11px',
                    color: '#475569',
                    paddingTop: '12px',
                    borderTop: '1px solid #e2e8f0'
                  }}
                >
                  <div>
                    <span className="text-slate-400" style={{ color: '#94a3b8' }}>Manual Block:</span>{' '}
                    <strong>{customerStatus.manualBlockActive ? 'Active' : 'No'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400" style={{ color: '#94a3b8' }}>Temporary Lock:</span>{' '}
                    <strong>
                      {customerStatus.temporaryLockActive ? `Until ${formatDate(customerStatus.temporaryLockUntil)}` : 'None'}
                    </strong>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span className="text-slate-400" style={{ color: '#94a3b8' }}>Administrative Override:</span>{' '}
                    <strong>{customerStatus.overrideActive ? `${customerStatus.overrideMode}` : 'None'}</strong>
                  </div>
                </div>

                {isAdmin && (
                  <div
                    className="pt-3 border-t border-slate-200 space-y-3"
                    style={{ paddingTop: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}
                  >
                    <h4 className="font-bold text-slate-900 text-xs" style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Administrative Actions</h4>
                    <div className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {customerStatus.manualBlockActive ? (
                        <button
                          type="button"
                          onClick={handleUnblockCustomer}
                          disabled={customerLoading}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#047857',
                            color: '#ffffff',
                            borderRadius: '12px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <UserCheck size={13} /> Unblock Customer COD
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleBlockCustomer}
                          disabled={customerLoading}
                          className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#be123c',
                            color: '#ffffff',
                            borderRadius: '12px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <UserX size={13} /> Manually Block COD
                        </button>
                      )}
                    </div>

                    <div
                      className="pt-2 border-t border-slate-200 space-y-2"
                      style={{ paddingTop: '8px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}
                    >
                      <span className="text-[11px] font-bold text-slate-700" style={{ fontSize: '11px', fontWeight: '700', color: '#334155' }}>Set Administrative Override:</span>
                      <div className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <select
                          value={overrideMode}
                          onChange={(e) => setOverrideMode(e.target.value as 'NONE' | 'UNTIL' | 'INDEFINITE')}
                          className="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
                          style={{
                            padding: '6px 10px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '12px',
                            fontSize: '12px',
                            backgroundColor: '#ffffff',
                            color: '#0f172a'
                          }}
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
                            className="w-16 px-2 py-1.5 border border-slate-300 rounded-xl text-xs text-center"
                            style={{
                              width: '64px',
                              padding: '6px 8px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '12px',
                              fontSize: '12px',
                              textAlign: 'center'
                            }}
                          />
                        )}

                        <select
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
                          style={{
                            padding: '6px 10px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '12px',
                            fontSize: '12px',
                            backgroundColor: '#ffffff',
                            color: '#0f172a'
                          }}
                        >
                          <option value="CUSTOMER_APPEAL_APPROVED">Appeal Approved</option>
                          <option value="VIP_EXCEPTION">VIP Exception</option>
                          <option value="COURIER_ERROR_CORRECTION">Courier Error Correction</option>
                        </select>

                        <button
                          type="button"
                          onClick={handleApplyOverride}
                          disabled={customerLoading}
                          className="px-3 py-1.5 bg-[#0b132b] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#0b132b',
                            color: '#ffffff',
                            borderRadius: '12px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                          }}
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
