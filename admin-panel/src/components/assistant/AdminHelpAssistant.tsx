'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import styles from './AdminHelpAssistant.module.css';
import { branding } from '@/config/branding';

interface Capability {
  enabled: boolean;
  label: string;
  readOnly: boolean;
}

interface Source {
  id: string;
  title: string;
  reference: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  notice?: string;
}

interface ChatResponse {
  answer: string;
  sources: Source[];
  criticalNotice: string;
}

const QUICK_PROMPTS = [
  'Inventory overview',
  'Pending orders',
  'Manual payment queue',
  'Refund overview',
  'Provider availability',
  'System health help',
];

export default function AdminHelpAssistant() {
  const [open, setOpen] = useState(false);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(1);

  useEffect(() => {
    let active = true;
    api.get('/assistant/capabilities')
      .then((response) => {
        if (active) setCapability(response.data.data as Capability);
      })
      .catch(() => {
        if (active) setError('Assistant status is unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);

  const send = async (message: string) => {
    const normalized = message.trim();
    if (!normalized || loading || !capability?.enabled) return;
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: 'user', content: normalized },
    ]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/assistant/admin/chat', {
        message: normalized,
        history: [],
      });
      const result = response.data.data as ChatResponse;
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          notice: result.criticalNotice,
        },
      ]);
    } catch {
      setError('The read-only assistant request failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && (
        <section
          className={styles.panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="admin-assistant-title"
        >
          <header className={styles.header}>
            <div>
              <h2 id="admin-assistant-title" className={styles.title}>
                {branding.siteName} Admin Help
              </h2>
              <div className={styles.badges}>
                <span className={styles.badge}>
                  {capability?.label || 'Checking mode'}
                </span>
                <span className={styles.badge}>Read-only</span>
              </div>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label="Close Admin Help Assistant"
            >
              ×
            </button>
          </header>

          <div className={styles.prompts} aria-label="Quick prompts">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className={styles.prompt}
                onClick={() => void send(prompt)}
                disabled={!capability?.enabled || loading}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div
            className={styles.messages}
            aria-live="polite"
            aria-busy={loading}
          >
            {messages.length === 0 && (
              <div className={styles.message}>
                {capability?.enabled
                  ? `Ask ${branding.siteName} for an approved read-only aggregate or use a quick prompt.`
                  : 'The assistant is currently unavailable.'}
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${
                  message.role === 'user' ? styles.user : ''
                }`}
              >
                {message.content}
                {message.sources && message.sources.length > 0 && (
                  <ul className={styles.sources} aria-label="Answer sources">
                    {message.sources.map((source) => (
                      <li key={source.id}>
                        {source.title} — {source.reference}
                      </li>
                    ))}
                  </ul>
                )}
                {message.notice && (
                  <p className={styles.notice}>{message.notice}</p>
                )}
              </div>
            ))}
            {loading && <div className={styles.message}>Reading approved data…</div>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <textarea
              className={styles.input}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 2000))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              maxLength={2000}
              aria-label="Admin Help Assistant message"
              placeholder="Ask for a read-only summary"
              disabled={!capability?.enabled || loading}
            />
            <button
              type="submit"
              className={styles.send}
              disabled={!input.trim() || !capability?.enabled || loading}
            >
              Send
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {branding.siteName} Admin
      </button>
    </>
  );
}
