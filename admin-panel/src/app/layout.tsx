'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { isDark } = useThemeStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated && pathname !== '/login') {
      router.push('/login');
    }
  }, [isAuthenticated, pathname, router]);

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }
  }, [isDark, mounted]);

  // Always return proper HTML structure
  return (
    <html lang="en" data-theme={isDark ? 'dark' : 'light'}>
      <body style={{ margin: 0, padding: 0 }}>
        <style jsx global>{`
          :root {
            --primary: #0F766E;
            --primary-dark: #115E59;
            --primary-light: rgba(15, 118, 110, 0.1);
            --danger: #EF4444;
            --danger-light: rgba(239, 68, 68, 0.1);
            --success: #10B981;
            --warning: #F59E0B;
          }

          [data-theme="light"] {
            --bg-primary: #F8FAFC;
            --card-bg: #FFFFFF;
            --sidebar-bg: #FFFFFF;
            --text-primary: #111827;
            --text-secondary: #6B7280;
            --border-color: #E5E7EB;
            --hover-bg: #F3F4F6;
            --input-bg: #FFFFFF;
          }

          [data-theme="dark"] {
            --bg-primary: #0F172A;
            --card-bg: #1E293B;
            --sidebar-bg: #1E293B;
            --text-primary: #F1F5F9;
            --text-secondary: #94A3B8;
            --border-color: #334155;
            --hover-bg: #334155;
            --input-bg: #0F172A;
          }

          * {
            box-sizing: border-box;
          }

          body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }

          ::-webkit-scrollbar-track {
            background: var(--bg-primary);
          }

          ::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 4px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: var(--text-secondary);
          }
        `}</style>

        {pathname === '/login' ? (
          <>{children}</>
        ) : !isAuthenticated ? (
          <div style={{ 
            minHeight: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: 'var(--bg-primary)'
          }}>
            <div>Loading...</div>
          </div>
        ) : (
          <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
            <Sidebar 
              isOpen={isSidebarOpen} 
              onClose={() => setIsSidebarOpen(false)} 
            />

            <main style={{
              marginLeft: isSidebarOpen ? '280px' : '80px',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              minHeight: '100vh'
            }}>
              <TopBar onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
              
              <div style={{ padding: '32px' }}>
                {children}
              </div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}