/**
 * @file registerAndProfile.dom.test.tsx
 * @description Real-DOM behavior tests for customer registration, residence country enforcement,
 * and profile completion flows.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from '../src/app/register/page';
import AccountPage from '../src/app/account/page';
import CheckoutPage from '../src/app/checkout/page';
import type { User } from '../src/store/authStore';
import { accountService } from '../src/services/account.service';

// Mock next/navigation
const pushMock = vi.fn();
const replaceMock = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock next/image
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// Mock authStore
const mockRegister = vi.fn();
const mockUpdateUser = vi.fn();
const mockAuthState = {
  isAuthenticated: false,
  isInitialized: true,
  user: null as User | null,
  bootstrap: vi.fn().mockResolvedValue(undefined),
  register: mockRegister,
  updateUser: mockUpdateUser,
};

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => mockAuthState,
}));

// Mock cartStore
vi.mock('@/store/cartStore', () => ({
  useCartStore: () => ({
    items: [
      {
        productId: '60c72b2f9b1d8b2bad000001',
        name: 'Organic Almonds',
        price: 1500,
        quantity: 1,
      },
    ],
    clearCart: vi.fn(),
  }),
}));

const { mockMarketConfig, mockQuote } = vi.hoisted(() => {
  const mockMarketConfig = {
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

  const mockQuote = {
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
        name: 'Organic Almonds',
        quantity: 1,
        unitPrice: 1500,
        lineTotal: 1500,
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
          displayName: 'Standard Courier',
          carrierName: 'TCS',
          isDefault: true,
          freeShippingApplied: false,
          deliveryEstimate: { minDays: 2, maxDays: 4 },
        },
      ],
    },
    totals: {
      subtotal: 1500,
      subtotalExact: { amountMinor: '150000', currency: 'PKR', exponent: 2 },
      discount: 0,
      discountExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
      shipping: 250,
      shippingExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
      tax: 0,
      taxExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
      duties: 0,
      dutiesExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
      grandTotal: 1750,
      grandTotalExact: { amountMinor: '175000', currency: 'PKR', exponent: 2 },
    },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    signature: 'valid-sig-123',
  };

  return { mockMarketConfig, mockQuote };
});

vi.mock('@/lib/checkoutService', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/checkoutService');
  return {
    ...actual,
    fetchMarketConfig: vi.fn().mockResolvedValue(mockMarketConfig),
    fetchCheckoutQuote: vi.fn().mockResolvedValue(mockQuote),
    getOrCreateCheckoutAttempt: vi.fn().mockReturnValue({ id: 'att-1', idempotencyKey: 'idem-1' }),
    clearCheckoutAttempt: vi.fn(),
    detectMaterialQuoteChange: vi.fn().mockReturnValue({ hasMaterialChange: false }),
    submitOrder: vi.fn(),
  };
});

vi.mock('@/services/payment.service', () => ({
  paymentService: {
    getAvailableMethods: vi.fn().mockResolvedValue([
      { id: 'cod', name: 'Cash on Delivery', isEnabled: true, eligibleCurrencies: ['PKR'] },
    ]),
  },
}));

describe('Frontend Registration & Profile Residence Country Real-DOM Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockAuthState = {
      isAuthenticated: false,
      isInitialized: true,
      user: null,
      bootstrap: vi.fn().mockResolvedValue(undefined),
      register: mockRegister,
      updateUser: mockUpdateUser,
    };
  });

  describe('Registration Form Behavior', () => {
    it('renders with no country preselected by default', () => {
      render(<RegisterPage />);
      const select = screen.getByLabelText(/Country of Residence/i) as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(select.value).toBe('');
    });

    it('validates that country of residence is required when submitting empty', async () => {
      render(<RegisterPage />);

      fireEvent.change(screen.getByPlaceholderText(/Ahmed Khan/i), { target: { value: 'Jane Doe' } });
      fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'jane@example.com' } });
      fireEvent.change(screen.getByPlaceholderText(/Minimum 12 characters/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.change(screen.getByPlaceholderText(/Confirm your password/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.click(screen.getByRole('checkbox'));

      fireEvent.submit(screen.getByRole('button', { name: /Create Account/i }));

      await waitFor(() => {
        expect(screen.getByText(/Country of residence is required/i)).toBeInTheDocument();
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('submits selected canonical country in register payload', async () => {
      mockRegister.mockResolvedValueOnce({
        success: true,
        requiresEmailVerification: false,
        message: 'Account created successfully',
      });

      render(<RegisterPage />);

      fireEvent.change(screen.getByPlaceholderText(/Ahmed Khan/i), { target: { value: 'Jane Doe' } });
      fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'jane@example.com' } });
      fireEvent.change(screen.getByLabelText(/Country of Residence/i), { target: { value: 'GB' } });
      fireEvent.change(screen.getByPlaceholderText(/Minimum 12 characters/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.change(screen.getByPlaceholderText(/Confirm your password/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.click(screen.getByRole('checkbox'));

      fireEvent.submit(screen.getByRole('button', { name: /Create Account/i }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          expect.objectContaining({
            fullName: 'Jane Doe',
            email: 'jane@example.com',
            residenceCountry: 'GB',
            password: 'P@ssw0rd!X9#K7',
          })
        );
      });
    });

    it('displays backend error safely if register returns failure', async () => {
      mockRegister.mockResolvedValueOnce({
        success: false,
        code: 'INVALID_RESIDENCE_COUNTRY',
        message: 'Invalid residence country selection',
      });

      render(<RegisterPage />);

      fireEvent.change(screen.getByPlaceholderText(/Ahmed Khan/i), { target: { value: 'Jane Doe' } });
      fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'jane@example.com' } });
      fireEvent.change(screen.getByLabelText(/Country of Residence/i), { target: { value: 'US' } });
      fireEvent.change(screen.getByPlaceholderText(/Minimum 12 characters/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.change(screen.getByPlaceholderText(/Confirm your password/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.click(screen.getByRole('checkbox'));

      fireEvent.submit(screen.getByRole('button', { name: /Create Account/i }));

      await waitFor(() => {
        const errorMatches = screen.getAllByText(/Invalid residence country selection/i);
        expect(errorMatches.length).toBeGreaterThan(0);
      });
    });

    it('ensures proper accessible labeling and keyboard interaction for country select', () => {
      render(<RegisterPage />);
      const select = screen.getByRole('combobox', { name: /Country of Residence/i });
      expect(select).toBeInTheDocument();
      expect(select).toHaveAttribute('id', 'reg-residenceCountry');

      fireEvent.focus(select);
      fireEvent.change(select, { target: { value: 'AE' } });
      expect((select as HTMLSelectElement).value).toBe('AE');
    });

    it('renders email verification pending state preserving registration flow', async () => {
      mockRegister.mockResolvedValueOnce({
        success: true,
        requiresEmailVerification: true,
        emailDeliveryFailed: false,
        message: 'Verification link sent to your email',
      });

      render(<RegisterPage />);

      fireEvent.change(screen.getByPlaceholderText(/Ahmed Khan/i), { target: { value: 'Jane Doe' } });
      fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'jane@example.com' } });
      fireEvent.change(screen.getByLabelText(/Country of Residence/i), { target: { value: 'GB' } });
      fireEvent.change(screen.getByPlaceholderText(/Minimum 12 characters/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.change(screen.getByPlaceholderText(/Confirm your password/i), { target: { value: 'P@ssw0rd!X9#K7' } });
      fireEvent.click(screen.getByRole('checkbox'));

      fireEvent.submit(screen.getByRole('button', { name: /Create Account/i }));

      await waitFor(() => {
        expect(screen.getByText(/Check Your Email/i)).toBeInTheDocument();
      });
    });
  });

  describe('Profile Completion & Checkout Warnings', () => {
    it('displays countryless user profile completion alert in Account page', async () => {
      mockAuthState.isAuthenticated = true;
      mockAuthState.user = {
        id: 'u1',
        fullName: 'Legacy User',
        email: 'legacy@example.com',
        residenceCountry: null,
        isCountryComplete: false,
      };

      vi.spyOn(accountService, 'profile').mockResolvedValueOnce({
        profile: {
          id: 'u1',
          fullName: 'Legacy User',
          email: 'legacy@example.com',
          residenceCountry: null,
          isCountryComplete: false,
          isVerified: true,
        },
      });

      render(<AccountPage />);

      await waitFor(() => {
        expect(screen.getByText(/Profile Incomplete/i)).toBeInTheDocument();
        expect(screen.getByText(/Please select and save your/i)).toBeInTheDocument();
      });
    });

    it('displays residence country required alert on checkout page for countryless user', async () => {
      mockAuthState.isAuthenticated = true;
      mockAuthState.user = {
        id: 'u1',
        fullName: 'Countryless Shopper',
        email: 'shopper@example.com',
        residenceCountry: null,
        isCountryComplete: false,
      };

      render(<CheckoutPage />);

      await waitFor(() => {
        expect(screen.getByText(/Residence Country Required/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Complete Profile/i })).toHaveAttribute(
          'href',
          '/account?tab=profile&redirect=/checkout'
        );
      });
    });
  });
});
