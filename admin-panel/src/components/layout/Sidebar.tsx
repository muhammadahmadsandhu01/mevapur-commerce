'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
  CreditCard,
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
  AlertCircle,
  FileSpreadsheet,
  Globe,
  HelpCircle
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  icon: any;
  label: string;
  href: string;
  badge?: string;
  submenu?: Array<{ label: string; href: string }>;
}

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { 
    icon: ShoppingCart, 
    label: 'Orders', 
    href: '/orders',
    badge: '12',
    submenu: [
      { label: 'All Orders', href: '/orders' },
      { label: 'Pending', href: '/orders?status=pending' },
      { label: 'Processing', href: '/orders?status=processing' },
      { label: 'Shipped', href: '/orders?status=shipped' },
      { label: 'Delivered', href: '/orders?status=delivered' },
      { label: 'Cancelled', href: '/orders?status=cancelled' }
    ]
  },
  { 
    icon: Package, 
    label: 'Products', 
    href: '/products',
    submenu: [
      { label: 'All Products', href: '/products' },
      { label: 'Add Product', href: '/products/add' },
      { label: 'Categories', href: '/categories' },
      { label: 'Brands', href: '/brands' }
    ]
  },
  { icon: FolderTree, label: 'Categories', href: '/categories' },
  { icon: Building2, label: 'Brands', href: '/brands' },
  { icon: Boxes, label: 'Inventory', href: '/inventory' },
  { icon: Users, label: 'Customers', href: '/customers' },
  { icon: Star, label: 'Reviews', href: '/reviews' },
  { icon: Percent, label: 'Coupons', href: '/coupons' },
  { icon: Gift, label: 'Promotions', href: '/promotions' },
  { icon: CreditCard, label: 'Payments', href: '/payments' },
  { icon: Truck, label: 'Shipping', href: '/shipping' },
  { 
    icon: RotateCcw, 
    label: 'Returns', 
    href: '/returns',
    submenu: [
      { label: 'All Returns', href: '/returns' },
      { label: 'Pending', href: '/returns?status=pending' },
      { label: 'Approved', href: '/returns?status=approved' },
      { label: 'Refunded', href: '/returns?status=refunded' },
      { label: 'Rejected', href: '/returns?status=rejected' }
    ]
  },
  { icon: DollarSign, label: 'Refunds', href: '/returns?view=refunds' },
  { icon: Bell, label: 'Notifications', href: '/notifications' },
  { 
    icon: FileSpreadsheet, 
    label: 'Reports', 
    href: '/reports',
    submenu: [
      { label: 'Sales Report', href: '/reports' },
      { label: 'Products Report', href: '/reports?tab=products' },
      { label: 'Customers Report', href: '/reports?tab=customers' },
      { label: 'Orders Report', href: '/reports?tab=orders' }
    ]
  },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' }, // ✅ FIXED: Unique href
  { icon: Megaphone, label: 'Marketing', href: '/marketing' }, // ✅ FIXED: Unique href
  { 
    icon: ImageIcon, 
    label: 'Content', 
    href: '/content',
    submenu: [
      { label: 'Banners', href: '/content/banners' },
      { label: 'Pages', href: '/content/pages' },
      { label: 'Blogs', href: '/content/blogs' }
    ]
  },
  { icon: UsersRound, label: 'Users', href: '/users' },
  { icon: Shield, label: 'Roles', href: '/roles' }, // ✅ FIXED: Unique href
  { icon: History, label: 'Activity Logs', href: '/activity-logs' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  const toggleMenu = (href: string) => {
    setExpandedMenus(prev => 
      prev.includes(href) 
        ? prev.filter(item => item !== href)
        : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href.split('?')[0]); // ✅ FIXED: Ignore query params for active state
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 999,
            display: 'none'
          }}
          className="mobile-overlay"
        />
      )}

      <aside 
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
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Logo */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minHeight: '80px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            flexShrink: 0
          }}>
            🛒
          </div>
          {isOpen && (
            <div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: '800', 
                color: 'var(--text-primary)',
                lineHeight: 1.2
              }}>
                MevaPur
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--text-secondary)',
                fontWeight: '600'
              }}>
                Admin Panel
              </div>
            </div>
          )}
        </div>

        {/* Menu Items */}
        <nav style={{ 
          padding: '16px 12px',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden'
        }}>
          {menuItems.map((item) => {
            const isExpanded = expandedMenus.includes(item.href);
            const hasSubmenu = item.submenu && item.submenu.length > 0;
            
            return (
              <div key={item.href} style={{ marginBottom: '4px' }}>
                <Link
                  href={item.href}
                  onClick={(e) => {
                    if (hasSubmenu) {
                      e.preventDefault();
                      toggleMenu(item.href);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    color: isActive(item.href) ? 'var(--primary)' : 'var(--text-secondary)',
                    textDecoration: 'none',
                    borderRadius: '10px',
                    transition: 'all 0.2s',
                    backgroundColor: isActive(item.href) ? 'var(--primary-light)' : 'transparent',
                    fontWeight: isActive(item.href) ? '600' : '500',
                    fontSize: '14px',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => {
                    if (!isActive(item.href)) {
                      e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive(item.href)) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <item.icon size={20} style={{ flexShrink: 0 }} />
                  {isOpen && (
                    <>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge && (
                        <span style={{
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '700'
                        }}>
                          {item.badge}
                        </span>
                      )}
                      {hasSubmenu && (
                        <ChevronDown 
                          size={16} 
                          style={{ 
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                          }}
                        />
                      )}
                    </>
                  )}
                </Link>

                {/* Submenu */}
                {isOpen && hasSubmenu && isExpanded && (
                  <div style={{ 
                    marginLeft: '20px',
                    marginTop: '4px',
                    borderLeft: '2px solid var(--border-color)',
                    paddingLeft: '12px'
                  }}>
                    {item.submenu!.map((subItem) => (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        style={{
                          display: 'block',
                          padding: '8px 12px',
                          color: 'var(--text-secondary)',
                          textDecoration: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-secondary)';
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
          padding: '16px 12px',
          borderTop: '1px solid var(--border-color)'
        }}>
          <button
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              color: 'var(--danger)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--danger-light)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <LogOut size={20} />
            {isOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}