/**
 * @file phase6d4TaxCheckout.dom.test.tsx
 * @description Real-DOM vitest suite for Phase 6D-4D Storefront Tax, Customs, and Order Snapshot integration.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from '../src/app/checkout/page';
import * as checkoutService from '../src/lib/checkoutService';
import { paymentService } from '../src/services/payment.service';
import type { AuthoritativeQuote } from '../src/types/commerce';

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
    user: { fullName: 'Muhammad Ahmad', email: 'ahmad@example.com', residenceCountry: 'AE' },
    bootstrap: vi.fn().mockResolvedValue(undefined),
  }),
}));

const sampleCartItems = [
  {
    productId: 'prod_walnuts_1',
    id: 'prod_walnuts_1',
    name: 'Kashmiri Organic Walnuts 1kg',
    price: 150,
    quantity: 1,
    image: '/images/walnuts.jpg',
  },
];

vi.mock('@/store/cartStore', () => ({
  useCartStore: () => ({
    items: sampleCartItems,
    clearCart: vi.fn(),
  }),
}));

const mockMarketConfig: checkoutService.MarketConfigResponse = {
  configVersionId: 'v4',
  merchantCountry: 'PK',
  homeCountry: 'PK',
  sellingMode: 'international',
  enabledCountries: ['PK', 'AE', 'US'],
  baseCurrency: 'PKR',
  defaultCurrency: 'AED',
  enabledCurrencies: ['AED', 'PKR', 'USD'],
  defaultLocale: 'en-US',
  defaultTimeZone: 'Asia/Karachi',
  fulfillmentOriginCountry: 'PK',
  returnDestinationCountry: 'PK',
  supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
  rolloutMode: 'strict',
  isEnabled: true,
};

const createMockQuote = (overrides?: Partial<AuthoritativeQuote>): AuthoritativeQuote => ({
  kid: 'key_gov_1',
  quoteId: 'QUO-20260918-9988',
  merchantScopeId: 'default',
  configVersionId: 'v4',
  merchantCountry: 'PK',
  fulfillmentOriginCountry: 'PK',
  isDomestic: false,
  incoterm: 'DDP',
  destination: {
    fullName: 'Muhammad Ahmad',
    address: 'Sheikh Zayed Road',
    city: 'Dubai',
    province: 'Dubai',
    countryCode: 'AE',
    country: 'United Arab Emirates',
    phone: '+971501234567',
  },
  currency: 'AED',
  items: [
    {
      productId: 'prod_walnuts_1',
      name: 'Kashmiri Organic Walnuts 1kg',
      quantity: 1,
      unitPrice: 150,
      unitPriceExact: { amountMinor: '15000', currency: 'AED', exponent: 2 },
      lineTotal: 150,
      lineTotalExact: { amountMinor: '15000', currency: 'AED', exponent: 2 },
    },
  ],
  itemsHash: 'items_hash_123',
  coupon: null,
  shipping: {
    selectedOption: {
      serviceLevel: 'standard',
      displayName: 'Emirates Express Cargo',
      amount: 25,
      amountExact: { amountMinor: '2500', currency: 'AED', exponent: 2 },
      freeShippingApplied: false,
    },
    availableOptions: [
      {
        serviceLevel: 'standard',
        displayName: 'Emirates Express Cargo',
        amount: 25,
        amountExact: { amountMinor: '2500', currency: 'AED', exponent: 2 },
      },
    ],
  },
  taxesAndDuties: {
    taxType: 'VAT',
    taxTreatment: 'exclusive',
    taxRatePercent: 5,
    taxAmount: 7.5,
    taxAmountExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
    additionalTaxAmountExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
    dutyRatePercent: 5,
    dutyAmount: 7.5,
    dutyAmountExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
    payableDutyExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
    incoterm: 'DDP',
    provenance: 'rule_ae_1',
  },
  totals: {
    subtotal: 150,
    subtotalExact: { amountMinor: '15000', currency: 'AED', exponent: 2 },
    discount: 0,
    discountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
    shipping: 25,
    shippingExact: { amountMinor: '2500', currency: 'AED', exponent: 2 },
    tax: 7.5,
    taxExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
    additionalTaxExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
    duties: 7.5,
    dutiesExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
    grandTotal: 190,
    grandTotalExact: { amountMinor: '19000', currency: 'AED', exponent: 2 },
  },
  eligiblePaymentMethods: [
    {
      code: 'stripe',
      displayName: 'Credit / Debit Card',
      paymentType: 'automated',
      isPrepaid: true,
    },
  ],
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  quoteToken: 'token_ddp_valid',
  ...overrides,
});

describe('Phase 6D-4D: Storefront Checkout DOM Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(checkoutService, 'fetchMarketConfig').mockResolvedValue(mockMarketConfig);
    vi.spyOn(paymentService, 'getAvailableMethods').mockResolvedValue([
      {
        code: 'stripe',
        displayName: 'Credit / Debit Card',
        paymentType: 'online',
        capabilities: {},
        metadata: {},
      },
    ]);
  });

  const populateForm = async () => {
    await waitFor(() => {
      expect(screen.getByText(/Global Checkout/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Destination Market \/ Country/i), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Muhammad Ahmad' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+971501234567' } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: 'Sheikh Zayed Road' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Dubai' } });
  };

  it('renders DDP quote breakdown with prepaid customs duties included in total payable', async () => {
    const mockQuote = createMockQuote();

    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: mockQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);

    render(<CheckoutPage />);
    await populateForm();

    await waitFor(() => {
      expect(screen.getAllByText('AED 150.00').length).toBeGreaterThanOrEqual(1); // Subtotal
      expect(screen.getAllByText('AED 25.00').length).toBeGreaterThanOrEqual(1); // Shipping
      expect(screen.getAllByText('AED 7.50').length).toBeGreaterThanOrEqual(2); // Tax and Duty
      expect(screen.getByText('AED 190.00')).toBeInTheDocument(); // Grand total
      expect(screen.getByText(/Incoterm DDP:/i)).toBeInTheDocument();
      expect(screen.getByText(/All import taxes and customs duties are fully prepaid/i)).toBeInTheDocument();
    });
  });

  it('renders DAP quote breakdown with estimated duties excluded from checkout total and courier notice', async () => {
    const dapQuote = createMockQuote({
      incoterm: 'DAP',
      taxesAndDuties: {
        taxType: 'VAT',
        taxTreatment: 'exclusive',
        taxRatePercent: 5,
        taxAmount: 7.5,
        taxAmountExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        additionalTaxAmountExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        dutyRatePercent: 5,
        dutyAmount: 0,
        dutyAmountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        estimatedDutyExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        payableDutyExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        incoterm: 'DAP',
      },
      totals: {
        subtotal: 150,
        subtotalExact: { amountMinor: '15000', currency: 'AED', exponent: 2 },
        discount: 0,
        discountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        shipping: 25,
        shippingExact: { amountMinor: '2500', currency: 'AED', exponent: 2 },
        tax: 7.5,
        taxExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        additionalTaxExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        duties: 0,
        dutiesExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        estimatedDutiesExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        landedCostExact: { amountMinor: '19000', currency: 'AED', exponent: 2 },
        grandTotal: 182.5,
        grandTotalExact: { amountMinor: '18250', currency: 'AED', exponent: 2 },
      },
    });

    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: dapQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);

    render(<CheckoutPage />);
    await populateForm();

    await waitFor(() => {
      expect(screen.getByText('Estimated Import Duty (DAP)')).toBeInTheDocument();
      expect(screen.getByText(/Collected upon delivery by carrier/i)).toBeInTheDocument();
      expect(screen.getByText('AED 182.50')).toBeInTheDocument(); // Pay now total excludes DAP duty
      expect(screen.getByText('Estimated Total Landed Cost')).toBeInTheDocument();
      expect(screen.getByText('AED 190.00')).toBeInTheDocument(); // Full landed cost
    });
  });

  it('renders inclusive tax without adding extra payable fee', async () => {
    const inclusiveQuote = createMockQuote({
      taxesAndDuties: {
        taxType: 'VAT',
        taxTreatment: 'inclusive',
        taxRatePercent: 5,
        taxAmount: 7.14,
        taxAmountExact: { amountMinor: '714', currency: 'AED', exponent: 2 },
        taxIncludedAmountExact: { amountMinor: '714', currency: 'AED', exponent: 2 },
        additionalTaxAmountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        dutyRatePercent: 0,
        dutyAmount: 0,
        dutyAmountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        incoterm: 'DOMESTIC',
      },
      totals: {
        subtotal: 150,
        subtotalExact: { amountMinor: '15000', currency: 'AED', exponent: 2 },
        discount: 0,
        discountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        shipping: 25,
        shippingExact: { amountMinor: '2500', currency: 'AED', exponent: 2 },
        tax: 7.14,
        taxExact: { amountMinor: '714', currency: 'AED', exponent: 2 },
        taxIncludedExact: { amountMinor: '714', currency: 'AED', exponent: 2 },
        additionalTaxExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        duties: 0,
        dutiesExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        grandTotal: 175,
        grandTotalExact: { amountMinor: '17500', currency: 'AED', exponent: 2 },
      },
    });

    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: inclusiveQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);

    render(<CheckoutPage />);
    await populateForm();

    await waitFor(() => {
      expect(screen.getByText(/Taxes \(VAT 5% · Included\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Included in items subtotal · No extra payable tax charge/i)).toBeInTheDocument();
      expect(screen.getByText('AED 175.00')).toBeInTheDocument();
    });
  });

  it('renders de-minimis duty exempt quote without payable customs duties', async () => {
    const deMinimisQuote = createMockQuote({
      dutyDeMinimis: {
        configured: true,
        exempt: true,
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: '15000', currency: 'AED', exponent: 2 },
        thresholdExact: { amountMinor: '30000', currency: 'AED', exponent: 2 },
        comparison: 'LTE',
        reasonCode: 'DE_MINIMIS_EXEMPT',
      },
      taxesAndDuties: {
        taxType: 'VAT',
        taxTreatment: 'exclusive',
        taxRatePercent: 5,
        taxAmount: 7.5,
        taxAmountExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        additionalTaxAmountExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        dutyRatePercent: 0,
        dutyAmount: 0,
        dutyAmountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        incoterm: 'DDP',
      },
      totals: {
        subtotal: 150,
        subtotalExact: { amountMinor: '15000', currency: 'AED', exponent: 2 },
        discount: 0,
        discountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        shipping: 25,
        shippingExact: { amountMinor: '2500', currency: 'AED', exponent: 2 },
        tax: 7.5,
        taxExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        additionalTaxExact: { amountMinor: '750', currency: 'AED', exponent: 2 },
        duties: 0,
        dutiesExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
        grandTotal: 182.5,
        grandTotalExact: { amountMinor: '18250', currency: 'AED', exponent: 2 },
      },
    });

    vi.spyOn(checkoutService, 'fetchCheckoutQuote').mockResolvedValue({
      success: true,
      data: { quote: deMinimisQuote },
    } as unknown as checkoutService.CheckoutQuoteResponse);

    render(<CheckoutPage />);
    await populateForm();

    await waitFor(() => {
      expect(screen.getByText('AED 182.50')).toBeInTheDocument();
      expect(screen.getByText(/Incoterm DDP:/i)).toBeInTheDocument();
    });
  });
});
