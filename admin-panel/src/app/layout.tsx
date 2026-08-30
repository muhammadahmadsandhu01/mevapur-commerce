'use client';

import { useEffect, useState, useSyncExternalStore, useRef } from 'react';
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

  /* Responsive sidebar drawer and main-content overrides */
  @media (max-width: 1023px) {
    .sidebar-container {
      width: 280px !important;
      transform: translateX(-100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .sidebar-container.open {
      transform: translateX(0) !important;
    }
    .main-content {
      margin-left: 0 !important;
      width: 100% !important;
    }
    .mobile-overlay {
      display: block !important;
    }
    .mobile-close-btn {
      display: flex !important;
    }
  }

  @media (min-width: 1024px) {
    .sidebar-container {
      transform: none !important;
    }
    .mobile-overlay {
      display: none !important;
    }
    .mobile-close-btn {
      display: none !important;
    }
  }

  /* Responsive TopBar text collapses */
  @media (max-width: 767px) {
    .topbar-site-name {
      display: none !important;
    }
    .topbar-create-text {
      display: none !important;
    }
    .topbar-user-info {
      display: none !important;
    }
    .topbar-user-chevron {
      display: none !important;
    }
    .topbar-header {
      padding: 12px 16px !important;
      gap: 12px !important;
    }
    .topbar-btn {
      padding: 6px !important;
    }
    .topbar-profile-btn {
      padding: 4px !important;
      gap: 0 !important;
    }
  }
`;

const PUBLIC_AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isDark } = useThemeStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Render-phase state adjustment to reset mobile drawer on route transition
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileDrawerOpen(false);
  }
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

  // ✅ Public auth pages ko guard aur chrome layout se bahar rakha hai
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  const isPublicRoute = PUBLIC_AUTH_ROUTES.includes(normalizedPath);

  if (isPublicRoute) {
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
              mobileOpen={mobileDrawerOpen}
              onClose={() => setMobileDrawerOpen(false)}
              hamburgerRef={hamburgerRef}
            />

            <main
              className="main-content"
              style={{
                marginLeft: isSidebarOpen ? '280px' : '80px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                minHeight: '100vh'
              }}
            >
              <TopBar
                onMenuClick={() => {
                  if (window.innerWidth < 1024) {
                    setMobileDrawerOpen(prev => !prev);
                  } else {
                    setIsSidebarOpen(prev => !prev);
                  }
                }}
                hamburgerRef={hamburgerRef}
                mobileOpen={mobileDrawerOpen}
              />

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
