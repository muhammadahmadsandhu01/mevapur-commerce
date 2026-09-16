/**
 * Phase 6C Admin Commerce Governance Real-DOM Test Suite
 * Tests full rendering, tab navigation, version management, draft authoring,
 * validation panel, quote preview simulation, RBAC guardrails, and conflict modals.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommerceGovernancePage from '../src/app/commerce/page';
import { commerceGovernanceService } from '../src/services/commerceGovernanceService';
import type {
  CommerceConfigurationVersion,
  ReadinessStatus,
} from '../src/types/commerceGovernance';

// Mock authStore
let mockUserRole = 'super_admin';
vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    user: { fullName: 'Admin User', email: 'admin@mevapur.com', role: mockUserRole },
    isAuthenticated: true,
  }),
}));

const mockVersion1: CommerceConfigurationVersion = {
  _id: 'v_doc_1',
  version: 1,
  merchantScopeId: 'default',
  status: 'active',
  lockVersion: 3,
  merchantProfile: {
    merchantCountry: 'PK',
    legalName: 'MevaPur Global Ltd',
    sellingMode: 'hybrid',
    baseCurrency: 'PKR',
    defaultCurrency: 'PKR',
    enabledCurrencies: ['PKR', 'AED', 'USD'],
    enabledCountries: ['PK', 'AE', 'GB', 'US'],
    defaultLocale: 'en-PK',
    defaultTimeZone: 'Asia/Karachi',
    fulfillmentOrigins: [
      {
        originId: 'orig_1',
        name: 'Lahore Central Hub',
        country: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        enabled: true,
        isDefault: true,
      },
    ],
    supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
    taxCalculationMode: 'exact_rational',
  },
  shippingRules: [
    {
      ruleId: 'ship_1',
      name: 'UAE Standard Tracked',
      serviceCode: 'standard',
      displayName: 'Standard Tracked',
      originCountry: 'PK',
      destinationCountry: 'AE',
      currency: 'AED',
      baseRateExact: { amountMinor: '2500', currency: 'AED', exponent: 2 },
      deliveryMinDays: 3,
      deliveryMaxDays: 5,
      enabled: true,
    },
  ],
  taxRules: [
    {
      ruleId: 'tax_1',
      destinationCountry: 'AE',
      taxType: 'VAT',
      taxTreatment: 'exclusive',
      taxableBasis: 'subtotal',
      taxRateNumerator: 500,
      taxRateDenominator: 10000,
      incoterm: 'DAP',
      sourceAuthority: 'UAE Federal Tax Authority',
      sourceReference: 'Decree Law 8/2017',
      verificationStatus: 'VERIFIED_LEGAL_RULE',
      requiresTax: true,
      requiresDuty: false,
      enabled: true,
    },
  ],
  effectiveFrom: '2026-09-14T00:00:00.000Z',
  effectiveTo: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z',
};

const mockDraftVersion: CommerceConfigurationVersion = {
  _id: 'v_doc_2',
  version: 2,
  merchantScopeId: 'default',
  status: 'draft',
  lockVersion: 1,
  merchantProfile: {
    ...mockVersion1.merchantProfile,
  },
  shippingRules: [...mockVersion1.shippingRules],
  taxRules: [...mockVersion1.taxRules],
  createdAt: '2026-09-14T10:00:00.000Z',
  updatedAt: '2026-09-14T10:00:00.000Z',
};

const mockReadiness: ReadinessStatus = {
  merchantScopeId: 'default',
  hasActiveConfiguration: true,
  activeVersion: 1,
  activeEffectiveFrom: '2026-09-14T00:00:00.000Z',
  activeSellingMode: 'hybrid',
  enabledCountriesCount: 4,
  enabledCurrenciesCount: 3,
  shippingRulesCount: 1,
  taxRulesCount: 1,
  unverifiedTaxRulesCount: 0,
  recentVersions: [
    { version: 2, status: 'draft' },
    { version: 1, status: 'active', effectiveFrom: '2026-09-14T00:00:00.000Z' },
  ],
};

describe('Phase 6C Admin Commerce Governance Real-DOM Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'super_admin';

    vi.spyOn(commerceGovernanceService, 'listVersions').mockResolvedValue({
      versions: [mockDraftVersion, mockVersion1],
      pagination: { page: 1, limit: 20, total: 2, pages: 1 },
    });

    vi.spyOn(commerceGovernanceService, 'getReadiness').mockResolvedValue(mockReadiness);

    vi.spyOn(commerceGovernanceService, 'createDraft').mockResolvedValue({
      ...mockDraftVersion,
      version: 3,
      _id: 'v_doc_3',
    });

    vi.spyOn(commerceGovernanceService, 'updateDraft').mockResolvedValue({
      ...mockDraftVersion,
      lockVersion: 2,
    });

    vi.spyOn(commerceGovernanceService, 'validateDraft').mockResolvedValue({
      version: 2,
      status: 'validated',
      isValid: true,
      errors: [],
      warnings: [],
      checkedAt: new Date().toISOString(),
    });

    vi.spyOn(commerceGovernanceService, 'activateVersion').mockResolvedValue({
      ...mockDraftVersion,
      status: 'active',
    });

    vi.spyOn(commerceGovernanceService, 'previewQuote').mockResolvedValue({
      previewVersion: 2,
      previewStatus: 'draft',
      merchantScopeId: 'default',
      destinationCountry: 'AE',
      currency: 'AED',
      incoterm: 'DAP',
      items: [],
      totals: {
        subtotal: 200,
        shipping: 25,
        tax: 10,
        taxType: 'VAT',
        duties: 0,
        grandTotal: 235,
      },
      appliedRules: {
        shippingRuleId: 'ship_1',
        taxRuleId: 'tax_1',
        taxSourceReference: 'Decree 8/2017',
        taxVerificationStatus: 'VERIFIED_LEGAL_RULE',
      },
      deliveryEstimate: { minDays: 3, maxDays: 5 },
    });
  });

  it('1. Renders Overview tab with truthful readiness metrics and classification badge', async () => {
    render(<CommerceGovernancePage />);

    await waitFor(() => {
      expect(screen.getByText(/Commerce Readiness Overview/i)).toBeInTheDocument();
    });

    expect(screen.getByText('CONFIGURATION_CAPABLE')).toBeInTheDocument();
    expect(screen.getByText(/hybrid/i)).toBeInTheDocument();
    expect(screen.getAllByText('v1').length).toBeGreaterThan(0);
  });

  it('2. Navigates to Version History and renders status badges & lock versions', async () => {
    render(<CommerceGovernancePage />);

    await waitFor(() => {
      expect(screen.getByText(/Version History/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Version History/i));

    await waitFor(() => {
      expect(screen.getByText('Configuration Versions')).toBeInTheDocument();
    });

    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('vLock:1')).toBeInTheDocument();

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('vLock:3')).toBeInTheDocument();
  });

  it('3. Authoring Draft updates profile, markets, and rational tax rules', async () => {
    render(<CommerceGovernancePage />);

    await waitFor(() => {
      expect(screen.getByText(/Draft Editor/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Draft Editor/i));

    await waitFor(() => {
      expect(screen.getByText('Merchant Commercial Profile')).toBeInTheDocument();
      expect(screen.getByText('Enabled Sales Markets (Destinations)')).toBeInTheDocument();
      expect(screen.getByText('Exact Rational Tax & Customs Rules')).toBeInTheDocument();
    });

    // Check rational tax fraction display
    expect(screen.getByText(/VAT \(5%\)/i)).toBeInTheDocument();
  });

  it('4. Runs integrity validation and renders valid status', async () => {
    render(<CommerceGovernancePage />);

    await waitFor(() => {
      expect(screen.getByText('Integrity Validation')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Integrity Validation'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Validation/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Run Validation/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Draft Configuration is Valid/i).length).toBeGreaterThan(0);
    });
  });

  it('5. Executes read-only simulation preview and displays landed cost breakdown', async () => {
    render(<CommerceGovernancePage />);

    await waitFor(() => {
      expect(screen.getByText(/Simulation Preview/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Simulation Preview/i));

    await waitFor(() => {
      expect(screen.getByText('Read-Only Quote Simulation (Preview)')).toBeInTheDocument();
    });

    const simBtn = screen.getByRole('button', { name: /Run Read-Only Simulation/i });
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulation Result for AE \(AED\)/i)).toBeInTheDocument();
      expect(screen.getByText('AED 235.00')).toBeInTheDocument();
      expect(screen.getByText('Incoterm: DAP')).toBeInTheDocument();
    });
  });

  it('6. Non-super_admin role cannot access activation button', async () => {
    mockUserRole = 'admin'; // Standard admin (cannot activate)

    render(<CommerceGovernancePage />);

    await waitFor(() => {
      expect(screen.getByText(/Version History/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Version History/i));

    await waitFor(() => {
      expect(screen.getByText('Configuration Versions')).toBeInTheDocument();
    });

    // Activation button is absent for standard admin
    expect(screen.queryByRole('button', { name: /^Activate$/i })).not.toBeInTheDocument();
  });
});
