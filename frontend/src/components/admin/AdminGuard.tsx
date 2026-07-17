'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Loader } from 'lucide-react';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, token } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (!isAuthenticated || !token) {
        router.push('/login?redirect=/admin');
        return;
      }

      // Check if user has admin role
      const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.isAdmin;
      
      if (!isAdmin) {
        router.push('/'); // Redirect to home if not admin
        return;
      }

      setLoading(false);
    };

    checkAuth();
  }, [isAuthenticated, token, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader className="animate-spin text-teal-700 mx-auto mb-4" size={48} />
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}