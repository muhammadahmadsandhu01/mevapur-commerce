import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FormFieldProps {
  label: string;
  id?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  id: customId,
  error,
  hint,
  required = false,
  children,
  className = '',
  style = {}
}) => {
  const generatedId = useId();
  const inputId = customId || `field-${generatedId}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;

  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div style={{ marginBottom: '16px', ...style }} className={className}>
      <label
        htmlFor={inputId}
        style={{
          display: 'block',
          fontSize: '13.5px',
          fontWeight: '600',
          color: 'var(--text-primary, #111827)',
          marginBottom: '6px'
        }}
      >
        {label} {required && <span style={{ color: '#DC2626' }} aria-hidden="true">*</span>}
      </label>

      {children({
        id: inputId,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy
      })}

      {hint && !error && (
        <p
          id={hintId}
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary, #6B7280)',
            marginTop: '4px',
            marginBottom: 0
          }}
        >
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          style={{
            fontSize: '12px',
            color: '#DC2626',
            marginTop: '4px',
            marginBottom: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <AlertCircle size={13} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
