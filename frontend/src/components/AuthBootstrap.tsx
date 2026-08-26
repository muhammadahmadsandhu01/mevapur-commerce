'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';

export default function AuthBootstrap({ children }: { children: ReactNode }) {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!isInitialized) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          color: '#FF8A00',
          fontWeight: 600,
        }}
      >
        Restoring your session...
      </div>
    );
  }

  return children;
}
