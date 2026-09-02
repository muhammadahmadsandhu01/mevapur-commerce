import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  style = {}
}) => {
  return (
    <div
      style={{
        padding: '56px 24px',
        textAlign: 'center',
        backgroundColor: 'var(--card-bg, #FFFFFF)',
        border: '1px dashed var(--border-color, #E5E7EB)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          backgroundColor: 'var(--bg-primary, #F3F4F6)',
          color: 'var(--text-secondary, #6B7280)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px'
        }}
        aria-hidden="true"
      >
        {icon || <PackageOpen size={28} />}
      </div>

      <h3
        style={{
          fontSize: '17px',
          fontWeight: '700',
          color: 'var(--text-primary, #111827)',
          margin: '0 0 6px 0'
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: '13.5px',
          color: 'var(--text-secondary, #6B7280)',
          maxWidth: '420px',
          margin: '0 0 20px 0',
          lineHeight: 1.5
        }}
      >
        {description}
      </p>

      {actionLabel && onAction && (
        <Button onClick={onAction} variant="primary">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
