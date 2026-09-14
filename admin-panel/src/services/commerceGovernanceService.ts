/**
 * Authoritative Commerce Governance Admin Service
 * Interfaces directly with Phase 6B /api/commerce/admin/config/* endpoints.
 */

import api from '../lib/api';
import type {
  CommerceConfigurationVersion,
  QuotePreviewRequest,
  QuotePreviewResponse,
  ReadinessStatus,
  ValidationResult,
  VersionListResponse,
} from '../types/commerceGovernance';

export interface DraftMutationPayload {
  merchantScopeId?: string;
  expectedLockVersion?: number;
  sourceVersionId?: string;
  merchantProfile?: unknown;
  shippingRules?: unknown[];
  taxRules?: unknown[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  changeNotes?: string;
}

export const commerceGovernanceService = {
  /**
   * Lists configuration versions for a merchant scope.
   */
  async listVersions(params?: {
    merchantScopeId?: string;
    page?: number;
    limit?: number;
    status?: string;
  }, signal?: AbortSignal): Promise<VersionListResponse> {
    const query = new URLSearchParams();
    if (params?.merchantScopeId) query.set('merchantScopeId', params.merchantScopeId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);

    const res = await api.get(`/commerce/admin/config/versions?${query.toString()}`, { signal });
    return res.data.data as VersionListResponse;
  },

  /**
   * Retrieves single version by ID or version number.
   */
  async getVersion(id: string, merchantScopeId = 'default', signal?: AbortSignal): Promise<CommerceConfigurationVersion> {
    const res = await api.get(`/commerce/admin/config/versions/${encodeURIComponent(id)}`, {
      params: { merchantScopeId },
      signal,
    });
    return res.data.data.version as CommerceConfigurationVersion;
  },

  /**
   * Retrieves readiness status report for a merchant scope.
   */
  async getReadiness(merchantScopeId = 'default', signal?: AbortSignal): Promise<ReadinessStatus> {
    const res = await api.get('/commerce/admin/config/readiness', {
      params: { merchantScopeId },
      signal,
    });
    return res.data.data as ReadinessStatus;
  },

  /**
   * Creates a new configuration draft.
   */
  async createDraft(payload: DraftMutationPayload): Promise<CommerceConfigurationVersion> {
    const res = await api.post('/commerce/admin/config/draft', payload);
    return res.data.data.draft as CommerceConfigurationVersion;
  },

  /**
   * Updates an existing configuration draft with optimistic concurrency lockVersion.
   */
  async updateDraft(id: string, payload: DraftMutationPayload): Promise<CommerceConfigurationVersion> {
    const res = await api.put(`/commerce/admin/config/draft/${encodeURIComponent(id)}`, payload);
    return res.data.data.draft as CommerceConfigurationVersion;
  },

  /**
   * Runs authoritative integrity validation on a draft.
   */
  async validateDraft(id: string, merchantScopeId = 'default'): Promise<ValidationResult> {
    const res = await api.post(`/commerce/admin/config/draft/${encodeURIComponent(id)}/validate`, {
      merchantScopeId,
    });
    return res.data.data as ValidationResult;
  },

  /**
   * Schedules or activates a validated configuration version (Super Admin only).
   */
  async activateVersion(id: string, payload?: { merchantScopeId?: string; effectiveFrom?: string }): Promise<CommerceConfigurationVersion> {
    const res = await api.post(`/commerce/admin/config/versions/${encodeURIComponent(id)}/activate`, payload || {});
    return res.data.data.version as CommerceConfigurationVersion;
  },

  /**
   * Retires or emergency revokes an active configuration version (Super Admin only).
   */
  async retireVersion(id: string, payload?: { merchantScopeId?: string; reason?: string; isEmergency?: boolean }): Promise<CommerceConfigurationVersion> {
    const res = await api.post(`/commerce/admin/config/versions/${encodeURIComponent(id)}/retire`, payload || {});
    return res.data.data.version as CommerceConfigurationVersion;
  },

  /**
   * Read-only simulation preview calculating landed costs against specified version.
   * Produces zero mutations, zero side effects.
   */
  async previewQuote(request: QuotePreviewRequest, signal?: AbortSignal): Promise<QuotePreviewResponse> {
    const res = await api.post('/commerce/admin/config/preview', request, { signal });
    return res.data.data.preview as QuotePreviewResponse;
  },
};
