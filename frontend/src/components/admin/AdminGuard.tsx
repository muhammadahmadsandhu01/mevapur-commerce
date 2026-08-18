'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Loader } from 'lucide-react';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const {
    user,
    token,
    isAuthenticated,
    isInitialized,
    bootstrap,
  } = useAuthStore();
  const router = useRouter();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  useEffect(() => {
    if (!isInitialized) void bootstrap();
  }, [bootstrap, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated || !token) {
      router.replace('/login');
      return;
    }
    if (!isAdmin) router.replace('/');
  }, [isAdmin, isAuthenticated, isInitialized, router, token]);

  if (!isInitialized || !isAuthenticated || !token || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader className="animate-spin text-[#ff8a00] mx-auto mb-4" size={48} />
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
