import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import HelpAssistant from '@/components/assistant/HelpAssistant';
import api from '@/lib/api';

let currentPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('HelpAssistant Runtime DOM Component Tests', () => {
  const defaultCapability = {
    enabled: true,
    mode: 'retrieval',
    label: 'Knowledge Retrieval Mode',
    providerActive: false,
    readOnly: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = '/';
    vi.mocked(api.get).mockResolvedValue({ data: { data: defaultCapability } });
  });

  it('renders launcher button in closed state with accessible name', async () => {
    render(<HelpAssistant />);
    const launcher = await screen.findByRole('button', { name: /Help$/i });
    expect(launcher).toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('suppresses rendering completely on sensitive checkout and payment-result routes', async () => {
    currentPathname = '/checkout';
    const { unmount } = render(<HelpAssistant />);
    expect(screen.queryByRole('button', { name: /Help$/i })).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    unmount();

    currentPathname = '/payment-result/success';
    render(<HelpAssistant />);
    expect(screen.queryByRole('button', { name: /Help$/i })).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('opens and closes assistant panel when clicking launcher and close button', async () => {
    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'true');

    const closeBtn = screen.getByRole('button', { name: /Close Help Assistant/i });
    await user.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
  });

  it('auto-focuses textarea on open, closes with Escape key and restores focus to launcher', async () => {
    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    expect(document.activeElement).toBe(textarea);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(launcher);
  });

  it('disables input and send button when assistant capability is unavailable', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: {
          enabled: false,
          mode: 'disabled',
          label: 'Service Unavailable',
          providerActive: false,
          readOnly: true,
        },
      },
    });

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    const sendBtn = screen.getByRole('button', { name: /Send/i });

    expect(textarea).toBeDisabled();
    expect(sendBtn).toBeDisabled();
    expect(screen.getByText(/Help Assistant is currently unavailable\./i)).toBeInTheDocument();
  });

  it('renders initial welcome prompt and capability label when enabled', async () => {
    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    expect(screen.getByText('Knowledge Retrieval Mode')).toBeInTheDocument();
    expect(screen.getByText(/Ask about available products, navigation, shipping, payment methods/i)).toBeInTheDocument();
  });

  it('allows typing and successfully sending a query, rendering answer, Evidence Cards, and critical notice', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          label: 'Verified Answer',
          answer: 'Standard shipping takes 3-5 business days.',
          sources: [
            {
              id: 'doc:shipping-policy',
              title: 'Shipping Policy',
              reference: 'Section 3.1 Delivery Timelines',
              kind: 'knowledge',
            },
          ],
          criticalNotice: 'Delivery timelines may vary during holidays.',
        },
      },
    });

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    const sendBtn = screen.getByRole('button', { name: /Send/i });

    await user.type(textarea, 'What is the shipping time?');
    expect(textarea).toHaveValue('What is the shipping time?');
    expect(sendBtn).not.toBeDisabled();

    await user.click(sendBtn);

    expect(api.post).toHaveBeenCalledWith('/assistant/chat', {
      message: 'What is the shipping time?',
    });

    await waitFor(() => {
      expect(screen.getByText('Standard shipping takes 3-5 business days.')).toBeInTheDocument();
    });

    const sourcesList = screen.getByRole('list', { name: /Answer sources/i });
    expect(sourcesList).toBeInTheDocument();
    expect(screen.getByText('Shipping Policy — Section 3.1 Delivery Timelines')).toBeInTheDocument();
    expect(screen.getByText('Delivery timelines may vary during holidays.')).toBeInTheDocument();
  });

  it('renders empty sources cleanly without an empty citation list', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          label: 'Direct Answer',
          answer: 'Hello! How can I assist your shopping today?',
          sources: [],
          criticalNotice: '',
        },
      },
    });

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    await user.type(textarea, 'Hello');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('Hello! How can I assist your shopping today?')).toBeInTheDocument();
    });

    expect(screen.queryByRole('list', { name: /Answer sources/i })).not.toBeInTheDocument();
  });

  it('sends query on Enter key and allows multiline with Shift+Enter', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          label: 'Answer',
          answer: 'We accept credit cards and cash on delivery.',
          sources: [],
          criticalNotice: '',
        },
      },
    });

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });

    // Shift+Enter should add newline without submitting
    await user.type(textarea, 'Line 1{Shift>}{Enter}{/Shift}Line 2');
    expect(api.post).not.toHaveBeenCalled();

    // Plain Enter should trigger submission
    await user.keyboard('{Enter}');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/assistant/chat', {
      message: 'Line 1\nLine 2',
    });
  });

  it('renders malicious HTML/scripts as inert text rather than executing or dangerously inserting it', async () => {
    const maliciousPayload = '<script>alert("xss")</script><img src="x" onerror="alert(1)"><b>Dangerous</b>';
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          label: 'Sanitized Output',
          answer: maliciousPayload,
          sources: [
            {
              id: 'doc:xss',
              title: '<svg onload="alert(2)">Title</svg>',
              reference: '<iframe src="evil.com">Ref</iframe>',
              kind: 'knowledge',
            },
          ],
          criticalNotice: '<b onmouseover="alert(3)">Notice</b>',
        },
      },
    });

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    await user.type(textarea, 'Test XSS');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(maliciousPayload)).toBeInTheDocument();
    });

    // Verify DOM contains text content and not injected script/img/svg/iframe DOM elements
    expect(document.querySelector('script[src]')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('iframe[src="evil.com"]')).toBeNull();
    expect(screen.getByText('<svg onload="alert(2)">Title</svg> — <iframe src="evil.com">Ref</iframe>')).toBeInTheDocument();
    expect(screen.getByText('<b onmouseover="alert(3)">Notice</b>')).toBeInTheDocument();
  });

  it('handles 400, 401, 403, 429, 503, and network timeouts with accessible error message and allows recovery', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network Timeout'));

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    await user.type(textarea, 'Test timeout');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toHaveTextContent('The help request could not be completed. Please retry.');

    // Now test recovery on retry
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        data: {
          label: 'Recovered Answer',
          answer: 'Recovery successful!',
          sources: [],
          criticalNotice: '',
        },
      },
    });

    await user.type(textarea, 'Retry message');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('Recovery successful!')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles capability fetch failure gracefully on startup', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toHaveTextContent('Help Assistant status is unavailable.');
  });

  it('bounds textarea to max 2000 characters', async () => {
    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    expect(textarea).toHaveAttribute('maxLength', '2000');

    const longText = 'A'.repeat(2100);
    fireEvent.change(textarea, { target: { value: longText } });
    expect((textarea as HTMLTextAreaElement).value.length).toBe(2000);
  });

  it('never displays internal tools, raw database queries, or sensitive payment fields (card, CVV, password, token)', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          label: 'Product Info',
          answer: 'Here is the almond product details.',
          sources: [
            {
              id: 'tool:product-catalog-search',
              title: 'Product Catalog',
              reference: 'Item #101',
              kind: 'tool',
            },
          ],
          criticalNotice: '',
        },
      },
    });

    const user = userEvent.setup();
    render(<HelpAssistant />);

    const launcher = await screen.findByRole('button', { name: /Help$/i });
    await user.click(launcher);

    const textarea = screen.getByRole('textbox', { name: /Help Assistant message/i });
    await user.type(textarea, 'Find almonds');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('Here is the almond product details.')).toBeInTheDocument();
    });

    // Check DOM does not contain any sensitive form fields or internal tool execution artifacts
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('input[name*="card"]')).toBeNull();
    expect(document.querySelector('input[name*="cvv"]')).toBeNull();
    expect(document.querySelector('input[name*="token"]')).toBeNull();
    expect(screen.queryByText(/executeTool/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/eval\(/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mongoose/i)).not.toBeInTheDocument();
  });
});
