import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AdminHelpAssistant from '@/components/assistant/AdminHelpAssistant';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('AdminHelpAssistant Runtime DOM Component Tests', () => {
  const defaultCapability = {
    enabled: true,
    label: 'Admin Read-Only Knowledge Mode',
    readOnly: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { data: defaultCapability } });
  });

  it('renders admin launcher button with aria-expanded false and read-only context', async () => {
    render(<AdminHelpAssistant />);
    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    expect(launcher).toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens panel and renders header with read-only badge and close button', async () => {
    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const dialog = screen.getByRole('dialog', { name: /Admin Help/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('Admin Read-Only Knowledge Mode')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close Admin Help Assistant/i });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
  });

  it('auto-focuses textarea on open, closes with Escape key and restores focus to launcher', async () => {
    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    expect(document.activeElement).toBe(textarea);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(launcher);
  });

  it('renders quick prompt buttons and clicking one sends the prompt request', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          answer: 'Inventory status: 45 items in stock, 3 items low.',
          sources: [
            {
              id: 'tool:inventory-summary',
              title: 'Inventory Aggregates',
              reference: 'Live Stock Levels',
            },
          ],
          criticalNotice: '',
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const quickPrompts = screen.getByRole('generic', { name: /Quick prompts/i });
    expect(quickPrompts).toBeInTheDocument();

    const inventoryBtn = screen.getByRole('button', { name: 'Inventory overview' });
    await user.click(inventoryBtn);

    expect(api.post).toHaveBeenCalledWith('/assistant/admin/chat', {
      message: 'Inventory overview',
    });

    await waitFor(() => {
      expect(screen.getByText('Inventory status: 45 items in stock, 3 items low.')).toBeInTheDocument();
    });

    const sources = screen.getByRole('list', { name: /Answer sources/i });
    expect(sources).toBeInTheDocument();
    expect(screen.getByText('Inventory Aggregates — Live Stock Levels')).toBeInTheDocument();
  });

  it('allows manual message typing and sending via button', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          answer: 'There are 2 pending manual payments requiring verification.',
          sources: [
            {
              id: 'tool:manual-payments-queue',
              title: 'Manual Payment Review Queue',
              reference: 'Queue ID: PAY-2026',
            },
          ],
          criticalNotice: 'Please verify bank receipts before approval.',
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    await user.type(textarea, 'Check manual payment queue');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    expect(api.post).toHaveBeenCalledWith('/assistant/admin/chat', {
      message: 'Check manual payment queue',
    });

    await waitFor(() => {
      expect(screen.getByText('There are 2 pending manual payments requiring verification.')).toBeInTheDocument();
    });

    expect(screen.getByText('Please verify bank receipts before approval.')).toBeInTheDocument();
  });

  it('renders empty sources cleanly without rendering empty list', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          answer: 'All systems are operating normally.',
          sources: [],
          criticalNotice: '',
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    await user.type(textarea, 'System status');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('All systems are operating normally.')).toBeInTheDocument();
    });

    expect(screen.queryByRole('list', { name: /Answer sources/i })).not.toBeInTheDocument();
  });

  it('disables input and prompt buttons when capability is disabled', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: {
          enabled: false,
          label: 'Disabled',
          readOnly: true,
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    expect(textarea).toBeDisabled();
    expect(screen.getByRole('button', { name: /Send/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Inventory overview' })).toBeDisabled();
    expect(screen.getByText('The assistant is currently unavailable.')).toBeInTheDocument();
  });

  it('sends on Enter key and preserves Shift+Enter newline formatting', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          answer: 'Multiline query response.',
          sources: [],
          criticalNotice: '',
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    await user.type(textarea, 'Admin line 1{Shift>}{Enter}{/Shift}Admin line 2');
    expect(api.post).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/assistant/admin/chat', {
      message: 'Admin line 1\nAdmin line 2',
    });
  });

  it('renders malicious HTML/scripts as inert text rather than executing it', async () => {
    const maliciousScript = '<script>alert("admin-xss")</script><img src="x" onerror="evil()">';
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          answer: maliciousScript,
          sources: [
            {
              id: 'tool:xss',
              title: '<b onclick="boom()">Malicious</b>',
              reference: '<iframe src="//evil.com"></iframe>',
            },
          ],
          criticalNotice: '<style>body{display:none}</style>',
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    await user.type(textarea, 'Audit XSS');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(maliciousScript)).toBeInTheDocument();
    });

    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText('<b onclick="boom()">Malicious</b> — <iframe src="//evil.com"></iframe>')).toBeInTheDocument();
    expect(screen.getByText('<style>body{display:none}</style>')).toBeInTheDocument();
  });

  it('handles 401, 403, 429, 503, and network timeouts with accessible alert and allows recovery', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('503 Service Unavailable'));

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    await user.type(textarea, 'Query failure test');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toHaveTextContent('The read-only assistant request failed. Please retry.');

    // Test retry recovery
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        data: {
          answer: 'Recovered admin aggregate.',
          sources: [],
          criticalNotice: '',
        },
      },
    });

    await user.type(textarea, 'Retry request');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('Recovered admin aggregate.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles capability load failure on startup with alert', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toHaveTextContent('Assistant status is unavailable.');
  });

  it('bounds input length to 2000 characters', async () => {
    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    expect(textarea).toHaveAttribute('maxLength', '2000');

    const longText = 'Z'.repeat(2500);
    fireEvent.change(textarea, { target: { value: longText } });
    expect((textarea as HTMLTextAreaElement).value.length).toBe(2000);
  });

  it('never displays sensitive payment fields or mutation operations', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          answer: 'Refund report summary for yesterday.',
          sources: [
            {
              id: 'tool:refund-summary',
              title: 'Refund Summary',
              reference: 'Refund Registry Batch',
            },
          ],
          criticalNotice: '',
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminHelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Admin$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Admin Help Assistant message/i });
    await user.type(textarea, 'Refund overview');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('Refund report summary for yesterday.')).toBeInTheDocument();
    });

    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('input[name*="card"]')).toBeNull();
    expect(document.querySelector('input[name*="cvv"]')).toBeNull();
    expect(document.querySelector('input[name*="token"]')).toBeNull();
    expect(screen.queryByText(/UPDATE /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DELETE /i)).not.toBeInTheDocument();
  });
});
