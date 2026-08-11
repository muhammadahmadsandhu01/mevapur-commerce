'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useThemeStore } from '@/store/themeStore';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import AdminGuard from '../components/admin/AdminGuard';
import AdminHelpAssistant from '@/components/assistant/AdminHelpAssistant';
import { branding } from '@/config/branding';

const subscribeToHydration = () => () => {};

const GLOBAL_CSS = `
  :root {
    --brand-navy: #0B132B;

    --primary: #FF8A00;
    --primary-dark: #E67D00;
    --primary-light: rgba(255, 138, 0, 0.12);

    --accent: #FF8A00;
    --accent-dark: #E67D00;
    --accent-light: rgba(255, 138, 0, 0.12);

    --danger: #DC2626;
    --danger-light: rgba(220, 38, 38, 0.1);

    --success: #16A34A;
    --success-light: rgba(22, 163, 74, 0.1);

    --warning: #F59E0B;
    --warning-light: rgba(245, 158, 11, 0.1);
  }
  [data-theme="light"] {
    --bg-primary: #F7F7F5;
    --card-bg: #FFFFFF;
    --sidebar-bg: #0B132B;
    --sidebar-text: #94A3B8;
    --sidebar-text-hover: #E2E8F0;
    --sidebar-text-active: #FFFFFF;
    --sidebar-active-bg: rgba(255, 138, 0, 0.15);
    --sidebar-active-accent: #FF8A00;
    --sidebar-hover-bg: rgba(255, 255, 255, 0.07);
    --sidebar-border: rgba(255, 255, 255, 0.08);
    --text-primary: #111827;
    --text-secondary: #6B7280;
    --border-color: #E5E7EB;
    --hover-bg: #FFF4E6;
    --input-bg: #FFFFFF;
    --accent-text: #C2410C;
    --success-text: #166534;
    --warning-text: #92400E;
    --danger-text: #991B1B;
    --info-text: #0B132B;
    --info-light: rgba(11, 19, 43, 0.1);
  }
  [data-theme="dark"] {
    --bg-primary: #0F172A;
    --card-bg: #1E293B;
    --sidebar-bg: #060A16;
    --sidebar-text: #64748B;
    --sidebar-text-hover: #CBD5E1;
    --sidebar-text-active: #FFFFFF;
    --sidebar-active-bg: rgba(255, 138, 0, 0.15);
    --sidebar-active-accent: #FF8A00;
    --sidebar-hover-bg: rgba(255, 255, 255, 0.05);
    --sidebar-border: rgba(255, 255, 255, 0.06);
    --text-primary: #F1F5F9;
    --text-secondary: #94A3B8;
    --border-color: #334155;
    --hover-bg: rgba(255, 138, 0, 0.12);
    --input-bg: #0F172A;
    --accent-text: #FDBA74;
    --success-text: #86EFAC;
    --warning-text: #FCD34D;
    --danger-text: #FCA5A5;
    --info-text: #CBD5E1;
    --info-light: rgba(203, 213, 225, 0.12);
  }
  * { box-sizing: border-box; }
  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }
`;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isDark } = useThemeStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      document.title = `${branding.siteName} Administration`;

      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = branding.faviconPath;

      let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!description) {
        description = document.createElement('meta');
        description.name = 'description';
        document.head.appendChild(description);
      }
      description.content = branding.shortDescription;
    }
  }, [isDark, mounted]);

  // ✅ Login page ko guard se bahar rakha hai
  if (pathname === '/login') {
    return (
      <html lang="en" data-theme={isDark ? 'dark' : 'light'}>
        <body style={{ margin: 0, padding: 0 }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <style jsx global>{GLOBAL_CSS}</style>
          {children}
        </body>
      </html>
    );
  }

  // ✅ Admin content ko AdminGuard se wrap kiya hai
  return (
    <html lang="en" data-theme={isDark ? 'dark' : 'light'}>
      <body style={{ margin: 0, padding: 0 }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <style jsx global>{GLOBAL_CSS}</style>

        <AdminGuard>
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
            <AdminHelpAssistant />
          </div>
        </AdminGuard>
      </body>
    </html>
  );
}
