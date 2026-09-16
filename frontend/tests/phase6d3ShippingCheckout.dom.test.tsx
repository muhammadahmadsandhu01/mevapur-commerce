/**
 * @file phase6d3ShippingCheckout.dom.test.tsx
 * @description Real-DOM vitest suite for Phase 6D-3 Storefront Multi-Service Shipping Selection & Governed Checkout.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from '../src/app/checkout/page';
import * as checkoutService from '../src/lib/checkoutService';
import { paymentService, type AvailablePaymentMethod } from '../src/services/payment.service';

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
  enabledCountries: ['PK', 'AE', 'SA'],
  defaultCurrency: 'AED',
  enabledCurrencies: ['AED', 'PKR', 'SAR'],
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
      displayName: 'Standard Ground Shipping',
      zoneId: 'GOV-SHIP-AE-STD',
      zoneName: 'Aramex UAE Ground',
      amount: 35,
      amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
      freeShippingApplied: false,
      isRemote: false,
      deliveryEstimate: { minDays: 3, maxDays: 6 },
      deliveryPromise: {
        dispatchDate: '2026-09-18',
        promiseText: 'Estimated delivery September 21 - September 24',
      },
    },
    availableOptions: [
      {
        serviceLevel: 'standard',
        displayName: 'Standard Ground Shipping',
        amount: 35,
        amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        deliveryEstimate: { minDays: 3, maxDays: 6 },
        deliveryPromise: {
          dispatchDate: '2026-09-18',
          promiseText: 'Estimated delivery September 21 - September 24',
        },
      },
      {
        serviceLevel: 'express',
        displayName: 'Express Air Priority',
        amount: 70,
        amountExact: { amountMinor: '7000', currency: 'AED', exponent: 2 },
        deliveryEstimate: { minDays: 1, maxDays: 3 },
        deliveryPromise: {
          dispatchDate: '2026-09-17',
          promiseText: 'Estimated delivery September 18 - September 20',
        },
      },
      {
        serviceLevel: 'priority_cargo',
        displayName: 'Priority Cargo Handling',
        amount: 110,
        amountExact: { amountMinor: '11000', currency: 'AED', exponent: 2 },
        deliveryEstimate: { minDays: 1, maxDays: 2 },
        deliveryPromise: {
          dispatchDate: '2026-09-16',
          promiseText: 'Guaranteed 2-day delivery',
        },
      },
    ],
    shipmentGroups: [
      {
        groupId: 'grp_dxb_01',
        originCountry: 'PK',
        locationCode: 'LHE-FC',
        serviceLevel: 'standard',
        shippingAmount: 35,
        shippingAmountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        deliveryEstimate: { minDays: 3, maxDays: 6 },
        deliveryPromise: {
          dispatchDate: '2026-09-18',
          promiseText: 'Estimated delivery September 21 - September 24',
        },
        items: [
          {
            productId: '60c72b2f9b1d8b2bad000001',
            name: 'Organic Premium Almonds',
            quantity: 1,
          },
        ],
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
  issuedAt: new Date(Date.now() - 60000).toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
  quoteToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validTokenMock',
};

describe('Phase 6D-3 Storefront Multi-Service Shipping Selection DOM Suite', () => {
  const mockMethods: AvailablePaymentMethod[] = [
    {
      code: 'stripe',
      displayName: 'Credit / Debit Card (Stripe)',
      paymentType: 'online',
      capabilities: {},
      metadata: {},
    },
    {
      code: 'cod',
      displayName: 'Cash on Delivery',
      paymentType: 'offline',
      capabilities: {},
      metadata: {},
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(checkoutService, 'fetchMarketConfig').mockResolvedValue(mockMarketConfig);
    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: mockQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);
    vi.spyOn(paymentService, 'getAvailableMethods').mockResolvedValue(mockMethods);
  });

  it('1.1 renders dynamic arbitrary shipping options from authoritative quote', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    // Populate required fields
    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(
      () => {
        expect(screen.getAllByText(/Standard Ground Shipping/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Express Air Priority/i)).toBeInTheDocument();
        expect(screen.getByText(/Priority Cargo Handling/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getAllByText('AED 35.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AED 70.00')).toBeInTheDocument();
    expect(screen.getByText('AED 110.00')).toBeInTheDocument();
  });

  it('1.2 triggers authoritative re-quote when user selects a different service level', async () => {
    const fetchQuoteSpy = vi.spyOn(checkoutService, 'fetchCheckoutQuote');

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/Express Air Priority/i)).toBeInTheDocument();
    });

    const expressRadio = screen.getByRole('radio', { name: /Express Air Priority/i });
    fireEvent.click(expressRadio);

    await waitFor(() => {
      expect(fetchQuoteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          shippingServiceLevel: 'express',
        }),
        undefined
      );
    });
  });

  it('1.3 clears stale quote and blocks order placement on quote error (fail closed)', async () => {
    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockRejectedValue(
      new Error('No authorized fulfillment origin available for this destination.')
    );

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getAllByText(/No authorized fulfillment origin available for this destination/i).length).toBeGreaterThanOrEqual(1);
    });

    const submitBtn = screen.getByRole('button', { name: /Place Order/i });
    expect(submitBtn).toBeDisabled();
  });

  it('1.4 displays split shipment packages separately when multiple groups exist', async () => {
    const multiGroupQuote: checkoutService.AuthoritativeQuote = {
      ...mockQuote,
      shipping: {
        ...mockQuote.shipping,
        shipmentGroups: [
          {
            groupId: 'grp_01',
            originCountry: 'PK',
            locationCode: 'LHE-FC',
            serviceLevel: 'standard',
            shippingAmount: 20,
            shippingAmountExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
            deliveryEstimate: { minDays: 3, maxDays: 5 },
            deliveryPromise: { promiseText: 'Delivery Sep 20 - Sep 22' },
            items: [{ productId: '60c72b2f9b1d8b2bad000001', name: 'Almonds', quantity: 1 }],
          },
          {
            groupId: 'grp_02',
            originCountry: 'AE',
            locationCode: 'DXB-HUB',
            serviceLevel: 'express',
            shippingAmount: 15,
            shippingAmountExact: { amountMinor: '1500', currency: 'AED', exponent: 2 },
            deliveryEstimate: { minDays: 1, maxDays: 2 },
            deliveryPromise: { promiseText: 'Delivery Sep 18 - Sep 19' },
            items: [{ productId: '60c72b2f9b1d8b2bad000002', name: 'Pistachios', quantity: 1 }],
          },
        ],
      },
    };

    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: multiGroupQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/Split Fulfillment \(2 Packages\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Package 1 \(PK\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Package 2 \(AE\)/i)).toBeInTheDocument();
    });

    expect(screen.getByText('AED 20.00')).toBeInTheDocument();
    expect(screen.getByText('AED 15.00')).toBeInTheDocument();
  });

  it('1.5 enforces prepaid requirement and removes COD for cross-border routes', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/Prepaid payment required for this destination/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: /Cash on Delivery/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('radio', { name: /Credit \/ Debit Card \(Stripe\)/i })).toBeInTheDocument();
  });

  it('1.6 proves old token cannot be submitted during in-flight re-quote', async () => {
    const submitOrderSpy = vi.spyOn(checkoutService, 'submitOrder').mockResolvedValue({
      success: true,
      order: { _id: 'ord_123', orderId: 'ORD-123' } as unknown as checkoutService.SubmittedOrderResponse['order'],
    });

    // Let first quote succeed
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/QUO-20260916-999999/i)).toBeInTheDocument();
    });

    // Select Stripe
    const stripeRadio = screen.getByRole('radio', { name: /Credit \/ Debit Card \(Stripe\)/i });
    fireEvent.click(stripeRadio);

    // Make next quote request hang (in-flight re-quote)
    let resolveHangingQuote: ((res: checkoutService.CheckoutQuoteResponse) => void) | undefined;
    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockReturnValue(
      new Promise((resolve) => {
        resolveHangingQuote = resolve;
      })
    );

    // Switch shipping option to trigger re-quote
    const expressRadio = screen.getByRole('radio', { name: /Express Air Priority/i });
    fireEvent.click(expressRadio);

    // Place order button MUST be disabled immediately during in-flight re-quote
    const submitBtn = screen.getByRole('button', { name: /Updating Quote/i });
    expect(submitBtn).toBeDisabled();

    // Verify quoteToken from initial quote cannot be submitted
    fireEvent.submit(submitBtn.closest('form')!);
    expect(submitOrderSpy).not.toHaveBeenCalled();

    // Clean up hanging promise
    resolveHangingQuote?.({
      success: true,
      data: { quote: { ...mockQuote, quoteToken: 'new-valid-token' } },
    });
  });

  it('1.7 proves failed re-quote leaves no usable token and disables place order', async () => {
    const submitOrderSpy = vi.spyOn(checkoutService, 'submitOrder');

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/QUO-20260916-999999/i)).toBeInTheDocument();
    });

    // Mock failure on re-quote
    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockRejectedValue(
      new Error('No governed shipping route available for the specified destination.')
    );

    // Change street address to unserviceable address
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Remote Mountain Route 99' } });

    await waitFor(() => {
      expect(screen.getAllByText(/No governed shipping route available for the specified destination/i).length).toBeGreaterThanOrEqual(1);
    });

    // Button must be disabled and not have the old token
    const submitBtn = screen.getByRole('button', { name: /Place Order/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Pending address/i)).toBeInTheDocument();

    fireEvent.submit(submitBtn.closest('form')!);
    expect(submitOrderSpy).not.toHaveBeenCalled();
  });

  it('1.8 proves address change immediately invalidates old quote before response', async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Hamad Al-Maktoum' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 14' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });

    await waitFor(() => {
      expect(screen.getByText(/QUO-20260916-999999/i)).toBeInTheDocument();
    });

    // Immediately upon modifying address, quote is eradicated
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road 99' } });

    expect(screen.queryByText(/QUO-20260916-999999/i)).not.toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /Place Order/i });
    expect(submitBtn).toBeDisabled();
  });

  it('1.9 proves international re-quote clears selected COD payment method', async () => {
    // Start with a domestic Pakistani quote where COD is eligible
    const domesticQuote: checkoutService.AuthoritativeQuote = {
      ...mockQuote,
      isDomestic: true,
      destination: {
        ...mockQuote.destination,
        countryCode: 'PK',
        country: 'Pakistan',
        city: 'Lahore',
      },
      currency: 'PKR',
      eligiblePaymentMethods: [
        { code: 'cod', displayName: 'Cash on Delivery', paymentType: 'offline', isPrepaid: false },
        { code: 'stripe', displayName: 'Card', paymentType: 'online', isPrepaid: true },
      ],
    };

    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValueOnce({
      success: true,
      data: { quote: domesticQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'PK' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Ahmed Ali' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+923001234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Gulberg III Main Blvd' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Lahore' } });

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Cash on Delivery/i })).toBeInTheDocument();
    });

    // Select COD
    const codRadio = screen.getByRole('radio', { name: /Cash on Delivery/i });
    fireEvent.click(codRadio);
    expect(codRadio).toBeChecked();

    // Now change country to AE (international), and mock international quote without COD
    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValueOnce({
      success: true,
      data: { quote: mockQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);

    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });

    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: /Cash on Delivery/i })).not.toBeInTheDocument();
    });
  });
});
