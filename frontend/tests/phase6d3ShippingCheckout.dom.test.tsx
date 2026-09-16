/**
 * @file phase6d3ShippingCheckout.dom.test.tsx
 * @description Real-DOM vitest suite for Phase 6D-3 Storefront Multi-Service Shipping Selection.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from '../src/app/checkout/page';
import * as checkoutService from '../src/lib/checkoutService';
import { paymentService } from '../src/services/payment.service';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    isInitialized: true,
    user: { fullName: 'Hamad Al-Maktoum', email: 'hamad@example.com', residenceCountry: 'AE', isCountryComplete: true },
    bootstrap: vi.fn().mockResolvedValue(undefined),
  }),
}));

const sampleItems = [
  {
    productId: '60c72b2f9b1d8b2bad000001',
    id: '60c72b2f9b1d8b2bad000001',
    name: 'Organic Premium Almonds',
    price: 100,
    quantity: 1,
    image: '/images/almonds.jpg',
  },
];

vi.mock('@/store/cartStore', () => ({
  useCartStore: () => ({
    items: sampleItems,
    clearCart: vi.fn(),
  }),
}));

const mockMarketConfig: checkoutService.MarketConfigResponse = {
  configVersionId: 'v1',
  merchantCountry: 'PK',
  homeCountry: 'PK',
  sellingMode: 'hybrid',
  enabledCountries: ['PK', 'AE'],
  defaultCurrency: 'AED',
  enabledCurrencies: ['AED', 'PKR'],
  isEnabled: true,
};

const mockQuote: checkoutService.AuthoritativeQuote = {
  kid: 'v2',
  quoteId: 'QUO-20260916-999999',
  merchantScopeId: 'default',
  configVersionId: 'v1',
  merchantCountry: 'PK',
  fulfillmentOriginCountry: 'PK',
  isDomestic: false,
  incoterm: 'DDP',
  destination: {
    fullName: 'Hamad Al-Maktoum',
    address: 'Sheikh Zayed Road 14',
    city: 'Dubai',
    province: 'Dubai',
    postalCode: '00000',
    countryCode: 'AE',
    country: 'United Arab Emirates',
    phone: '+971501234567',
  },
  currency: 'AED',
  items: [
    {
      productId: '60c72b2f9b1d8b2bad000001',
      name: 'Organic Premium Almonds',
      quantity: 1,
      unitPrice: 100,
      unitPriceExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
      lineTotal: 100,
      lineTotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
    },
  ],
  itemsHash: 'hash-p6d3',
  shipping: {
    selectedOption: {
      serviceLevel: 'standard',
      zoneId: 'GOV-SHIP-AE-STD',
      zoneName: 'Aramex UAE Ground',
      amount: 35,
      amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
      freeShippingApplied: false,
      isRemote: false,
      deliveryEstimate: { minDays: 3, maxDays: 6 },
    },
    availableOptions: [
      {
        serviceLevel: 'standard',
        amount: 35,
        amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        deliveryEstimate: { minDays: 3, maxDays: 6 },
      },
      {
        serviceLevel: 'express',
        amount: 70,
        amountExact: { amountMinor: '7000', currency: 'AED', exponent: 2 },
        deliveryEstimate: { minDays: 1, maxDays: 3 },
      },
    ],
  },
  taxesAndDuties: {
    taxType: 'VAT',
    taxRatePercent: 5,
    taxAmount: 6.75,
    taxAmountExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
    dutyRatePercent: 5,
    dutyAmount: 6.75,
    dutyAmountExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
    incoterm: 'DDP',
    provenance: 'UAE FTA',
  },
  totals: {
    subtotal: 100,
    subtotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
    discount: 0,
    discountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
    shipping: 35,
    shippingExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
    tax: 6.75,
    taxExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
    duties: 6.75,
    dutiesExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
    grandTotal: 148.5,
    grandTotalExact: { amountMinor: '14850', currency: 'AED', exponent: 2 },
  },
  eligiblePaymentMethods: [
    { code: 'stripe', displayName: 'Credit / Debit Card (Stripe)', paymentType: 'online', isPrepaid: true },
  ],
};

describe('Phase 6D-3 Storefront Multi-Service Shipping Selection DOM Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(checkoutService, 'fetchMarketConfig').mockResolvedValue(mockMarketConfig);
    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: mockQuote }
    } as any);
    vi.spyOn(paymentService, 'getAvailableMethods').mockResolvedValue([
      { code: 'stripe', displayName: 'Credit / Debit Card (Stripe)', paymentType: 'online' } as any,
    ]);
  });

  it('1.1 renders multi-service shipping options from authoritative quote', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    // Populate required fields
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/STANDARD Delivery/i)).toBeInTheDocument();
      expect(screen.getByText(/EXPRESS Delivery/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText('AED 35.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AED 70.00')).toBeInTheDocument();
  });

  it('1.2 allows switching between shipping service levels', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/EXPRESS Delivery/i)).toBeInTheDocument();
    });

    const expressRadio = screen.getByRole('radio', { name: /EXPRESS Delivery/i });
    fireEvent.click(expressRadio);

    expect(expressRadio).toBeChecked();
  });
});
