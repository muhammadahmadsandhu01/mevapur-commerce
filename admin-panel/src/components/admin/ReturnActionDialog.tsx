'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Loader, X } from 'lucide-react';
import type { ReturnWorkflowAction } from '@/lib/returnWorkflow';

interface ReturnActionDialogProps {
  action: ReturnWorkflowAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}

export default function ReturnActionDialog({
  action,
  busy,
  onCancel,
  onConfirm
}: ReturnActionDialogProps) {
  const [note, setNote] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const initialTarget = action.requiresNote ? noteRef.current : closeButtonRef.current;
    initialTarget?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [action.requiresNote, busy, onCancel]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (action.requiresNote && !trimmedNote) {
      setValidationMessage('An operational note is required.');
      noteRef.current?.focus();
      return;
    }
    onConfirm(trimmedNote);
  };

  const confirmationStyle = action.tone === 'danger'
    ? { backgroundColor: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger-text)' }
    : action.tone === 'warning'
      ? { backgroundColor: 'var(--accent)', color: 'var(--brand-navy)' }
      : { backgroundColor: 'var(--accent)', color: 'var(--brand-navy)' };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backgroundColor: 'rgba(11, 19, 43, 0.65)'
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-action-title"
        aria-describedby="return-action-description"
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 16,
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--card-bg)',
          padding: 24,
          boxShadow: '0 24px 60px rgba(11, 19, 43, 0.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2
              id="return-action-title"
              style={{ color: 'var(--text-primary)', fontSize: 21, marginBottom: 8 }}
            >
              {action.title}
            </h2>
            <p
              id="return-action-description"
              style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
            >
              {action.description}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close confirmation"
            onClick={onCancel}
            disabled={busy}
            style={{
              alignSelf: 'flex-start',
              border: 0,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            <X size={22} />
          </button>
        </div>

        <label
          htmlFor="return-action-note"
          style={{ display: 'grid', gap: 8, marginTop: 20, color: 'var(--text-primary)' }}
        >
          Operational note{action.requiresNote ? ' (required)' : ' (optional)'}
          <textarea
            ref={noteRef}
            id="return-action-note"
            required={action.requiresNote}
            maxLength={500}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setValidationMessage('');
            }}
            disabled={busy}
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              padding: 12,
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)'
            }}
          />
        </label>
        {validationMessage && (
          <p role="alert" style={{ color: 'var(--danger-text)', marginTop: 8 }}>
            {validationMessage}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            marginTop: 24,
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '11px 18px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 700
            }}
          >
            Keep current state
          </button>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            style={{
              ...confirmationStyle,
              padding: '11px 18px',
              borderRadius: 10,
              border: 0,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {busy && <Loader size={16} className="animate-spin" />}
            Confirm {action.label.toLowerCase()}
          </button>
        </div>
      </form>
    </div>
  );
}
