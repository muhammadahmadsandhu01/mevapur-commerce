'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: { bg: '#D1FAE5', border: '#0F766E', text: '#0F766E', icon: <CheckCircle size={20} /> },
    error: { bg: '#FEE2E2', border: '#DC2626', text: '#DC2626', icon: <XCircle size={20} /> },
    info: { bg: '#DBEAFE', border: '#2563EB', text: '#2563EB', icon: <AlertCircle size={20} /> }
  };

  const color = colors[type];

  return (
    <div style={{
      position: 'fixed', top: '24px', right: '24px', zIndex: 10000,
      backgroundColor: color.bg, border: `2px solid ${color.border}`,
      borderRadius: '12px', padding: '16px 20px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      display: 'flex', alignItems: 'center', gap: '12px',
      minWidth: '300px', animation: 'slideIn 0.3s ease'
    }}>
      <div style={{ color: color.text }}>{color.icon}</div>
      <p style={{ flex: 1, color: color.text, fontWeight: '600', fontSize: '14px', margin: 0 }}>{message}</p>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.text, padding: '4px' }}>
        <X size={16} />
      </button>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}