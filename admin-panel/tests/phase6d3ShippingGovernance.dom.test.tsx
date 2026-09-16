/**
 * @file phase6d3ShippingGovernance.dom.test.tsx
 * @description Real-DOM vitest suite for Phase 6D-3 Admin Shipping Rules Editor.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShippingRulesEditor from '../src/components/commerce/ShippingRulesEditor';
import type { ShippingRule } from '../src/types/commerceGovernance';

const sampleRules: ShippingRule[] = [
  {
    ruleId: 'GOV-SHIP-AE-STD',
    name: 'UAE Standard Tracked',
    serviceCode: 'standard',
    displayName: 'Aramex UAE Ground',
    originCountry: 'PK',
    destinationCountry: 'AE',
    currency: 'AED',
    baseRateExact: {
      amountMinor: '3500',
      currency: 'AED',
      exponent: 2,
    },
    deliveryMinDays: 3,
    deliveryMaxDays: 6,
    weightBands: [],
    enabled: true,
  },
  {
    ruleId: 'GOV-SHIP-GB-STD',
    name: 'UK Standard Tracked',
    serviceCode: 'standard',
    displayName: 'Royal Mail International',
    originCountry: 'PK',
    destinationCountry: 'GB',
    currency: 'GBP',
    baseRateExact: {
      amountMinor: '1500',
      currency: 'GBP',
      exponent: 2,
    },
    deliveryMinDays: 4,
    deliveryMaxDays: 8,
    weightBands: [],
    enabled: true,
  },
];

describe('Phase 6D-3 Admin Shipping Rules Editor DOM Suite', () => {
  it('1.1 renders configured shipping rules correctly', () => {
    const handleChange = vi.fn();
    render(
      <ShippingRulesEditor
        rules={sampleRules}
        defaultCurrency="AED"
        merchantCountry="PK"
        onChange={handleChange}
      />
    );

    expect(screen.getByText('Shipping Rules & Zones')).toBeInTheDocument();
    expect(screen.getByText('UAE Standard Tracked')).toBeInTheDocument();
    expect(screen.getByText('UK Standard Tracked')).toBeInTheDocument();
    expect(screen.getByText('PK → AE')).toBeInTheDocument();
    expect(screen.getByText('PK → GB')).toBeInTheDocument();
  });

  it('1.2 allows adding a new shipping rule', () => {
    const handleChange = vi.fn();
    render(
      <ShippingRulesEditor
        rules={sampleRules}
        defaultCurrency="AED"
        merchantCountry="PK"
        onChange={handleChange}
      />
    );

    const addButton = screen.getByRole('button', { name: /Add Shipping Rule/i });
    fireEvent.click(addButton);

    expect(handleChange).toHaveBeenCalled();
    const updatedRules = handleChange.mock.calls[0][0];
    expect(updatedRules.length).toBe(3);
  });
});
