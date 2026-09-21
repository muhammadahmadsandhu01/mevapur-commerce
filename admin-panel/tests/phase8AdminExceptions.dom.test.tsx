/**
 * @file phase8AdminExceptions.dom.test.tsx
 * @description Real-DOM test suite for Admin Operations Exception Queue Dashboard,
 * metric cards, filtering, modal inspection, and resolution workflow.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExceptionsPage from '../src/app/exceptions/page';
import api from '../src/lib/api';

// Mock next/navigation
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/exceptions',
}));

// Mock api
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('Phase 8 — Admin Operations Exceptions Dashboard DOM Tests', () => {
  const sampleExceptions = [
    {
      _id: '60c72b2f9b1d8b2bad000001',
      exceptionNumber: 'EXP-2026-A1B2C3D4',
      type: 'PAYMENT_FAILED',
      domainType: 'payment',
      domainId: 'PAY-990011',
      severity: 'HIGH',
      status: 'OPEN',
      errorCode: 'CARD_DECLINED',
      sanitizedSummary: 'Card was declined by issuing bank during checkout',
      safeDetails: { networkCode: '05' },
      retryEligible: true,
      attemptCount: 1,
      slaDueAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      customer: { fullName: 'Ali Khan', email: 'ali@example.test' },
      order: { orderId: 'ORD-990011', totalAmount: 4500, paymentMethod: 'card' },
    },
    {
      _id: '60c72b2f9b1d8b2bad000002',
      exceptionNumber: 'EXP-2026-E5F6G7H8',
      type: 'SHIPMENT_DELAYED',
      domainType: 'shipment',
      domainId: 'SHP-882233',
      severity: 'MEDIUM',
      status: 'ACKNOWLEDGED',
      errorCode: 'CARRIER_TRANSIT_DELAY',
      sanitizedSummary: 'Courier tracking indicates severe weather transit delay',
      safeDetails: { carrier: 'TCS' },
      retryEligible: false,
      attemptCount: 0,
      slaDueAt: new Date(Date.now() + 172800000).toISOString(),
      createdAt: new Date().toISOString(),
      customer: { fullName: 'Sara Ahmed', email: 'sara@example.test' },
      order: { orderId: 'ORD-882233', totalAmount: 3200, paymentMethod: 'cod' },
    },
  ];

  const sampleMetrics = {
    openCount: 1,
    acknowledgedCount: 1,
    inProgressCount: 0,
    criticalCount: 0,
    escalatedCount: 0,
    totalOpen: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders operations metrics cards and exception list correctly', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: sampleExceptions,
        metrics: sampleMetrics,
      },
    });

    render(<ExceptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /Customer & Operations Exceptions/i
      );
      expect(screen.getByText('EXP-2026-A1B2C3D4')).toBeInTheDocument();
    });

    // Check metric cards
    expect(screen.getByText(/Total Open/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Check exception rows
    expect(screen.getByText(/Card was declined by issuing bank/i)).toBeInTheDocument();
    expect(screen.getByText('EXP-2026-E5F6G7H8')).toBeInTheDocument();
  });

  it('allows opening exception detail modal and acknowledging an issue', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: sampleExceptions,
        metrics: sampleMetrics,
      },
    });

    render(<ExceptionsPage />);

    await waitFor(() => {
      expect(screen.getByText('EXP-2026-A1B2C3D4')).toBeInTheDocument();
    });

    // Click View Details
    const viewButtons = screen.getAllByRole('button', { name: /^View$/i });
    fireEvent.click(viewButtons[0]);

    // Modal should be open
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /PAYMENT_FAILED/i, level: 2 })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^Acknowledge$/i })).toBeInTheDocument();

    // Mock acknowledge API call
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          exception: {
            ...sampleExceptions[0],
            status: 'ACKNOWLEDGED',
          },
        },
      },
    });

    // Re-mock refresh call
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { ...sampleExceptions[0], status: 'ACKNOWLEDGED' },
          sampleExceptions[1],
        ],
        metrics: sampleMetrics,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Acknowledge$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/admin/exceptions/60c72b2f9b1d8b2bad000001/acknowledge'
      );
    });
  });

  it('allows resolving an issue with audited resolution reason', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: sampleExceptions,
        metrics: sampleMetrics,
      },
    });

    render(<ExceptionsPage />);

    await waitFor(() => {
      expect(screen.getByText('EXP-2026-A1B2C3D4')).toBeInTheDocument();
    });

    // Click View Details
    const viewButtons = screen.getAllByRole('button', { name: /^View$/i });
    fireEvent.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /PAYMENT_FAILED/i, level: 2 })).toBeInTheDocument();
    });

    // Click Resolve Exception button to show resolution input
    const resolveTrigger = screen.getByRole('button', { name: /Resolve Exception/i });
    fireEvent.click(resolveTrigger);

    expect(screen.getByPlaceholderText(/Resolution reason/i)).toBeInTheDocument();

    // Enter resolution reason
    const input = screen.getByPlaceholderText(/Resolution reason/i);
    fireEvent.change(input, {
      target: { value: 'Customer updated billing zip code and retried payment successfully.' },
    });

    // Mock resolve API call
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          exception: {
            ...sampleExceptions[0],
            status: 'RESOLVED',
          },
        },
      },
    });

    // Re-mock refresh call
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        success: true,
        data: [sampleExceptions[1]],
        metrics: { ...sampleMetrics, openCount: 0, totalOpen: 1 },
      },
    });

    // Click Confirm
    const confirmButton = screen.getByRole('button', { name: /^Confirm$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/admin/exceptions/60c72b2f9b1d8b2bad000001/resolve',
        expect.objectContaining({
          resolutionReason: 'Customer updated billing zip code and retried payment successfully.',
        })
      );
    });
  });
});
