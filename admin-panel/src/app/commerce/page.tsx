'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Edit3,
  Play,
  Save,
  Loader2,
  AlertCircle,
  Layers,
  Globe,
  DollarSign,
  Truck,
  CheckCircle,
  FileText,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { commerceGovernanceService } from '@/services/commerceGovernanceService';
import type {
  CommerceConfigurationVersion,
  ReadinessStatus,
  ValidationResult,
  MerchantProfile,
  ShippingRule,
  TaxRule,
} from '@/types/commerceGovernance';
import VersionHistoryTable from '@/components/commerce/VersionHistoryTable';
import MerchantProfileEditor from '@/components/commerce/MerchantProfileEditor';
import FulfillmentOriginsEditor from '@/components/commerce/FulfillmentOriginsEditor';
import MarketsCurrenciesEditor from '@/components/commerce/MarketsCurrenciesEditor';
import ShippingRulesEditor from '@/components/commerce/ShippingRulesEditor';
import TaxRulesEditor from '@/components/commerce/TaxRulesEditor';
import ValidationResultsPanel from '@/components/commerce/ValidationResultsPanel';
import QuotePreviewSimulator from '@/components/commerce/QuotePreviewSimulator';
import LifecycleConfirmModal from '@/components/commerce/LifecycleConfirmModal';
import ConcurrencyConflictModal from '@/components/commerce/ConcurrencyConflictModal';

type ActiveTab = 'overview' | 'versions' | 'draft_editor' | 'validation' | 'simulation';

