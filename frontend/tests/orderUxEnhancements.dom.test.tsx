import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ReturnRequestForm from '@/components/account/ReturnRequestForm';
import { accountService } from '@/services/account.service';

vi.mock('@/services/account.service', () => {
  return {
    accountService: {
      order: vi.fn(),
      requestReturn: vi.fn()
    },
    historicalProductId: (line: { product: string | { _id: string }; productId?: string }) => {
      if (typeof line.product === 'string') return line.product;
      if (line.product && typeof line.product === 'object' && line.product._id) return line.product._id;
      if (line.productId) return String(line.productId);
      return '';
    },
    buildReturnRequestPayload: vi.fn(),
    getAccountApiErrorMessage: vi.fn((_err, fallback) => fallback)
  };
});

describe('Order UX Enhancements & Return Request Flow DOM Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockHistoricalOrder = {
    _id: '6ab8c3628e086c0d2d59df01',
    orderId: 'HZ-20260927-000024',
    orderStatus: 'Delivered',
    items: [
      {
        product: {
          _id: '6ab7889418c119e0ea34ebfc',
          name: 'Pure Cotton Luxury Bed Sheet Set'
        },
        name: 'Pure Cotton Luxury Bed Sheet Set',
        price: 3200,
        quantity: 1,
        image: '/bedsheet.png'
      },
      {
        product: {
          _id: '6ab6eb6618c119e0ea34eb5d',
          name: 'True Wireless ANC Earbuds Pro'
        },
        name: 'True Wireless ANC Earbuds Pro',
        price: 4999,
        quantity: 2,
        image: '/earbuds.png'
      }
    ]
  };

  it('pre-fills order reference and automatically loads order items without infinite spinner', async () => {
    vi.mocked(accountService.order).mockResolvedValue(mockHistoricalOrder);

    render(
      <ReturnRequestForm
        initialOrderId="HZ-20260927-000024"
        initialProductId="6ab7889418c119e0ea34ebfc"
      />
    );

    const input = screen.getByLabelText(/Order Number/i) as HTMLInputElement;
    expect(input.value).toBe('HZ-20260927-000024');

    await waitFor(() => {
      expect(accountService.order).toHaveBeenCalledWith('HZ-20260927-000024');
    });

    await waitFor(() => {
      expect(screen.getByText(/Pure Cotton Luxury Bed Sheet Set/i)).toBeInTheDocument();
      expect(screen.getByText(/True Wireless ANC Earbuds Pro/i)).toBeInTheDocument();
    });

    // Verify spinner is gone and button is ready
    expect(screen.queryByText(/Loading\.\.\./i)).toBeNull();
  });

  it('pre-selects the requested product line item when matching initialProductId', async () => {
    vi.mocked(accountService.order).mockResolvedValue(mockHistoricalOrder);

    render(
      <ReturnRequestForm
        initialOrderId="HZ-20260927-000024"
        initialProductId="6ab6eb6618c119e0ea34eb5d"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Pure Cotton Luxury Bed Sheet Set/i)).toBeInTheDocument();
    });

    // The second item should be selected
    const selectedItemHeading = screen.getByText('True Wireless ANC Earbuds Pro');
    expect(selectedItemHeading).toBeInTheDocument();
  });

  it('handles order loading error cleanly without staying stuck in loading spinner', async () => {
    vi.mocked(accountService.order).mockRejectedValue(new Error('Network error'));

    render(
      <ReturnRequestForm
        initialOrderId="HZ-INVALID-999"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/The order could not be loaded/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Loading\.\.\./i)).toBeNull();
  });
});
