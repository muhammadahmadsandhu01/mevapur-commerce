/**
 * @file phase8CustomerRecovery.dom.test.tsx
 * @description Real-DOM test suite for Storefront Customer Recovery Paths,
 * Payment Failure guidance, Shipment Delays, and Document Access.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrderDetailPage from '@/app/orders/[id]/page';
import api from '@/lib/api';

// Mock next/navigation
const pushMock = vi.fn();
const currentParams = { id: 'ORD-REC-8899' };

vi.mock('next/navigation', () => ({
  useParams: () => currentParams,
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/orders/ORD-REC-8899',
}));

// Mock next/image
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock authStore
vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    user: { fullName: 'Ahmad Sandhu', email: 'ahmad@example.com' },
    isAuthenticated: true,
    isInitialized: true,
    bootstrap: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock api
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('Phase 8 — Storefront Customer Recovery DOM Tests', () => {
  const failedOrder = {
    _id: '60c72b2f9b1d8b2bad000001',
    orderId: 'ORD-REC-8899',
    orderStatus: 'Pending',
    paymentStatus: 'Failed',
    paymentMethod: 'card',
    currency: 'PKR',
    subtotal: 5000,
    shippingCost: 200,
    taxAmount: 0,
    totalAmount: 5200,
    createdAt: new Date().toISOString(),
    shippingAddress: {
      fullName: 'Ahmad Sandhu',
      phone: '03001234567',
      address: 'House 123, Street 4',
      city: 'Islamabad',
      country: 'Pakistan',
    },
    items: [
      {
        name: 'Organic Honey 500g',
        price: 5000,
        quantity: 1,
        image: '/images/honey.jpg',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders payment failure recovery banner with clear guidance when paymentStatus is Failed', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: { order: failedOrder } },
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Check payment failure recovery banner is present
    expect(screen.getByTestId('payment-recovery-banner')).toBeInTheDocument();
    expect(screen.getByText(/Payment Unsuccessful/i)).toBeInTheDocument();
    expect(screen.getByText(/We could not complete payment for this order/i)).toBeInTheDocument();

    // Check retry action button is rendered and accessible
    const retryButton = screen.getByRole('button', { name: /Retry Payment/i });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toBeDisabled();
  });

  it('clicking retry button initiates payment retry and directs customer safely', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: { order: failedOrder } },
    });

    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          retry: {
            orderNumber: 'ORD-REC-8899',
            status: 'RETRY_INITIATED',
            message: 'Payment retry session initiated.',
          },
        },
      },
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry Payment/i })).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /Retry Payment/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/account/orders/60c72b2f9b1d8b2bad000001/retry-payment'
      );
    });
  });

  it('renders shipment delay banner when order is delayed', async () => {
    const delayedOrder = {
      ...failedOrder,
      paymentStatus: 'Paid',
      orderStatus: 'Delayed',
    };

    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: { order: delayedOrder } },
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('shipment-exception-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/Shipment Status Update — Delayed/i)).toBeInTheDocument();
    expect(screen.getByText(/Your shipment is experiencing a carrier delay/i)).toBeInTheDocument();
  });

  it('renders accessible document link and details without dead buttons', async () => {
    const paidOrder = {
      ...failedOrder,
      paymentStatus: 'Paid',
      orderStatus: 'Confirmed',
    };

    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: { order: paidOrder } },
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /View Invoice/i })).toBeInTheDocument();
    });

    const invoiceLink = screen.getByRole('link', { name: /View Invoice/i });
    expect(invoiceLink).toHaveAttribute('href', expect.stringContaining('/invoice'));
  });
});
