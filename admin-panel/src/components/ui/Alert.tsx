import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface AlertProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  onDismiss,
  className = '',
  style = {}
}) => {
  const configs = {
    success: {
      bg: '#ECFDF5',
      border: '#A7F3D0',
      color: '#065F46',
      icon: <CheckCircle size={18} color="#059669" aria-hidden="true" />
    },
    error: {
      bg: '#FEF2F2',
      border: '#FECACA',
      color: '#991B1B',
      icon: <AlertCircle size={18} color="#DC2626" aria-hidden="true" />
    },
    warning: {
      bg: '#FFFBEB',
      border: '#FDE68A',
      color: '#92400E',
      icon: <AlertTriangle size={18} color="#D97706" aria-hidden="true" />
    },
    info: {
      bg: '#EFF6FF',
      border: '#BFDBFE',
      color: '#1E40AF',
      icon: <Info size={18} color="#2563EB" aria-hidden="true" />
    }
  };

  const current = configs[type];

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      style={{
        backgroundColor: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: '10px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        marginBottom: '16px',
        ...style
      }}
      className={className}
    >
      <div style={{ flexShrink: 0, marginTop: '2px' }}>{current.icon}</div>
      <div style={{ flexGrow: 1, fontSize: '13.5px', color: current.color }}>
        {title && <div style={{ fontWeight: '700', marginBottom: '2px' }}>{title}</div>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <IconButton
          icon={<X size={14} color={current.color} />}
          aria-label="Dismiss notification"
          onClick={onDismiss}
          size="sm"
          style={{ width: '24px', height: '24px', minWidth: '24px', minHeight: '24px' }}
        />
      )}
    </div>
  );
};
