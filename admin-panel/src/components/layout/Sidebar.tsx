'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  Tags,
  Percent,
  Star,
  BarChart3,
  FileText,
  Bell,
  Shield,
  History,
  Truck,
  RotateCcw,
  Mail,
  Image as ImageIcon,
  FolderTree,
  Building2,
  Boxes,
  MessageSquare,
  Gift,
  Megaphone,
  UserCog,
  UsersRound,
  ChevronDown,
  ChevronRight,
  DollarSign,
  X,
  AlertCircle,
  FileSpreadsheet,
  Globe,
  HelpCircle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';
import { copyrightLine } from '@/config/branding';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

interface SidebarProps {
  isOpen: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  hamburgerRef: React.RefObject<HTMLButtonElement | null>;
}

interface MenuItem {
  icon: LucideIcon;
  label: string;
  href: string;
  submenu?: Array<{ label: string; href: string }>;
}

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: ShoppingCart, label: 'Orders', href: '/orders' },
  {
    icon: Package,
    label: 'Products',
    href: '/products',
    submenu: [
      { label: 'All Products', href: '/products' },
      { label: 'Add Product', href: '/products/add' }
    ]
  },
  { icon: FolderTree, label: 'Categories', href: '/categories' },
  { icon: Building2, label: 'Brands', href: '/brands' },
  { icon: Boxes, label: 'Inventory', href: '/inventory' },
  { icon: Users, label: 'Customers', href: '/customers' },
  { icon: Star, label: 'Reviews', href: '/reviews' },
  { icon: Percent, label: 'Coupons', href: '/coupons' },
  { icon: Gift, label: 'Promotions', href: '/promotions' },
  { icon: Truck, label: 'Shipping', href: '/shipping' },
  { icon: RotateCcw, label: 'Returns', href: '/returns' },
  { icon: DollarSign, label: 'Payments & Refunds', href: '/refunds' },
  { icon: Bell, label: 'Notifications', href: '/notifications' },
  { icon: FileSpreadsheet, label: 'Reports', href: '/reports' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { icon: Megaphone, label: 'Marketing', href: '/marketing' },
  { icon: ImageIcon, label: 'Content', href: '/content' },
  { icon: UsersRound, label: 'Users', href: '/users' },
  { icon: Shield, label: 'Roles', href: '/roles' },
  { icon: History, label: 'Activity Logs', href: '/activity-logs' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export default function Sidebar({ isOpen, mobileOpen, onClose, hamburgerRef }: SidebarProps) {
  const drawerRef = useRef<HTMLElement>(null);

  // Trap focus inside drawer when mobile drawer is open
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  // Focus the first element when the drawer opens
  useEffect(() => {
    if (mobileOpen) {
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable && focusable.length > 0) {
        focusable[0].focus();
      }
    }
  }, [mobileOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [mobileOpen]);

  // Focus restoration to the TopBar hamburger menu on close
  const prevMobileOpen = useRef(mobileOpen);
  useEffect(() => {
    if (prevMobileOpen.current && !mobileOpen) {
      hamburgerRef.current?.focus();
    }
    prevMobileOpen.current = mobileOpen;
  }, [mobileOpen, hamburgerRef]);
  const pathname = usePathname();
  const router = useRouter();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const logout = useAuthStore((state) => state.logout);
  const { isDark } = useThemeStore();

  const handleLogout = () => {
    void logout();
    onClose();
    router.push('/login');
  };

  const toggleMenu = (href: string) => {
    setExpandedMenus(prev =>
      prev.includes(href)
        ? prev.filter(item => item !== href)
        : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href.split('?')[0]);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 999,
            display: 'none',
            backdropFilter: 'blur(2px)'
          }}
          className="mobile-overlay"
        />
      )}

      <aside
        id="admin-sidebar"
        ref={drawerRef}
        onKeyDown={handleKeyDown}
        className={mobileOpen ? "sidebar-container open" : "sidebar-container"}
        aria-label="Main Navigation"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          height: '100vh',
          width: isOpen ? '280px' : '80px',
          backgroundColor: 'var(--sidebar-bg)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 1000,
          overflow: 'hidden',
          borderRight: '1px solid var(--sidebar-border)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Logo Header */}
        <div style={{
          padding: isOpen ? '20px 20px' : '20px 0',
          borderBottom: '1px solid var(--sidebar-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isOpen ? 'flex-start' : 'center',
          gap: '12px',
          minHeight: '72px'
        }}>
          <BrandLogo
            variant={isOpen ? 'horizontal' : 'symbol'}
            theme="light"
            height={isOpen ? 26 : 32}
          />
          {/* Close Button on Mobile */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="mobile-close-btn"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              color: 'var(--sidebar-text)',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              marginLeft: 'auto'
            }}
          >
            <X size={20} />
          </button>
          {isOpen && (
            <div style={{ marginLeft: 'auto' }}>
              <div style={{
                fontSize: '10px',
                color: 'var(--sidebar-text)',
                fontWeight: '600',
                letterSpacing: '0.1em',
                textTransform: 'uppercase'
              }}>
                Admin Panel
              </div>
            </div>
          )}
        </div>

        {/* Menu Items */}
        <nav style={{
          padding: '12px 10px',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden'
        }}>
          {menuItems.map((item) => {
            const isExpanded = expandedMenus.includes(item.href);
            const hasSubmenu = item.submenu && item.submenu.length > 0;
            const active = isActive(item.href);

            return (
              <div key={item.href} style={{ marginBottom: '2px' }}>
                <Link
                  href={item.href}
                  onClick={(e) => {
                    if (hasSubmenu && isOpen) {
                      e.preventDefault();
                      toggleMenu(item.href);
                    }
                  }}
                  title={!isOpen ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: isOpen ? '10px 14px' : '10px 0',
                    justifyContent: isOpen ? 'flex-start' : 'center',
                    color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                    textDecoration: 'none',
                    borderRadius: '10px',
                    transition: 'all 0.15s ease',
                    backgroundColor: active ? 'var(--sidebar-active-bg)' : 'transparent',
                    fontWeight: active ? '600' : '500',
                    fontSize: '13.5px',
                    position: 'relative',
                    cursor: 'pointer',
                    borderLeft: active ? `3px solid var(--sidebar-active-accent)` : '3px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)';
                      e.currentTarget.style.color = 'var(--sidebar-text-hover, #E2E8F0)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--sidebar-text)';
                    }
                  }}
                >
                  <item.icon size={18} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />
                  {isOpen && (
                    <>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {hasSubmenu && (
                        <ChevronDown
                          size={14}
                          style={{
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                            opacity: 0.6
                          }}
                        />
                      )}
                    </>
                  )}
                </Link>

                {/* Submenu */}
                {isOpen && hasSubmenu && isExpanded && (
                  <div style={{
                    marginLeft: '16px',
                    marginTop: '2px',
                    borderLeft: '1px solid var(--sidebar-border)',
                    paddingLeft: '14px',
                    marginBottom: '4px'
                  }}>
                    {item.submenu!.map((subItem) => (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        style={{
                          display: 'block',
                          padding: '7px 10px',
                          color: 'var(--sidebar-text)',
                          textDecoration: 'none',
                          borderRadius: '7px',
                          fontSize: '12.5px',
                          fontWeight: '500',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)';
                          e.currentTarget.style.color = 'var(--sidebar-text-hover, #E2E8F0)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--sidebar-text)';
                        }}
                      >
                        {subItem.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 10px',
          borderTop: '1px solid var(--sidebar-border)'
        }}>
          {isOpen && (
            <p style={{ margin: '0 8px 8px', color: 'var(--sidebar-text)', fontSize: '10px', opacity: 0.6 }}>
              {copyrightLine()}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isOpen ? 'flex-start' : 'center',
              gap: '12px',
              padding: isOpen ? '10px 14px' : '10px 0',
              backgroundColor: 'transparent',
              color: '#F87171',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13.5px',
              transition: 'all 0.15s ease'
            }}
            title={!isOpen ? 'Logout' : undefined}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {isOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
