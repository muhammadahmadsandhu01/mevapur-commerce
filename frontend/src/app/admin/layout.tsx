'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  Settings,
  LogOut,
  Menu,
  X
} from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'admin') {
      router.push('/login');
    }
  }, [isAuthenticated, user, router]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/admin' },
    { icon: Package, label: 'Products', href: '/admin/products' },
    { icon: ShoppingCart, label: 'Orders', href: '/admin/orders' },
    { icon: Users, label: 'Customers', href: '/admin/customers' },
    { icon: Settings, label: 'Settings', href: '/admin/settings' },
  ];

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
      <aside style={{
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: isSidebarOpen ? '260px' : '80px',
        backgroundColor: '#0F766E',
        transition: 'all 0.3s ease',
        zIndex: 1000,
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '32px' }}>🌰</span>
          {isSidebarOpen && (
            <span style={{ fontSize: '20px', fontWeight: '800', color: 'white' }}>
              MevaPur Admin
            </span>
          )}
        </div>

        <nav style={{ padding: '20px 12px' }}>
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                color: 'rgba(255,255,255,0.8)',
                textDecoration: 'none',
                borderRadius: '10px',
                marginBottom: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              }}
            >
              <item.icon size={22} />
              {isSidebarOpen && <span style={{ fontWeight: '600' }}>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '12px',
          right: '12px'
        }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              backgroundColor: 'rgba(239,68,68,0.2)',
              color: '#FCA5A5',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)';
            }}
          >
            <LogOut size={22} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main style={{
        marginLeft: isSidebarOpen ? '260px' : '80px',
        transition: 'all 0.3s ease',
        minHeight: '100vh'
      }}>
        <header style={{
          backgroundColor: 'white',
          padding: '20px 32px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px'
            }}
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '700', color: '#111827' }}>
                {user?.fullName}
              </div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>
                Administrator
              </div>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#0F766E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '20px',
              fontWeight: '700'
            }}>
              {user?.fullName?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div style={{ padding: '32px' }}>
          {children}
        </div>
      </main>
    </div>
  );
}