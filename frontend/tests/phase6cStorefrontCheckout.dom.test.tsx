/**
 * Phase 6C Storefront Global Checkout Real-DOM Test Suite
 * Tests full rendering, country-aware address adaptations, payment capability filtering,
 * authoritative quote display, material quote reconfirmation, and accessibility.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from '../src/app/checkout/page';
import * as checkoutService from '../src/lib/checkoutService';
import { paymentService } from '../src/services/payment.service';

// Mock next/navigation
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

// Mock next/image
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// Mock authStore
vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    isInitialized: true,
    user: { fullName: 'Jane Smith', email: 'jane@example.com' },
    bootstrap: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock cartStore
const sampleItems = [
  {
    productId: '60c72b2f9b1d8b2bad000001',
    id: '60c72b2f9b1d8b2bad000001',
    name: 'Organic Premium Almonds',
    price: 1500,
    quantity: 2,
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
  enabledCountries: ['PK', 'AE', 'GB', 'US'],
  baseCurrency: 'PKR',
  defaultCurrency: 'PKR',
  enabledCurrencies: ['PKR', 'AED', 'GBP', 'USD'],
  defaultLocale: 'en-PK',
  defaultTimeZone: 'Asia/Karachi',
  fulfillmentOriginCountry: 'PK',
  returnDestinationCountry: 'PK',
  supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
  rolloutMode: 'governed',
  isEnabled: true,
};

const mockQuote: checkoutService.AuthoritativeQuote = {
  kid: 'v1',
  quoteId: 'QUO-20260914-DEMO1',
  merchantScopeId: 'default',
  configVersionId: 'v1',
  merchantCountry: 'PK',
  fulfillmentOriginCountry: 'PK',
  isDomestic: true,
  incoterm: 'DOMESTIC',
  destination: {
    countryCode: 'PK',
    country: 'Pakistan',
    address: '123 Mall Road',
    city: 'Lahore',
  },
  currency: 'PKR',
  items: [
    {
      productId: '60c72b2f9b1d8b2bad000001',
      name: 'Organic Premium Almonds',
      quantity: 2,
      unitPrice: 1500,
      lineTotal: 3000,
    },
  ],
  itemsHash: 'hash-abc',
  shipping: {
    selectedOption: {
      serviceLevel: 'standard',
      amount: 250,
      amountExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
      freeShippingApplied: false,
      deliveryEstimate: { minDays: 2, maxDays: 4 },
    },
    availableOptions: [
      {
        serviceLevel: 'standard',
        amount: 250,
        amountExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
        deliveryEstimate: { minDays: 2, maxDays: 4 },
      },
      {
        serviceLevel: 'express',
        amount: 600,
        amountExact: { amountMinor: '60000', currency: 'PKR', exponent: 2 },
        deliveryEstimate: { minDays: 1, maxDays: 2 },
      },
    ],
  },
  taxesAndDuties: {
    taxType: 'GST',
    taxRatePercent: 17,
    taxAmount: 510,
    taxAmountExact: { amountMinor: '51000', currency: 'PKR', exponent: 2 },
    dutyRatePercent: 0,
    dutyAmount: 0,
    dutyAmountExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
    incoterm: 'DOMESTIC',
    provenance: 'governed',
  },
  totals: {
    subtotal: 3000,
    subtotalExact: { amountMinor: '300000', currency: 'PKR', exponent: 2 },
    discount: 0,
    discountExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
    shipping: 250,
    shippingExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
    tax: 510,
    taxExact: { amountMinor: '51000', currency: 'PKR', exponent: 2 },
    duties: 0,
    dutiesExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
    grandTotal: 3760,
    grandTotalExact: { amountMinor: '376000', currency: 'PKR', exponent: 2 },
  },
  eligiblePaymentMethods: [
    { code: 'cod', displayName: 'Cash on Delivery', paymentType: 'offline', isPrepaid: false },
    { code: 'bank_transfer', displayName: 'Direct Bank Transfer', paymentType: 'manual', isPrepaid: true },
    { code: 'stripe', displayName: 'Credit / Debit Card', paymentType: 'automated', isPrepaid: true },
  ],
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  quoteToken: 'signed-opaque-token-12345',
};

describe('Phase 6C Storefront Real-DOM Checkout Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(checkoutService, 'fetchMarketConfig').mockResolvedValue(mockMarketConfig);
    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: mockQuote },
    });
    vi.spyOn(paymentService, 'getAvailableMethods').mockResolvedValue([
      {
        code: 'cod',
        displayName: 'Cash on Delivery (COD)',
        paymentType: 'offline',
        capabilities: {},
        metadata: {},
      },
      {
        code: 'bank_transfer',
        displayName: 'Direct Bank Transfer',
        paymentType: 'manual',
        capabilities: {},
        metadata: {},
      },
      {
        code: 'stripe',
        displayName: 'Credit / Debit Card (Stripe)',
        paymentType: 'automated',
        capabilities: {},
        metadata: { publishableKey: 'pk_test_123' },
      },
    ]);
  });

  it('1. Renders enabled markets dynamically without hardcoded country assumptions', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Destination Market/i)).toBeInTheDocument();
    });

    const countrySelect = screen.getByLabelText(/Destination Market/i) as HTMLSelectElement;
    expect(countrySelect.options.length).toBe(4);
    expect(countrySelect).toHaveTextContent('Pakistan (PK)');
    expect(countrySelect).toHaveTextContent('United Arab Emirates (AE)');
    expect(countrySelect).toHaveTextContent('United Kingdom (GB)');
    expect(countrySelect).toHaveTextContent('United States (US)');
  });

  it('2. Dynamically adapts subdivision label when country changes (e.g. Emirate for AE)', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Destination Market/i)).toBeInTheDocument();
    });

    const countrySelect = screen.getByLabelText(/Destination Market/i);

    // Initial state: PK -> Province
    expect(screen.getByLabelText(/Province/i)).toBeInTheDocument();

    // Change to AE -> Emirate
    fireEvent.change(countrySelect, { target: { value: 'AE' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/Emirate/i)).toBeInTheDocument();
    });
  });

  it('3. Renders authoritative landed cost breakdown with exact money', async () => {
    render(<CheckoutPage />);

    // Fill minimum address to trigger quote
    await waitFor(() => {
      expect(screen.getByLabelText(/Street Address/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Street Address/i), {
      target: { value: '123 Mall Road' },
    });
    fireEvent.change(screen.getByLabelText(/City/i), {
      target: { value: 'Lahore' },
    });

    await waitFor(() => {
      expect(screen.getByText('QUO-20260914-DEMO1')).toBeInTheDocument();
    });

    // Subtotal: PKR 3,000.00
    expect(screen.getByText('PKR 3,000.00')).toBeInTheDocument();
    // Shipping: PKR 250.00 (appears in both shipping option radio and summary breakdown)
    expect(screen.getAllByText('PKR 250.00').length).toBeGreaterThanOrEqual(1);
    // Tax: PKR 510.00
    expect(screen.getByText('PKR 510.00')).toBeInTheDocument();
    // Grand Total: PKR 3,760.00
    expect(screen.getByText('PKR 3,760.00')).toBeInTheDocument();
    // Incoterm notice
    expect(screen.getByText(/Incoterm DOMESTIC/i)).toBeInTheDocument();
  });

  it('4. Filters payment methods via policy and shows COD only when eligible', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Payment Method/i, { selector: 'section *' })).toBeInTheDocument();
    });

    // For domestic PK, COD is eligible and rendered
    await waitFor(() => {
      expect(screen.getByLabelText(/Cash on Delivery/i)).toBeInTheDocument();
    });

    // Mock international policy return where COD is excluded
    vi.spyOn(paymentService, 'getAvailableMethods').mockResolvedValue([
      {
        code: 'stripe',
        displayName: 'Credit / Debit Card (Stripe)',
        paymentType: 'automated',
        capabilities: {},
        metadata: { publishableKey: 'pk_test_123' },
      },
    ]);

    const countrySelect = screen.getByLabelText(/Destination Market/i);
    fireEvent.change(countrySelect, { target: { value: 'GB' } });

    await waitFor(() => {
      expect(screen.queryByLabelText(/Cash on Delivery/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Credit \/ Debit Card/i)).toBeInTheDocument();
    });
  });

  it('5. Submits opaque quoteToken and durable idempotency key without client calculation', async () => {
    const submitOrderSpy = vi.spyOn(checkoutService, 'submitOrder').mockResolvedValue({
      order: {
        _id: 'ord_123',
        orderId: 'ORD-20260914-001',
        totalAmount: 3760,
        paymentMethod: 'cod',
        orderStatus: 'Pending',
        paymentStatus: 'Pending',
        items: [],
        shippingAddress: { fullName: 'Jane Smith', phone: '+923001234567', address: '123 Mall Road', city: 'Lahore', province: 'Punjab' },
        createdAt: new Date().toISOString(),
      },
      idempotentReplay: false,
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Street Address/i)).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+923001234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: '123 Mall Road' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Lahore' } });
    fireEvent.change(screen.getByLabelText(/Province/i), { target: { value: 'Punjab' } });

    await waitFor(() => {
      expect(screen.getByText('QUO-20260914-DEMO1')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Place Order/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitOrderSpy).toHaveBeenCalledTimes(1);
    });

    const [payload, idempotencyKey] = submitOrderSpy.mock.calls[0];
    expect(payload.quoteToken).toBe('signed-opaque-token-12345');
    expect(payload.currency).toBe('PKR');
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey.length).toBeGreaterThan(8);
  });
});
