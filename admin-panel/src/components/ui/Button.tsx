import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className = '',
  style = {},
  type = 'button',
  ...props
}) => {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: '700',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 0.15s ease-in-out',
    outline: 'none',
    fontFamily: 'inherit',
    minHeight: size === 'sm' ? '36px' : size === 'lg' ? '48px' : '42px',
    padding: size === 'sm' ? '6px 12px' : size === 'lg' ? '12px 24px' : '9px 18px',
    fontSize: size === 'sm' ? '13px' : size === 'lg' ? '15px' : '14px',
    ...style
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#FF8A00',
      color: '#0B132B',
      borderColor: '#FF8A00',
      boxShadow: '0 2px 6px rgba(255, 138, 0, 0.2)'
    },
    secondary: {
      backgroundColor: 'var(--card-bg, #FFFFFF)',
      color: 'var(--text-primary, #111827)',
      borderColor: 'var(--border-color, #E5E7EB)'
    },
    danger: {
      backgroundColor: '#DC2626',
      color: '#FFFFFF',
      borderColor: '#DC2626',
      boxShadow: '0 2px 6px rgba(220, 38, 38, 0.2)'
    },
    outline: {
      backgroundColor: 'transparent',
      color: '#FF8A00',
      borderColor: '#FF8A00'
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-primary, #111827)',
      borderColor: 'transparent'
    }
  };

  const combinedStyles: React.CSSProperties = {
    ...baseStyles,
    ...(variantStyles[variant] || variantStyles.primary)
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      style={combinedStyles}
      className={`admin-ui-btn focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} aria-hidden="true" />
      ) : (
        leftIcon && <span aria-hidden="true">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
    </button>
  );
};