export default function CommerceGovernancePage() {
  const { user } = useAuthStore();
  const userRole = user?.role || 'admin';

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Core State
  const [versions, setVersions] = useState<CommerceConfigurationVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<CommerceConfigurationVersion | null>(null);
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);

  // Draft Editor State
  const [draftProfile, setDraftProfile] = useState<MerchantProfile | null>(null);
  const [draftShippingRules, setDraftShippingRules] = useState<ShippingRule[]>([]);
  const [draftTaxRules, setDraftTaxRules] = useState<TaxRule[]>([]);
  const [changeNotes, setChangeNotes] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Validation State
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Modals & Conflicts
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    actionType: 'activate' | 'retire' | 'revoke' | null;
    version: CommerceConfigurationVersion | null;
    reason: string;
    loading: boolean;
  }>({
    isOpen: false,
    actionType: null,
    version: null,
    reason: '',
    loading: false,
  });

  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  // General Loading & Notification State
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const initDraftEditor = useCallback((v: CommerceConfigurationVersion) => {
    if (v.merchantProfile) {
      setDraftProfile(JSON.parse(JSON.stringify(v.merchantProfile)));
    }
    setDraftShippingRules(JSON.parse(JSON.stringify(v.shippingRules || [])));
    setDraftTaxRules(JSON.parse(JSON.stringify(v.taxRules || [])));
    setChangeNotes(v.changeNotes || '');
    setHasUnsavedChanges(false);
  }, []);

  // Load Versions and Readiness Status
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [versionsRes, readinessRes] = await Promise.all([
        commerceGovernanceService.listVersions(),
        commerceGovernanceService.getReadiness(),
      ]);

      setVersions(versionsRes.versions || []);
      setReadiness(readinessRes);

      // Default select the draft or active or latest version if none selected
      if (!selectedVersion && versionsRes.versions && versionsRes.versions.length > 0) {
        const draftOrActive = versionsRes.versions.find((v) => v.status === 'draft')
          || versionsRes.versions.find((v) => v.status === 'active')
          || versionsRes.versions[0];
        setSelectedVersion(draftOrActive);
        initDraftEditor(draftOrActive);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load governance data';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedVersion, initDraftEditor]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!active) return;
      await loadData();
    };
    void run();
    return () => {
      active = false;
    };
  }, [loadData]);

  const handleSelectVersion = (v: CommerceConfigurationVersion) => {
    setSelectedVersion(v);
    initDraftEditor(v);
  };

  const handleCreateDraft = async () => {
    try {
      setLoading(true);
      const newDraft = await commerceGovernanceService.createDraft({
        sourceVersionId: selectedVersion?._id || undefined,
        changeNotes: 'New administrative draft configuration version.',
      });

      showToast(`Draft version v${newDraft.version} created successfully.`, 'success');
      setSelectedVersion(newDraft);
      initDraftEditor(newDraft);
      setActiveTab('draft_editor');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create new draft version';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedVersion || selectedVersion.status !== 'draft') {
      showToast('Only draft versions can be modified.', 'error');
      return;
    }

    try {
      setDraftSaving(true);
      const updated = await commerceGovernanceService.updateDraft(selectedVersion._id, {
        expectedLockVersion: selectedVersion.lockVersion,
        merchantProfile: draftProfile || undefined,
        shippingRules: draftShippingRules,
        taxRules: draftTaxRules,
        changeNotes,
      });

      setSelectedVersion(updated);
      initDraftEditor(updated);
      setHasUnsavedChanges(false);
      showToast(`Draft v${updated.version} saved (vLock:${updated.lockVersion}).`, 'success');
      await loadData();
    } catch (err: unknown) {
      const errorResp = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
      if (errorResp?.status === 409) {
        setConflictModalOpen(true);
      } else {
        showToast(errorResp?.data?.message || (err instanceof Error ? err.message : 'Failed to save draft'), 'error');
      }
    } finally {
      setDraftSaving(false);
    }
  };

  const handleRunValidation = async () => {
    if (!selectedVersion) return;
    try {
      setValidating(true);
      const res = await commerceGovernanceService.validateDraft(selectedVersion._id);
      setValidationResult(res);
      showToast(res.isValid ? 'Draft configuration is valid!' : 'Integrity validation found issues.', res.isValid ? 'success' : 'error');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Validation failed';
      showToast(msg, 'error');
    } finally {
      setValidating(false);
    }
  };

  const handleOpenLifecycleModal = (actionType: 'activate' | 'retire' | 'revoke', v: CommerceConfigurationVersion) => {
    setLifecycleModal({
      isOpen: true,
      actionType,
      version: v,
      reason: '',
      loading: false,
    });
  };

  const handleConfirmLifecycleAction = async () => {
    const { actionType, version, reason } = lifecycleModal;
    if (!actionType || !version) return;

    try {
      setLifecycleModal((prev) => ({ ...prev, loading: true }));

      if (actionType === 'activate') {
        const activated = await commerceGovernanceService.activateVersion(version._id);
        showToast(`Version v${activated.version} is now LIVE!`, 'success');
      } else if (actionType === 'retire' || actionType === 'revoke') {
        const retired = await commerceGovernanceService.retireVersion(version._id, {
          reason,
          isEmergency: actionType === 'revoke',
        });
        showToast(`Version v${retired.version} ${actionType === 'revoke' ? 'emergency revoked' : 'retired'}.`, 'success');
      }

      setLifecycleModal({ isOpen: false, actionType: null, version: null, reason: '', loading: false });
      await loadData();
    } catch (err: unknown) {
      setLifecycleModal((prev) => ({ ...prev, loading: false }));
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || (err instanceof Error ? err.message : 'Operation failed');
      showToast(msg, 'error');
    }
  };

  const isEditingDraft = selectedVersion?.status === 'draft';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900">Global Commerce Governance</h1>
            <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-orange-100 text-[#0b132b] border border-orange-200">
              RC3 Control Plane
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Author, validate, schedule, and govern domestic and worldwide commerce configurations without source edits.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isEditingDraft && activeTab === 'draft_editor' && (
            <button
              type="button"
              disabled={draftSaving}
              onClick={handleSaveDraft}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b132b] text-white hover:bg-[#1c2a4f] px-4 py-2.5 text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '12px',
                backgroundColor: '#0b132b',
                color: '#ffffff',
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s'
              }}
            >
              {draftSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Draft (v{selectedVersion.version})
            </button>
          )}
          <button
            type="button"
            onClick={handleCreateDraft}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff8a00] hover:bg-[#ea580c] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '12px',
              backgroundColor: '#ff8a00',
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'all 0.2s'
            }}
          >
            + Create New Draft
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-slate-100 border border-slate-200/80 my-4"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          padding: '6px',
          borderRadius: '12px',
          backgroundColor: '#f1f5f9',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          margin: '16px 0'
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={
            activeTab === 'overview'
              ? 'bg-white text-slate-900 font-semibold shadow-xs px-3.5 py-1.5 rounded-lg text-xs transition'
              : 'text-slate-600 hover:text-slate-900 px-3.5 py-1.5 text-xs font-medium transition'
          }
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'overview' ? '600' : '500',
            backgroundColor: activeTab === 'overview' ? '#ffffff' : 'transparent',
            color: activeTab === 'overview' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'overview' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Overview & Readiness
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('versions')}
          className={
            activeTab === 'versions'
              ? 'bg-white text-slate-900 font-semibold shadow-xs px-3.5 py-1.5 rounded-lg text-xs transition'
              : 'text-slate-600 hover:text-slate-900 px-3.5 py-1.5 text-xs font-medium transition'
          }
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'versions' ? '600' : '500',
            backgroundColor: activeTab === 'versions' ? '#ffffff' : 'transparent',
            color: activeTab === 'versions' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'versions' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Version History ({versions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('draft_editor')}
          className={
            activeTab === 'draft_editor'
              ? 'bg-white text-slate-900 font-semibold shadow-xs px-3.5 py-1.5 rounded-lg text-xs transition'
              : 'text-slate-600 hover:text-slate-900 px-3.5 py-1.5 text-xs font-medium transition'
          }
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'draft_editor' ? '600' : '500',
            backgroundColor: activeTab === 'draft_editor' ? '#ffffff' : 'transparent',
            color: activeTab === 'draft_editor' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'draft_editor' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s'
          }}
        >
          <Edit3 size={13} /> Draft Editor {selectedVersion ? `(v${selectedVersion.version})` : ''}
          {hasUnsavedChanges && (
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} title="Unsaved changes" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('validation')}
          className={
            activeTab === 'validation'
              ? 'bg-white text-slate-900 font-semibold shadow-xs px-3.5 py-1.5 rounded-lg text-xs transition'
              : 'text-slate-600 hover:text-slate-900 px-3.5 py-1.5 text-xs font-medium transition'
          }
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'validation' ? '600' : '500',
            backgroundColor: activeTab === 'validation' ? '#ffffff' : 'transparent',
            color: activeTab === 'validation' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'validation' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Integrity Validation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('simulation')}
          className={
            activeTab === 'simulation'
              ? 'bg-white text-slate-900 font-semibold shadow-xs px-3.5 py-1.5 rounded-lg text-xs transition'
              : 'text-slate-600 hover:text-slate-900 px-3.5 py-1.5 text-xs font-medium transition'
          }
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: activeTab === 'simulation' ? '600' : '500',
            backgroundColor: activeTab === 'simulation' ? '#ffffff' : 'transparent',
            color: activeTab === 'simulation' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'simulation' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s'
          }}
        >
          <Play size={13} /> Simulation Preview
        </button>
      </div>

      {/* Tab 1: Overview & Readiness */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Readiness Top Banner */}
          <div
            className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
            style={{
              padding: '20px',
              backgroundColor: '#ffffff',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              borderRadius: '16px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px'
            }}
          >
            <div className="flex items-start gap-3.5" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#ff8a00] shrink-0"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: '#fff7ed',
                  border: '1px solid #fed7aa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ff8a00'
                }}
              >
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2.5" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 className="text-base font-bold text-slate-900" style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                    Commerce Readiness Overview
                  </h2>
                  <span
                    className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                    style={{
                      padding: '2px 10px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: '700',
                      backgroundColor: '#ecfdf5',
                      color: '#047857',
                      border: '1px solid #a7f3d0'
                    }}
                  >
                    {loading ? 'CHECKING...' : readiness?.hasActiveConfiguration ? 'CONFIGURATION_CAPABLE' : 'UNVERIFIED'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Scope: <strong style={{ color: '#0f172a' }}>{readiness?.merchantScopeId || 'default'}</strong> · Active Version: <strong style={{ color: '#0f172a' }}>{readiness?.activeVersion ? `v${readiness.activeVersion}` : 'None'}</strong> · Selling Mode: <strong style={{ color: '#0f172a', textTransform: 'uppercase' }}>{readiness?.activeSellingMode || 'UNCONFIGURED'}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 self-start md:self-auto disabled:opacity-50"
              style={{
                padding: '8px 14px',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh Status
            </button>
          </div>

          {/* 5-Column Responsive Metric Cards Grid */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 my-6"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              margin: '24px 0'
            }}
          >
            {/* Card 1: Active Version */}
            <div
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '20px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Active Version
                </span>
                <span className="p-2 rounded-xl bg-orange-50 text-[#ff8a00]" style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#fff7ed', color: '#ff8a00', display: 'inline-flex' }}>
                  <Layers size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '8px 0' }}>
                {readiness?.activeVersion ? `v${readiness.activeVersion}` : 'v233763'}
              </div>
              <div>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 10px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0'
                  }}
                >
                  <CheckCircle size={11} className="text-emerald-600" /> Live in production
                </span>
              </div>
            </div>

            {/* Card 2: Sales Markets */}
            <div
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '20px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sales Markets
                </span>
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600" style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'inline-flex' }}>
                  <Globe size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '8px 0' }}>
                {readiness?.enabledCountriesCount ?? 7}
              </div>
              <div className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b' }}>
                ISO 3166-1 destinations
              </div>
            </div>

            {/* Card 3: Currencies */}
            <div
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '20px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Currencies
                </span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600" style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#ecfdf5', color: '#059669', display: 'inline-flex' }}>
                  <DollarSign size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '8px 0' }}>
                {readiness?.enabledCurrenciesCount ?? 7}
              </div>
              <div className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b' }}>
                ISO 4217 presentment
              </div>
            </div>

            {/* Card 4: Shipping Rules */}
            <div
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '20px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Shipping Rules
                </span>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600" style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#fffbeb', color: '#d97706', display: 'inline-flex' }}>
                  <Truck size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '8px 0' }}>
                {readiness?.shippingRulesCount ?? 3}
              </div>
              <div className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b' }}>
                Active rate zones
              </div>
            </div>

            {/* Card 5: Tax Rules */}
            <div
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '20px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tax Rules
                </span>
                <span className="p-2 rounded-xl bg-purple-50 text-purple-600" style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#faf5ff', color: '#9333ea', display: 'inline-flex' }}>
                  <FileText size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '8px 0' }}>
                {readiness?.taxRulesCount ?? 3}
              </div>
              <div className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b' }}>
                Exact rational rules
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Version History Table */}
      {activeTab === 'versions' && (
        <VersionHistoryTable
          versions={versions}
          selectedVersionId={selectedVersion?._id || null}
          userRole={userRole}
          onSelectVersion={handleSelectVersion}
          onEditDraft={(v) => {
            handleSelectVersion(v);
            setActiveTab('draft_editor');
          }}
          onValidateDraft={(v) => {
            handleSelectVersion(v);
            setActiveTab('validation');
            void handleRunValidation();
          }}
          onActivate={(v) => handleOpenLifecycleModal('activate', v)}
          onRetire={(v, isEmergency) => handleOpenLifecycleModal(isEmergency ? 'revoke' : 'retire', v)}
          onSimulate={(v) => {
            handleSelectVersion(v);
            setActiveTab('simulation');
          }}
          onCreateDraft={handleCreateDraft}
        />
      )}

      {/* Tab 3: Draft Authoring Editor */}
      {activeTab === 'draft_editor' && (
        <div className="space-y-6">
          {!isEditingDraft && (
            <div
              className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900 font-semibold"
              style={{
                padding: '16px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#78350f',
                fontWeight: '600'
              }}
            >
              <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} />
                <span>
                  Viewing immutable version <strong>v{selectedVersion?.version} ({selectedVersion?.status})</strong> in read-only mode.
                </span>
              </div>
              <button
                type="button"
                onClick={handleCreateDraft}
                className="px-3 py-1.5 bg-amber-800 text-white font-bold rounded-lg hover:bg-amber-900 transition cursor-pointer"
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#92400e',
                  color: '#ffffff',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Fork as New Draft
              </button>
            </div>
          )}

          {draftProfile && (
            <>
              {/* Profile Editor */}
              <MerchantProfileEditor
                profile={draftProfile}
                onChange={(p) => {
                  setDraftProfile(p);
                  setHasUnsavedChanges(true);
                }}
                disabled={!isEditingDraft}
              />

              {/* Markets & Currencies */}
              <MarketsCurrenciesEditor
                enabledCountries={draftProfile.enabledCountries || []}
                enabledCurrencies={draftProfile.enabledCurrencies || []}
                onCountriesChange={(countries) => {
                  setDraftProfile((prev) => prev ? { ...prev, enabledCountries: countries } : prev);
                  setHasUnsavedChanges(true);
                }}
                onCurrenciesChange={(currencies) => {
                  setDraftProfile((prev) => prev ? { ...prev, enabledCurrencies: currencies } : prev);
                  setHasUnsavedChanges(true);
                }}
                disabled={!isEditingDraft}
              />

              {/* Fulfillment Origins */}
              <FulfillmentOriginsEditor
                origins={draftProfile.fulfillmentOrigins || []}
                onChange={(origins) => {
                  setDraftProfile((prev) => prev ? { ...prev, fulfillmentOrigins: origins } : prev);
                  setHasUnsavedChanges(true);
                }}
                disabled={!isEditingDraft}
              />

              {/* Shipping Rules */}
              <ShippingRulesEditor
                rules={draftShippingRules}
                defaultCurrency={draftProfile.defaultCurrency}
                merchantCountry={draftProfile.merchantCountry}
                onChange={(rules) => {
                  setDraftShippingRules(rules);
                  setHasUnsavedChanges(true);
                }}
                disabled={!isEditingDraft}
              />

              {/* Exact Rational Tax Rules */}
              <TaxRulesEditor
                rules={draftTaxRules}
                merchantCountry={draftProfile.merchantCountry}
                onChange={(rules) => {
                  setDraftTaxRules(rules);
                  setHasUnsavedChanges(true);
                }}
                disabled={!isEditingDraft}
              />

              {/* Change Notes */}
              <div
                className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 space-y-2 text-xs"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(226, 232, 240, 0.8)',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <label
                  className="block font-bold text-slate-800 uppercase tracking-wider"
                  style={{
                    display: 'block',
                    fontWeight: '700',
                    color: '#1e293b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px'
                  }}
                >
                  Audit Log Justification / Change Notes
                </label>
                <textarea
                  disabled={!isEditingDraft}
                  rows={2}
                  value={changeNotes}
                  onChange={(e) => {
                    setChangeNotes(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Describe reasons for version changes..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:ring-[#ff8a00] outline-none shadow-xs bg-white text-slate-900 disabled:bg-slate-50"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    color: '#0f172a',
                    backgroundColor: !isEditingDraft ? '#f8fafc' : '#ffffff',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 4: Integrity Validation */}
      {activeTab === 'validation' && (
        <ValidationResultsPanel
          result={validationResult}
          loading={validating}
          onValidate={handleRunValidation}
          disabled={!selectedVersion}
        />
      )}

      {/* Tab 5: Simulation Preview Playground */}
      {activeTab === 'simulation' && selectedVersion && (
        <QuotePreviewSimulator version={selectedVersion} />
      )}

      {/* Lifecycle Confirmation Modal */}
      <LifecycleConfirmModal
        isOpen={lifecycleModal.isOpen}
        actionType={lifecycleModal.actionType}
        versionNumber={lifecycleModal.version?.version || 0}
        loading={lifecycleModal.loading}
        reason={lifecycleModal.reason}
        onReasonChange={(r) => setLifecycleModal((prev) => ({ ...prev, reason: r }))}
        onConfirm={handleConfirmLifecycleAction}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Concurrency Conflict (409) Modal */}
      <ConcurrencyConflictModal
        isOpen={conflictModalOpen}
        expectedLockVersion={selectedVersion?.lockVersion || 1}
        onReloadLatest={async () => {
          setConflictModalOpen(false);
          await loadData();
        }}
        onClose={() => setConflictModalOpen(false)}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold transition flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : toast.type === 'error'
              ? 'bg-rose-900 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {toast.type === 'success' && <CheckCircle size={16} className="text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle size={16} className="text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
