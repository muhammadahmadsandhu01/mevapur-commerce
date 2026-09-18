/**
 * @file phase6d4TaxGovernance.dom.test.tsx
 * @description Real-DOM vitest suite for Phase 6D-4D Admin Tax & Customs Governance Components.
 * Covers TaxRulesEditor, QuotePreviewSimulator (DDP vs DAP, De-minimis rendering, rational arithmetic).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaxRulesEditor from '../src/components/commerce/TaxRulesEditor';
import QuotePreviewSimulator from '../src/components/commerce/QuotePreviewSimulator';
import { commerceGovernanceService } from '../src/services/commerceGovernanceService';
import type { TaxRule, CommerceConfigurationVersion, QuotePreviewResponse } from '../src/types/commerceGovernance';

const sampleTaxRules: TaxRule[] = [
  {
    ruleId: 'tax_rule_ae_standard',
    priority: 100,
    destinationCountry: 'AE',
    destinationSubdivision: 'Dubai',
    taxType: 'VAT',
    taxTreatment: 'exclusive',
    taxableBasis: 'subtotal',
    taxRateNumerator: 500,
    taxRateDenominator: 10000,
    dutyRateNumerator: 500,
    dutyRateDenominator: 10000,
    roundingMode: 'HALF_UP',
    roundingScope: 'subtotal',
    incoterm: 'DDP',
    customsDutyDeMinimisExact: { amountMinor: '80000', currency: 'USD', exponent: 2 },
    importTaxDeMinimisExact: { amountMinor: '15000', currency: 'USD', exponent: 2 },
    deMinimisBasis: 'CUSTOMS_VALUE',
    deMinimisComparison: 'LTE',
    customsValueIncludesShipping: true,
    customsValueIncludesInsurance: false,
    dutyRefundPolicy: 'NON_REFUNDABLE',
    taxRefundPolicy: 'REFUNDABLE',
    providerType: 'MANUAL_GOVERNED',
    providerReference: '',
    sourceAuthority: 'Federal Tax Authority (FTA)',
    sourceReference: 'UAE VAT Law Decree 8/2017',
    verificationStatus: 'VERIFIED_LEGAL_RULE',
    requiresTax: true,
    requiresDuty: true,
    enabled: true,
  },
  {
    ruleId: 'tax_rule_us_dap',
    priority: 90,
    destinationCountry: 'US',
    destinationSubdivision: 'CA',
    taxType: 'SALES_TAX',
    taxTreatment: 'exclusive',
    taxableBasis: 'subtotal_shipping',
    taxRateNumerator: 825,
    taxRateDenominator: 10000,
    dutyRateNumerator: 300,
    dutyRateDenominator: 10000,
    roundingMode: 'HALF_UP',
    roundingScope: 'subtotal',
    incoterm: 'DAP',
    customsDutyDeMinimisExact: { amountMinor: '80000', currency: 'USD', exponent: 2 },
    importTaxDeMinimisExact: { amountMinor: '80000', currency: 'USD', exponent: 2 },
    deMinimisBasis: 'CUSTOMS_VALUE',
    deMinimisComparison: 'LTE',
    customsValueIncludesShipping: false,
    customsValueIncludesInsurance: false,
    dutyRefundPolicy: 'NON_REFUNDABLE',
    taxRefundPolicy: 'REFUNDABLE',
    providerType: 'MANUAL_GOVERNED',
    providerReference: '',
    sourceAuthority: 'California CDTFA',
    sourceReference: 'CA Rev & Tax Code',
    verificationStatus: 'VERIFIED_LEGAL_RULE',
    requiresTax: true,
    requiresDuty: true,
    enabled: true,
  },
];

const mockVersion: CommerceConfigurationVersion = {
  _id: 'v_mock_tax_4',
  version: 4,
  merchantScopeId: 'default',
  status: 'active',
  lockVersion: 1,
  merchantProfile: {
    merchantCountry: 'PK',
    sellingMode: 'international',
    baseCurrency: 'PKR',
    defaultCurrency: 'USD',
    enabledCurrencies: ['PKR', 'USD', 'AED'],
    enabledCountries: ['PK', 'AE', 'US'],
    fulfillmentOrigins: [
      {
        originId: 'orig_1',
        name: 'Karachi HQ',
        country: 'PK',
        city: 'Karachi',
        timeZone: 'Asia/Karachi',
        isDefault: true,
      },
    ],
    supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
  },
  shippingRules: [
    {
      ruleId: 'ship_rule_1',
      name: 'Standard Cargo',
      serviceCode: 'standard',
      displayName: 'Standard Shipping',
      originCountry: 'PK',
      destinationCountry: 'AE',
      currency: 'AED',
      baseRateExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
      deliveryMinDays: 3,
      deliveryMaxDays: 5,
      enabled: true,
    },
  ],
  taxRules: sampleTaxRules,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Phase 6D-4D: Admin Tax Rules Editor DOM Tests', () => {
  it('renders configured tax rules with badges for country, rate, incoterm, and verification status', () => {
    const handleChange = vi.fn();
    render(<TaxRulesEditor rules={sampleTaxRules} onChange={handleChange} />);

    expect(screen.getByText('Exact Rational Tax & Customs Rules')).toBeInTheDocument();
    expect(screen.getByText('AE')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('Incoterm: DDP')).toBeInTheDocument();
    expect(screen.getByText('Incoterm: DAP')).toBeInTheDocument();
    expect(screen.getAllByText('Legal Verified').length).toBe(2);
  });

  it('allows clicking Edit to expand full policy fieldsets and update values', () => {
    const handleChange = vi.fn();
    render(<TaxRulesEditor rules={sampleTaxRules} onChange={handleChange} />);

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    // Check that jurisdiction and rate controls are displayed
    expect(screen.getByText('Jurisdiction & Classification')).toBeInTheDocument();
    expect(screen.getByText('Rational Rates & Valuation Basis')).toBeInTheDocument();
    expect(screen.getByText('De-Minimis Thresholds & Basis Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Refund Governance & Legal Provenance')).toBeInTheDocument();

    const authorityInput = screen.getByDisplayValue('Federal Tax Authority (FTA)');
    fireEvent.change(authorityInput, { target: { value: 'Updated Legal Authority' } });

    expect(handleChange).toHaveBeenCalled();
  });

  it('allows adding a new tax rule and deleting an existing rule', () => {
    const handleChange = vi.fn();
    render(<TaxRulesEditor rules={sampleTaxRules} onChange={handleChange} />);

    const addBtn = screen.getByRole('button', { name: /Add Tax & Customs Rule/i });
    fireEvent.click(addBtn);

    expect(handleChange).toHaveBeenCalled();
    const addedRules = handleChange.mock.calls[0][0];
    expect(addedRules.length).toBe(3);
    expect(addedRules[2].destinationCountry).toBe('AE');
  });

  it('renders deMinimis basis dropdown with exact backend values (Goods value, Customs value, CIF) and updates rule to literal CIF on selection, omitting CIF_VALUE and SUBTOTAL', () => {
    const handleChange = vi.fn();
    render(<TaxRulesEditor rules={sampleTaxRules} onChange={handleChange} />);

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    // Query the select element displaying "Customs value" for sampleTaxRules[0] (CUSTOMS_VALUE)
    const basisSelect = screen.getByDisplayValue('Customs value');
    expect(basisSelect).toBeInTheDocument();

    const options = Array.from(basisSelect.querySelectorAll('option')).map((opt) => ({
      value: opt.value,
      text: opt.textContent,
    }));

    // Check exact values and human readable text
    expect(options).toEqual([
      { value: '', text: 'None (No de-minimis evaluated)' },
      { value: 'GOODS_VALUE', text: 'Goods value' },
      { value: 'CUSTOMS_VALUE', text: 'Customs value' },
      { value: 'CIF', text: 'CIF — goods, shipping and insurance' },
    ]);

    // Check invalid options are strictly absent
    expect(options.some((o) => o.value === 'CIF_VALUE')).toBe(false);
    expect(options.some((o) => o.value === 'SUBTOTAL')).toBe(false);

    // Select CIF and verify onChange is called with literal 'CIF'
    fireEvent.change(basisSelect, { target: { value: 'CIF' } });

    expect(handleChange).toHaveBeenCalled();
    const updatedRules = handleChange.mock.calls[0][0];
    expect(updatedRules[0].deMinimisBasis).toBe('CIF');
    // Other fields remain unchanged
    expect(updatedRules[0].destinationCountry).toBe('AE');
    expect(updatedRules[0].incoterm).toBe('DDP');
  });
});

describe('Phase 6D-4D: Admin Quote Preview Simulator DOM Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders simulation form with country, currency, price, and run simulation button', () => {
    render(<QuotePreviewSimulator version={mockVersion} />);

    expect(screen.getByText('Read-Only Quote Simulation (Preview)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination Country/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Presentment Currency/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Read-Only Simulation/i })).toBeInTheDocument();
  });

  it('displays complete landed cost, tax, duties, and de-minimis breakdown when simulation returns DDP response', async () => {
    const mockResponse: QuotePreviewResponse = {
      previewVersion: 4,
      previewStatus: 'active',
      merchantScopeId: 'default',
      destinationCountry: 'AE',
      currency: 'AED',
      incoterm: 'DDP',
      serviceability: true,
      items: [
        {
          itemIndex: 0,
          name: 'Simulation Preview Item',
          quantity: 1,
          unitPrice: 200,
          unitPriceExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
          lineTotal: 200,
          lineTotalExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
          weightGrams: 500,
        },
      ],
      taxesAndDuties: {
        taxType: 'VAT',
        taxTreatment: 'exclusive',
        taxableBasis: 'subtotal',
        taxRatePercent: 5,
        taxAmount: 10,
        taxAmountExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        additionalTaxAmountExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        taxIncludedAmountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        dutyRatePercent: 5,
        estimatedDutyExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        payableDutyExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        goodsValueExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
        customsValueExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
        cifValueExact: { amountMinor: '22000', currency: 'AED', exponent: 2 },
        dutyDeMinimis: {
          configured: true,
          exempt: false,
          basisType: 'CUSTOMS_VALUE',
          basisAmountExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
          thresholdExact: { amountMinor: '30000', currency: 'AED', exponent: 2 },
          reasonCode: 'ABOVE_DE_MINIMIS_THRESHOLD',
        },
        incoterm: 'DDP',
        provenance: {
          ruleId: 'tax_rule_ae_standard',
          sourceAuthority: 'Federal Tax Authority (FTA)',
          sourceReference: 'UAE VAT Law',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          dutyRefundPolicy: 'NON_REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
        },
      },
      totals: {
        subtotal: 200,
        subtotalExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
        shipping: 20,
        shippingExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
        tax: 10,
        taxExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        taxType: 'VAT',
        duties: 10,
        dutiesExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        landedCostExact: { amountMinor: '24000', currency: 'AED', exponent: 2 },
        grandTotal: 240,
        grandTotalExact: { amountMinor: '24000', currency: 'AED', exponent: 2 },
      },
      appliedRules: {
        shippingRuleId: 'ship_rule_1',
        taxRuleId: 'tax_rule_ae_standard',
        taxSourceReference: 'UAE VAT Law',
        taxVerificationStatus: 'VERIFIED_LEGAL_RULE',
      },
      deliveryEstimate: { minDays: 3, maxDays: 5 },
    };

    vi.spyOn(commerceGovernanceService, 'previewQuote').mockResolvedValueOnce(mockResponse);

    render(<QuotePreviewSimulator version={mockVersion} />);

    const runBtn = screen.getByRole('button', { name: /Run Read-Only Simulation/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Authoritative Landed Cost Breakdown/i)).toBeInTheDocument();
      expect(screen.getByText('Incoterm: DDP')).toBeInTheDocument();
      expect(screen.getAllByText('AED 240.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Duty applicable')).toBeInTheDocument();
    });
  });

  it('renders configured CIF de-minimis decision with exempt status correctly', async () => {
    const mockCifResponse: QuotePreviewResponse = {
      previewVersion: 4,
      previewStatus: 'active',
      merchantScopeId: 'default',
      destinationCountry: 'GB',
      currency: 'GBP',
      incoterm: 'DDP',
      serviceability: true,
      items: [
        {
          itemIndex: 0,
          name: 'CIF Item Preview',
          quantity: 1,
          unitPrice: 100,
          unitPriceExact: { amountMinor: '10000', currency: 'GBP', exponent: 2 },
          lineTotal: 100,
          lineTotalExact: { amountMinor: '10000', currency: 'GBP', exponent: 2 },
          weightGrams: 500,
        },
      ],
      taxesAndDuties: {
        taxType: 'VAT',
        taxTreatment: 'exclusive',
        taxableBasis: 'cif',
        taxRatePercent: 20,
        taxAmount: 0,
        dutyRatePercent: 0,
        dutyDeMinimis: {
          configured: true,
          exempt: true,
          basisType: 'CIF',
          basisAmountExact: { amountMinor: '10000', currency: 'GBP', exponent: 2 },
          thresholdExact: { amountMinor: '13500', currency: 'GBP', exponent: 2 },
          comparison: 'LTE',
          reasonCode: 'DE_MINIMIS_EXEMPT',
        },
        taxDeMinimis: {
          configured: true,
          exempt: false,
          basisType: 'CIF',
          basisAmountExact: { amountMinor: '10000', currency: 'GBP', exponent: 2 },
          thresholdExact: { amountMinor: '5000', currency: 'GBP', exponent: 2 },
          comparison: 'LTE',
          reasonCode: 'ABOVE_DE_MINIMIS_THRESHOLD',
        },
        incoterm: 'DDP',
      },
      totals: {
        subtotal: 100,
        subtotalExact: { amountMinor: '10000', currency: 'GBP', exponent: 2 },
        shipping: 0,
        tax: 0,
        taxType: 'VAT',
        duties: 0,
        grandTotal: 100,
        grandTotalExact: { amountMinor: '10000', currency: 'GBP', exponent: 2 },
      },
      appliedRules: {
        shippingRuleId: null,
        taxRuleId: 'tax_rule_cif',
        taxSourceReference: 'UK VAT Act 1994',
        taxVerificationStatus: 'VERIFIED_LEGAL_RULE',
      },
      deliveryEstimate: { minDays: 3, maxDays: 5 },
    };

    vi.spyOn(commerceGovernanceService, 'previewQuote').mockResolvedValueOnce(mockCifResponse);

    render(<QuotePreviewSimulator version={mockVersion} />);

    const runBtn = screen.getByRole('button', { name: /Run Read-Only Simulation/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('Exempt')).toBeInTheDocument();
      expect(screen.getByText('Tax applicable')).toBeInTheDocument();
      expect(screen.getAllByText('CIF').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Reason: DE_MINIMIS_EXEMPT')).toBeInTheDocument();
      expect(screen.getByText('Reason: ABOVE_DE_MINIMIS_THRESHOLD')).toBeInTheDocument();
    });
  });

  it('renders "Not configured" for unconfigured decisions without claiming duty or tax applicability', async () => {
    const mockUnconfiguredResponse: QuotePreviewResponse = {
      previewVersion: 4,
      previewStatus: 'active',
      merchantScopeId: 'default',
      destinationCountry: 'US',
      currency: 'USD',
      incoterm: 'DAP',
      serviceability: true,
      items: [],
      taxesAndDuties: {
        taxType: 'SALES_TAX',
        dutyDeMinimis: {
          configured: false,
          exempt: false,
          reasonCode: 'NO_THRESHOLD_CONFIGURED',
        },
        taxDeMinimis: {
          configured: false,
          exempt: false,
          reasonCode: 'NO_THRESHOLD_CONFIGURED',
        },
        incoterm: 'DAP',
      },
      totals: {
        subtotal: 50,
        shipping: 0,
        tax: 0,
        taxType: 'SALES_TAX',
        duties: 0,
        grandTotal: 50,
      },
      appliedRules: {
        shippingRuleId: null,
        taxRuleId: 'tax_rule_us_dap',
        taxSourceReference: 'CA Tax Code',
        taxVerificationStatus: 'VERIFIED_LEGAL_RULE',
      },
      deliveryEstimate: { minDays: 2, maxDays: 4 },
    };

    vi.spyOn(commerceGovernanceService, 'previewQuote').mockResolvedValueOnce(mockUnconfiguredResponse);

    render(<QuotePreviewSimulator version={mockVersion} />);

    const runBtn = screen.getByRole('button', { name: /Run Read-Only Simulation/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      // Both duty and tax de-minimis must display "Not configured"
      expect(screen.getAllByText('Not configured').length).toBe(2);
      // Invariant: must not say applicable or exempt when not configured
      expect(screen.queryByText(/Duty applicable/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tax applicable/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Exempt$/i)).not.toBeInTheDocument();
      expect(screen.getAllByText('Reason: NO_THRESHOLD_CONFIGURED').length).toBe(2);
    });
  });

  it('renders "Unavailable" when a de-minimis decision is null/missing', async () => {
    const mockNullDecisionResponse: QuotePreviewResponse = {
      previewVersion: 4,
      previewStatus: 'active',
      merchantScopeId: 'default',
      destinationCountry: 'US',
      currency: 'USD',
      incoterm: 'DAP',
      serviceability: true,
      items: [],
      taxesAndDuties: {
        taxType: 'SALES_TAX',
        dutyDeMinimis: null,
        taxDeMinimis: {
          configured: false,
          exempt: false,
          reasonCode: 'NO_THRESHOLD_CONFIGURED',
        },
        incoterm: 'DAP',
      },
      totals: {
        subtotal: 50,
        shipping: 0,
        tax: 0,
        taxType: 'SALES_TAX',
        duties: 0,
        grandTotal: 50,
      },
      appliedRules: {
        shippingRuleId: null,
        taxRuleId: 'tax_rule_us_dap',
        taxSourceReference: 'CA Tax Code',
        taxVerificationStatus: 'VERIFIED_LEGAL_RULE',
      },
      deliveryEstimate: { minDays: 2, maxDays: 4 },
    };

    vi.spyOn(commerceGovernanceService, 'previewQuote').mockResolvedValueOnce(mockNullDecisionResponse);

    render(<QuotePreviewSimulator version={mockVersion} />);

    const runBtn = screen.getByRole('button', { name: /Run Read-Only Simulation/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      expect(screen.getByText('No duty de-minimis evaluation available')).toBeInTheDocument();
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });
  });
});
