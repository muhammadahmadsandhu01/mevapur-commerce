'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Edit3,
  CheckCircle2,
  Play,
  Save,
  Loader2,
  AlertCircle,
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
import ReadinessOverview from '@/components/commerce/ReadinessOverview';
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
  const [merchantScopeId] = useState('default');

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
        commerceGovernanceService.listVersions({ merchantScopeId }),
        commerceGovernanceService.getReadiness(merchantScopeId),
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
  }, [merchantScopeId, selectedVersion, initDraftEditor]);

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
        merchantScopeId,
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
        merchantScopeId,
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
      const res = await commerceGovernanceService.validateDraft(selectedVersion._id, merchantScopeId);
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
        const activated = await commerceGovernanceService.activateVersion(version._id, {
          merchantScopeId,
        });
        showToast(`Version v${activated.version} is now LIVE!`, 'success');
      } else if (actionType === 'retire' || actionType === 'revoke') {
        const retired = await commerceGovernanceService.retireVersion(version._id, {
          merchantScopeId,
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
              className="px-4 py-2 bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-black text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              {draftSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Draft (v{selectedVersion.version})
            </button>
          )}
          <button
            type="button"
            onClick={handleCreateDraft}
            className="px-3.5 py-2 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            + Create New Draft
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-3 transition border-b-2 ${
            activeTab === 'overview'
              ? 'border-[#ff8a00] text-[#0b132b]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Overview & Readiness
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('versions')}
          className={`pb-3 px-3 transition border-b-2 ${
            activeTab === 'versions'
              ? 'border-[#ff8a00] text-[#0b132b]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Version History ({versions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('draft_editor')}
          className={`pb-3 px-3 transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'draft_editor'
              ? 'border-[#ff8a00] text-[#0b132b]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Edit3 size={13} /> Draft Editor {selectedVersion ? `(v${selectedVersion.version})` : ''}
          {hasUnsavedChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" title="Unsaved changes" />}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('validation')}
          className={`pb-3 px-3 transition border-b-2 ${
            activeTab === 'validation'
              ? 'border-[#ff8a00] text-[#0b132b]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Integrity Validation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('simulation')}
          className={`pb-3 px-3 transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'simulation'
              ? 'border-[#ff8a00] text-[#0b132b]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Play size={13} /> Simulation Preview
        </button>
      </div>

      {/* Tab 1: Overview & Readiness */}
      {activeTab === 'overview' && (
        <ReadinessOverview
          readiness={readiness}
          loading={loading}
          onRefresh={loadData}
        />
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
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900 font-semibold">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>
                  Viewing immutable version <strong>v{selectedVersion?.version} ({selectedVersion?.status})</strong> in read-only mode.
                </span>
              </div>
              <button
                type="button"
                onClick={handleCreateDraft}
                className="px-3 py-1.5 bg-amber-800 text-white font-bold rounded-lg hover:bg-amber-900 transition"
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
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-2 text-xs">
                <label className="block font-bold text-slate-800 uppercase tracking-wider">
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
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 outline-none disabled:bg-slate-50"
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
          {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle size={16} className="text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
