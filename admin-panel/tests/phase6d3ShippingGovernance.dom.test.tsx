/**
 * @file phase6d3ShippingGovernance.dom.test.tsx
 * @description Real-DOM vitest suite for Phase 6D-3 Admin Shipping Governance Components.
 * Covers ShippingRulesEditor, QuotePreviewSimulator, and ShippingPage deprecation notice.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShippingRulesEditor from '../src/components/commerce/ShippingRulesEditor';
import QuotePreviewSimulator from '../src/components/commerce/QuotePreviewSimulator';
import ShippingPage from '../src/app/shipping/page';
import { commerceGovernanceService } from '../src/services/commerceGovernanceService';
import type { ShippingRule, CommerceConfigurationVersion, QuotePreviewResponse } from '../src/types/commerceGovernance';

const sampleRules: ShippingRule[] = [
  {
    ruleId: 'GOV-SHIP-AE-STD',
    name: 'UAE Standard Tracked',
    serviceCode: 'standard_cargo',
    displayName: 'Aramex UAE Ground',
    originCountry: 'PK',
    destinationCountry: 'AE',
    currency: 'AED',
    baseRateExact: {
      amountMinor: '3500',
      currency: 'AED',
      exponent: 2,
    },
    freeShippingThresholdExact: {
      amountMinor: '25000',
      currency: 'AED',
      exponent: 2,
    },
    deliveryMinDays: 3,
    deliveryMaxDays: 6,
    processingCutoffLocal: '15:30',
    workingDays: [1, 2, 3, 4, 5],
    processingMinBusinessDays: 1,
    processingMaxBusinessDays: 2,
    weightBands: [
      {
        minWeightGrams: 0,
        maxWeightGrams: 2000,
        pricingMode: 'REPLACE_BASE',
        rateExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
      },
    ],
    remoteRateExact: {
      amountMinor: '1500',
      currency: 'AED',
      exponent: 2,
    },
    remoteCities: ['Al Dhafra'],
    remotePostalPrefixes: ['99'],
    remoteDeliveryMinDays: 5,
    remoteDeliveryMaxDays: 9,
    enabled: true,
  },
  {
    ruleId: 'GOV-SHIP-GB-EXP',
    name: 'UK Express Air',
    serviceCode: 'express_intl',
    displayName: 'DHL Express UK',
    originCountry: 'PK',
    destinationCountry: 'GB',
    currency: 'GBP',
    baseRateExact: {
      amountMinor: '2500',
      currency: 'GBP',
      exponent: 2,
    },
    deliveryMinDays: 2,
    deliveryMaxDays: 4,
    processingCutoffLocal: '12:00',
    workingDays: [1, 2, 3, 4, 5, 6],
    processingMinBusinessDays: 1,
    processingMaxBusinessDays: 1,
    weightBands: [],
    enabled: true,
  },
];

const mockVersion: CommerceConfigurationVersion = {
  _id: 'v_doc_10',
  version: 10,
  merchantScopeId: 'default',
  status: 'draft',
  lockVersion: 2,
  merchantProfile: {
    merchantCountry: 'PK',
    sellingMode: 'hybrid',
    baseCurrency: 'PKR',
    defaultCurrency: 'PKR',
    enabledCurrencies: ['PKR', 'AED', 'GBP', 'USD'],
    enabledCountries: ['PK', 'AE', 'GB', 'US'],
    fulfillmentOrigins: [],
    supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
  },
  shippingRules: sampleRules,
  taxRules: [],
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
};

describe('Phase 6D-3 Admin Shipping Governance DOM Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders configured shipping rules with arbitrary service codes and exact money', () => {
    const handleChange = vi.fn();
    render(
      <ShippingRulesEditor
        rules={sampleRules}
        defaultCurrency="AED"
        merchantCountry="PK"
        onChange={handleChange}
      />
    );

    expect(screen.getByText('Governed Shipping Rules & Timing')).toBeInTheDocument();
    expect(screen.getByText('UAE Standard Tracked')).toBeInTheDocument();
    expect(screen.getByText('UK Express Air')).toBeInTheDocument();
    expect(screen.getByText('Code: standard_cargo')).toBeInTheDocument();
    expect(screen.getByText('Code: express_intl')).toBeInTheDocument();
    expect(screen.getByText('AED 35.00')).toBeInTheDocument();
    expect(screen.getByText('GBP 25.00')).toBeInTheDocument();
  });

  it('2. Expands rule and supports editing arbitrary service code', () => {
    const handleChange = vi.fn();
    render(
      <ShippingRulesEditor
        rules={sampleRules}
        defaultCurrency="AED"
        merchantCountry="PK"
        onChange={handleChange}
      />
    );

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    const serviceCodeInput = screen.getByLabelText(/Governed Service Code/i);
    expect(serviceCodeInput).toHaveValue('standard_cargo');

    fireEvent.change(serviceCodeInput, { target: { value: 'custom_freight_v2' } });
    expect(handleChange).toHaveBeenCalled();
    const updated = handleChange.mock.calls[0][0];
    expect(updated[0].serviceCode).toBe('custom_freight_v2');
  });

  it('3. Navigates sub-tabs (Timing, Weights, Remote Areas) within expanded rule', () => {
    const handleChange = vi.fn();
    render(
      <ShippingRulesEditor
        rules={sampleRules}
        defaultCurrency="AED"
        merchantCountry="PK"
        onChange={handleChange}
      />
    );

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    // Switch to Cutoff & Timing Promise tab
    fireEvent.click(screen.getByRole('button', { name: /Cutoff & Timing Promise/i }));
    expect(screen.getByLabelText(/Processing Cutoff Local/i)).toHaveValue('15:30');
    expect(screen.getByText(/ISO 1=Mon ... 7=Sun/i)).toBeInTheDocument();

    // Switch to Weight Bands tab
    fireEvent.click(screen.getByRole('button', { name: /Weight Bands/i }));
    expect(screen.getByText(/Configure weight-based tiered rates/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Weight Tier/i })).toBeInTheDocument();

    // Switch to Remote Areas tab
    fireEvent.click(screen.getByRole('button', { name: /Remote Areas/i }));
    expect(screen.getByLabelText(/Remote Cities/i)).toHaveValue('Al Dhafra');
    expect(screen.getByLabelText(/Remote Postal Prefixes/i)).toHaveValue('99');
  });

  it('4. Toggling working days triggers onChange update', () => {
    const handleChange = vi.fn();
    render(
      <ShippingRulesEditor
        rules={sampleRules}
        defaultCurrency="AED"
        merchantCountry="PK"
        onChange={handleChange}
      />
    );

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    fireEvent.click(screen.getByRole('button', { name: /Cutoff & Timing Promise/i }));
    // Click Sat (day 6) to toggle it on
    const satBtn = screen.getByRole('button', { name: 'Sat' });
    fireEvent.click(satBtn);

    expect(handleChange).toHaveBeenCalled();
    const updated = handleChange.mock.calls[0][0];
    expect(updated[0].workingDays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('5. Renders validation errors when cutoff format or bounds are invalid', () => {
    const invalidRule: ShippingRule = {
      ...sampleRules[0],
      processingCutoffLocal: '25:99', // Invalid time
      deliveryMinDays: 10,
      deliveryMaxDays: 4, // Max < Min
    };

    const handleChange = vi.fn();
    render(
      <ShippingRulesEditor
        rules={[invalidRule]}
        defaultCurrency="AED"
        merchantCountry="PK"
        onChange={handleChange}
      />
    );

    expect(screen.getByText(/issues?/i)).toBeInTheDocument();

    const editButton = screen.getByRole('button', { name: /Edit/i });
    fireEvent.click(editButton);

    expect(screen.getByText(/Processing cutoff must strictly follow HH:mm format/i)).toBeInTheDocument();
    expect(screen.getByText(/Max delivery days \(4\) cannot be less than min delivery days \(10\)/i)).toBeInTheDocument();
  });

  it('6. QuotePreviewSimulator runs simulation and displays split fulfillment groups', async () => {
    const mockPreviewResponse: QuotePreviewResponse = {
      previewVersion: 10,
      previewStatus: 'draft',
      merchantScopeId: 'default',
      destinationCountry: 'AE',
      currency: 'AED',
      incoterm: 'DAP',
      items: [
        {
          itemIndex: 0,
          name: 'Gourmet Almonds',
          unitPrice: 100,
          lineTotal: 200,
          lineTotalExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
          quantity: 2,
          weightGrams: 1000,
        },
      ],
      totals: {
        subtotal: 200,
        subtotalExact: { amountMinor: '20000', currency: 'AED', exponent: 2 },
        shipping: 35,
        shippingExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        tax: 10,
        taxExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        taxType: 'VAT',
        duties: 0,
        dutiesExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        grandTotal: 245,
        grandTotalExact: { amountMinor: '24500', currency: 'AED', exponent: 2 },
      },
      appliedRules: {
        shippingRuleId: 'GOV-SHIP-AE-STD',
        taxRuleId: 'TAX-AE-VAT',
        taxSourceReference: 'UAE Decree 8/2017',
        taxVerificationStatus: 'VERIFIED_LEGAL_RULE',
      },
      deliveryEstimate: { minDays: 3, maxDays: 6 },
      deliveryPromise: {
        promiseText: 'Estimated delivery in 3 to 6 business days',
        dispatchDate: '2026-09-18',
      },
      shipmentGroups: [
        {
          groupId: 'pkg_1',
          originCountry: 'PK',
          locationCode: 'LOC-KHI-01',
          serviceLevel: 'standard_cargo',
          shippingAmount: 20,
          shippingAmountExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
          items: [{ name: 'Item Alpha', quantity: 1 }],
        },
        {
          groupId: 'pkg_2',
          originCountry: 'PK',
          locationCode: 'LOC-LHE-01',
          serviceLevel: 'standard_cargo',
          shippingAmount: 15,
          shippingAmountExact: { amountMinor: '1500', currency: 'AED', exponent: 2 },
          items: [{ name: 'Item Beta', quantity: 1 }],
        },
      ],
    };

    vi.spyOn(commerceGovernanceService, 'previewQuote').mockResolvedValue(mockPreviewResponse);

    render(<QuotePreviewSimulator version={mockVersion} />);

    expect(screen.getByText('Read-Only Quote Simulation (Preview)')).toBeInTheDocument();

    const simBtn = screen.getByRole('button', { name: /Run Read-Only Simulation/i });
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulation Result for AE \(AED\)/i)).toBeInTheDocument();
      expect(screen.getByText('AED 245.00')).toBeInTheDocument();
      expect(screen.getByText('GOV-SHIP-AE-STD')).toBeInTheDocument();
      expect(screen.getByText(/Split Fulfillment \(2 Packages\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Package 1 \(PK\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Package 2 \(PK\)/i)).toBeInTheDocument();
    });
  });

  it('7. Legacy shipping page renders deprecation notice with link to Commerce Governance', () => {
    render(<ShippingPage />);

    expect(screen.getByText('Legacy Shipping Zones Authority Retired')).toBeInTheDocument();
    expect(screen.getByText(/The legacy mutable Shipping Zones system has been retired/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open Commerce Governance/i });
    expect(link).toHaveAttribute('href', '/commerce');
    expect(screen.getByText(/Immutable Governance Active/i)).toBeInTheDocument();
  });
});
