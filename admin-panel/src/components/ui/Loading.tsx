import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingProps {
  label?: string;
  minHeight?: string;
  style?: React.CSSProperties;
}

export const Loading: React.FC<LoadingProps> = ({
  label = 'Loading data...',
  minHeight = '280px',
  style = {}
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        minHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        backgroundColor: 'var(--card-bg, #FFFFFF)',
        border: '1px solid var(--border-color, #E5E7EB)',
        borderRadius: '16px',
        color: 'var(--text-secondary, #6B7280)',
        ...style
      }}
    >
      <Loader2 className="animate-spin" size={32} color="#FF8A00" aria-hidden="true" />
      <span style={{ fontSize: '13.5px', fontWeight: '500' }}>{label}</span>
    </div>
  );
};
