'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';
import styles from './HelpAssistant.module.css';
import { branding } from '@/config/branding';

interface Capability {
  enabled: boolean;
  mode: 'disabled' | 'retrieval' | 'provider';
  label: string;
  providerActive: boolean;
  readOnly: boolean;
}

interface Source {
  id: string;
  title: string;
  reference: string;
  kind: 'knowledge' | 'tool';
}

interface ChatResponse {
  label: string;
  answer: string;
  sources: Source[];
  criticalNotice: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  notice?: string;
}

const HIDDEN_PATHS = ['/checkout', '/payment-result'];

export default function HelpAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    api.get('/assistant/capabilities')
      .then((response) => {
        if (active) setCapability(response.data.data as Capability);
      })
      .catch(() => {
        if (active) setError('Help Assistant status is unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (HIDDEN_PATHS.some((path) => pathname.startsWith(path))) return null;

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
      const response = await api.post('/assistant/chat', {
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
      setError('The help request could not be completed. Please retry.');
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
          aria-labelledby="help-assistant-title"
        >
          <header className={styles.header}>
            <div>
              <h2 id="help-assistant-title" className={styles.title}>
                {branding.siteName} Help
              </h2>
              <span className={styles.mode}>
                {capability?.label || 'Checking availability'}
              </span>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label="Close Help Assistant"
            >
              ×
            </button>
          </header>

          <div
            className={styles.messages}
            aria-live="polite"
            aria-busy={loading}
          >
            {messages.length === 0 && (
              <div className={`${styles.message} ${styles.assistant}`}>
                {capability?.enabled
                  ? `${branding.tagline} Ask about available products, navigation, shipping, payment methods, or your own account status.`
                  : 'Help Assistant is currently unavailable.'}
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${
                  message.role === 'user' ? styles.user : styles.assistant
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
            {loading && (
              <div className={`${styles.message} ${styles.assistant}`}>
                Searching approved sources…
              </div>
            )}
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
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
              placeholder="Ask a help question"
              aria-label="Help Assistant message"
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
        ref={launcherRef}
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? 'help-assistant-title' : undefined}
      >
        {branding.siteName} Help
      </button>
    </>
  );
}
