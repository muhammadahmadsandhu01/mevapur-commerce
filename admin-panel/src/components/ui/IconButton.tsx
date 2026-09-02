import React from 'react';
import { Loader2 } from 'lucide-react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string; // Enforce accessible name
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  'aria-label': ariaLabel,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  disabled = false,
  className = '',
  style = {},
  type = 'button',
  ...props
}) => {
  const dimension = size === 'sm' ? '36px' : size === 'lg' ? '48px' : '42px';

  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: dimension,
    height: dimension,
    minWidth: dimension,
    minHeight: dimension,
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 0.15s ease-in-out',
    outline: 'none',
    padding: 0,
    ...style
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#FF8A00',
      color: '#0B132B',
      borderColor: '#FF8A00'
    },
    secondary: {
      backgroundColor: 'var(--card-bg, #FFFFFF)',
      color: 'var(--text-primary, #111827)',
      borderColor: 'var(--border-color, #E5E7EB)'
    },
    danger: {
      backgroundColor: '#FEE2E2',
      color: '#DC2626',
      borderColor: '#FCA5A5'
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-primary, #111827)',
      borderColor: 'transparent'
    }
  };

  return (
    <button
      type={type}
      aria-label={ariaLabel}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      style={{ ...baseStyles, ...(variantStyles[variant] || variantStyles.ghost) }}
      className={`admin-ui-icon-btn focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin" size={size === 'sm' ? 16 : 18} aria-hidden="true" />
      ) : (
        icon
      )}
    </button>
  );
};
