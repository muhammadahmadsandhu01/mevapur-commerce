'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  CheckCircle,
  ChevronDown,
  Lock,
  LogOut,
  Menu,
  Moon,
  Package,
  Percent,
  Plus,
  Search,
  Settings,
  Sun,
  User,
  X,
  Loader,
  ShoppingBag
} from 'lucide-react';
import { branding } from '@/config/branding';
import api from '@/lib/api';
import { PRODUCT_PLACEHOLDER } from '@/lib/placeholder';
import {
  ADMIN_NOTIFICATION_CHANGE_EVENT,
  QUICK_CREATE_ACTIONS,
  announceAdminNotificationChange,
  formatNotificationTime,
  isSuccessfulMutationEnvelope,
  notificationBadgeText,
  safeInternalActionUrl,
  toggleTopBarPopover,
  validateNotificationListEnvelope,
  validateUnreadCountEnvelope,
  type AdminNotification,
  type TopBarPopover
} from '@/lib/notificationUi';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

interface TopBarProps {
  onMenuClick: () => void;
}

type NotificationPopoverState =
  | { status: 'loading' }
  | { status: 'success'; notifications: AdminNotification[]; unreadCount: number }
  | { status: 'error' };

const quickCreateIcons = {
  'Add Product': Package,
  'Create Coupon': Percent
} as const;

interface SearchProduct {
  _id: string;
  name: string;
  slug: string;
  price: number;
  image?: string;
  category?: { name: string; slug: string };
  sku?: string;
}

interface SearchOrder {
  _id: string;
  orderId?: string;
  totalAmount: number;
  orderStatus: string;
  shippingAddress?: { fullName: string };
  user?: { fullName: string };
}

interface SearchCustomer {
  _id: string;
  fullName: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const router = useRouter();
  const pathname = usePathname();
  const [activePopover, setActivePopover] = useState<TopBarPopover>(null);
  // Search state and handlers have been refactored into the GlobalSearchForm component below.
  const [notificationState, setNotificationState] = useState<NotificationPopoverState>({ status: 'loading' });
  const [notificationActionError, setNotificationActionError] = useState<string | null>(null);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);
  const popoverRegionRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const notificationRequestIdRef = useRef(0);
  const notificationRequestRef = useRef<Promise<void> | null>(null);
  const notificationAbortRef = useRef<AbortController | null>(null);

  const loadNotifications = useCallback((restartIfBusy = false): Promise<void> => {
    if (notificationRequestRef.current) {
      if (!restartIfBusy) return notificationRequestRef.current;
      notificationAbortRef.current?.abort();
      notificationRequestRef.current = null;
      notificationAbortRef.current = null;
    }

    const requestId = ++notificationRequestIdRef.current;
    const controller = new AbortController();
    notificationAbortRef.current = controller;
    setNotificationState({ status: 'loading' });
    setNotificationActionError(null);

    const request = (async () => {
      try {
        const [listResponse, unreadResponse] = await Promise.all([
          api.get('/notifications', { params: { limit: 5 }, signal: controller.signal }),
          api.get('/notifications/unread-count', { signal: controller.signal })
        ]);
        const notifications = validateNotificationListEnvelope(listResponse.data);
        const unreadCount = validateUnreadCountEnvelope(unreadResponse.data);

        if (notifications === null || unreadCount === null) {
          throw new Error('INVALID_NOTIFICATION_RESPONSE');
        }
        if (!mountedRef.current || controller.signal.aborted || requestId !== notificationRequestIdRef.current) return;
        setNotificationState({ status: 'success', notifications, unreadCount });
      } catch {
        if (!mountedRef.current || controller.signal.aborted || requestId !== notificationRequestIdRef.current) return;
        setNotificationState({ status: 'error' });
      } finally {
        if (requestId === notificationRequestIdRef.current) {
          notificationRequestRef.current = null;
          notificationAbortRef.current = null;
        }
      }
    })();

    notificationRequestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (user?.id) void loadNotifications();

    const handleNotificationChange = () => {
      if (user?.id) void loadNotifications(true);
    };
    window.addEventListener(ADMIN_NOTIFICATION_CHANGE_EVENT, handleNotificationChange);

    return () => {
      mountedRef.current = false;
      notificationAbortRef.current?.abort();
      notificationAbortRef.current = null;
      notificationRequestRef.current = null;
      window.removeEventListener(ADMIN_NOTIFICATION_CHANGE_EVENT, handleNotificationChange);
    };
  }, [loadNotifications, user?.id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setActivePopover(null), 0);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  useEffect(() => {
    if (!activePopover) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!popoverRegionRef.current?.contains(event.target as Node)) setActivePopover(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActivePopover(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePopover]);

  const navigate = (href: string) => {
    setActivePopover(null);
    if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) {
      router.push(href);
    }
  };

  const togglePopover = (popover: Exclude<TopBarPopover, null>) => {
    const nextPopover = toggleTopBarPopover(activePopover, popover);
    setActivePopover(nextPopover);
    if (nextPopover === 'notifications') void loadNotifications();
  };

  const handleNotificationClick = async (notification: AdminNotification) => {
    if (pendingNotificationId) return;
    setNotificationActionError(null);

    if (!notification.isRead) {
      setPendingNotificationId(notification._id);
      try {
        const response = await api.put(`/notifications/${notification._id}/read`);
        if (!isSuccessfulMutationEnvelope(response.data)) throw new Error('NOTIFICATION_READ_FAILED');
        if (!mountedRef.current) return;

        setNotificationState((current) => current.status === 'success'
          ? {
              ...current,
              unreadCount: Math.max(0, current.unreadCount - 1),
              notifications: current.notifications.map((item) => (
                item._id === notification._id ? { ...item, isRead: true } : item
              ))
            }
          : current);
        announceAdminNotificationChange();
      } catch {
        if (mountedRef.current) {
          setNotificationActionError('This notification could not be marked as read. Please try again.');
        }
        return;
      } finally {
        if (mountedRef.current) setPendingNotificationId(null);
      }
    }

    navigate(safeInternalActionUrl(notification.actionUrl) ?? '/notifications');
  };

  const handleLogout = () => {
    setActivePopover(null);
    void logout();
    router.push('/login');
  };

  const unreadCount = notificationState.status === 'success' ? notificationState.unreadCount : 0;
  const badgeText = notificationState.status === 'success' ? notificationBadgeText(unreadCount) : null;

  return (
    <header style={{
      backgroundColor: 'var(--card-bg)',
      padding: '16px 32px',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '20px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px',
            color: 'var(--text-primary)', display: 'flex', alignItems: 'center'
          }}
        >
          <Menu size={24} />
        </button>

        <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {branding.siteName} Admin
        </span>

                <GlobalSearchForm
          key={pathname}
          activePopover={activePopover}
          onSearchFocus={() => setActivePopover(null)}
          navigate={navigate}
        />
      </div>

      <div ref={popoverRegionRef} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => togglePopover('quick-create')}
            aria-expanded={activePopover === 'quick-create'}
            aria-haspopup="menu"
            aria-controls="topbar-quick-create"
            style={{
              backgroundColor: 'var(--primary)', color: '#0B132B', border: 'none', padding: '10px 16px',
              borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex',
              alignItems: 'center', gap: '8px', transition: 'all 0.2s'
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor = 'var(--primary-dark)';
              event.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'var(--primary)';
              event.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Plus size={18} />
            <span>Create</span>
          </button>

          {activePopover === 'quick-create' && (
            <div
              id="topbar-quick-create"
              role="menu"
              aria-label="Quick Create"
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '240px',
                backgroundColor: 'var(--card-bg)', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                border: '1px solid var(--border-color)', overflow: 'hidden', zIndex: 1000
              }}
            >
              {QUICK_CREATE_ACTIONS.map((item) => {
                const ItemIcon = quickCreateIcons[item.label];
                return (
                  <button
                    key={item.href}
                    type="button"
                    role="menuitem"
                    onClick={() => navigate(item.href)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)',
                      fontSize: '14px', fontWeight: '500', transition: 'all 0.2s', textAlign: 'left'
                    }}
                    onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
                    onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <ItemIcon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '10px', borderRadius: '10px',
            color: 'var(--text-primary)', display: 'flex', alignItems: 'center', transition: 'all 0.2s'
          }}
          onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
          onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => togglePopover('notifications')}
            aria-label={badgeText ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={activePopover === 'notifications'}
            aria-haspopup="dialog"
            aria-controls="topbar-notifications"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '10px', borderRadius: '10px',
              color: 'var(--text-primary)', position: 'relative', display: 'flex', alignItems: 'center', transition: 'all 0.2s'
            }}
            onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Bell size={20} />
            {badgeText && (
              <span
                aria-label={`${unreadCount} unread notifications`}
                style={{
                  position: 'absolute', top: '4px', right: '4px', backgroundColor: 'var(--danger)', color: 'white',
                  borderRadius: '10px', padding: '2px 6px', fontSize: '10px', fontWeight: '700', minWidth: '18px',
                  textAlign: 'center'
                }}
              >
                {badgeText}
              </span>
            )}
          </button>

          {activePopover === 'notifications' && (
            <div
              id="topbar-notifications"
              role="dialog"
              aria-label="Recent notifications"
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: 'min(360px, calc(100vw - 24px))',
                backgroundColor: 'var(--card-bg)', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                border: '1px solid var(--border-color)', overflow: 'hidden', zIndex: 1000
              }}
            >
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: '700',
                fontSize: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span>Notifications</span>
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  aria-label="Close notifications"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
                >
                  <X size={18} />
                </button>
              </div>

              {notificationActionError && (
                <div role="alert" style={{ padding: '10px 16px', color: 'var(--danger-text)', backgroundColor: 'var(--danger-light)', fontSize: '12px' }}>
                  {notificationActionError}
                </div>
              )}

              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {notificationState.status === 'loading' && (
                  <div role="status" style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Loading notifications...
                  </div>
                )}
                {notificationState.status === 'error' && (
                  <div role="alert" style={{ padding: '24px 20px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>
                      Notifications could not be loaded.
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadNotifications()}
                      style={{
                        background: 'none', border: 'none', color: 'var(--accent-text)', cursor: 'pointer',
                        fontWeight: '700', fontSize: '13px'
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {notificationState.status === 'success' && notificationState.notifications.length === 0 && (
                  <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                    <CheckCircle size={28} color="var(--success-text)" style={{ margin: '0 auto 10px' }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No new notifications</p>
                  </div>
                )}
                {notificationState.status === 'success' && notificationState.notifications.map((notification) => (
                  <button
                    key={notification._id}
                    type="button"
                    disabled={pendingNotificationId === notification._id}
                    onClick={() => void handleNotificationClick(notification)}
                    style={{
                      width: '100%', padding: '16px 20px', border: 'none', borderBottom: '1px solid var(--border-color)',
                      cursor: pendingNotificationId === notification._id ? 'wait' : 'pointer', transition: 'all 0.2s',
                      backgroundColor: notification.isRead ? 'transparent' : 'var(--primary-light)', textAlign: 'left',
                      opacity: pendingNotificationId === notification._id ? 0.7 : 1
                    }}
                    onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = notification.isRead ? 'transparent' : 'var(--primary-light)';
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: notification.isRead ? '600' : '700', marginBottom: '4px', color: 'var(--text-primary)' }}>
                      {notification.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {formatNotificationTime(notification.createdAt)}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ padding: '12px 20px', textAlign: 'center', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => navigate('/notifications')}
                  style={{
                    background: 'none', border: 'none', color: 'var(--accent-text)', cursor: 'pointer',
                    fontWeight: '600', fontSize: '14px'
                  }}
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => togglePopover('profile')}
            aria-expanded={activePopover === 'profile'}
            aria-haspopup="menu"
            aria-controls="topbar-profile"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
              padding: '6px 12px', borderRadius: '10px', transition: 'all 0.2s'
            }}
            onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--primary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#0B132B', fontSize: '16px', fontWeight: '700'
            }}>
              {user?.fullName?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                {user?.fullName || 'Admin'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {user?.role || 'Administrator'}
              </div>
            </div>
            <ChevronDown size={16} color="var(--text-secondary)" />
          </button>

          {activePopover === 'profile' && (
            <div
              id="topbar-profile"
              role="menu"
              aria-label="Profile menu"
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '240px',
                backgroundColor: 'var(--card-bg)', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                border: '1px solid var(--border-color)', overflow: 'hidden', zIndex: 1000
              }}
            >
              {[
                { icon: User, label: 'My Profile', href: '/profile' },
                { icon: Lock, label: 'Change Password', href: '/change-password' },
                { icon: Settings, label: 'Account Settings', href: '/settings' }
              ].map((item) => (
                <button
                  key={item.href}
                  type="button"
                  role="menuitem"
                  onClick={() => navigate(item.href)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)',
                    fontSize: '14px', fontWeight: '500', transition: 'all 0.2s', textAlign: 'left'
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
                  onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '14px',
                    fontWeight: '600', transition: 'all 0.2s', textAlign: 'left'
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--danger-light)'; }}
                  onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


interface GlobalSearchFormProps {
  activePopover: TopBarPopover;
  onSearchFocus: () => void;
  navigate: (href: string) => void;
}

function GlobalSearchForm({ activePopover, onSearchFocus, navigate }: GlobalSearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    products: SearchProduct[];
    orders: SearchOrder[];
    customers: SearchCustomer[];
  }>({ products: [], orders: [], customers: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusedIndex, setSearchFocusedIndex] = useState(-1);
  const isSearchDropdownOpen = searchOpen && !activePopover;
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const getFlatItems = useCallback(() => {
    const items: Array<{ type: 'product' | 'order' | 'customer'; data: SearchProduct | SearchOrder | SearchCustomer; href: string }> = [];
    searchResults.products.forEach(p => items.push({ type: 'product', data: p, href: `/products/${p._id}/edit` }));
    searchResults.orders.forEach(o => items.push({ type: 'order', data: o, href: `/orders/${o._id}` }));
    searchResults.customers.forEach(c => items.push({ type: 'customer', data: c, href: `/customers?search=${encodeURIComponent(c.fullName)}` }));
    return items;
  }, [searchResults]);

  const performSearch = useCallback(async (query: string) => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    setSearchLoading(true);
    setSearchError(false);

    try {
      const [productsRes, ordersRes, customersRes] = await Promise.all([
        api.get('/products', { params: { limit: 5, autocomplete: 'true', keyword: query }, signal: controller.signal }),
        api.get('/orders', { params: { limit: 5, search: query }, signal: controller.signal }),
        api.get('/customers', { params: { limit: 5, search: query }, signal: controller.signal })
      ]);

      if (controller.signal.aborted) return;

      const products = Array.isArray(productsRes.data?.data) ? productsRes.data.data : [];
      const orders = Array.isArray(ordersRes.data?.data?.orders) ? ordersRes.data.data.orders : [];
      const customers = Array.isArray(customersRes.data?.data) ? customersRes.data.data : [];

      setSearchResults({ products, orders, customers });
      setSearchOpen(true);
      setSearchFocusedIndex(-1);
    } catch (err: unknown) {
      const errorName = (err as Error)?.name;
      if (errorName === 'CanceledError' || errorName === 'AbortError' || controller.signal.aborted) {
        return;
      }
      setSearchError(true);
      setSearchResults({ products: [], orders: [], customers: [] });
      setSearchOpen(true);
      setSearchFocusedIndex(-1);
    } finally {
      if (!controller.signal.aborted) {
        setSearchLoading(false);
      }
    }
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    const flatItems = getFlatItems();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isSearchDropdownOpen && flatItems.length > 0) {
        setSearchOpen(true);
        setSearchFocusedIndex(0);
      } else {
        setSearchFocusedIndex(prev => (prev < flatItems.length - 1 ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchFocusedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchFocusedIndex(-1);
    } else if (e.key === 'Enter') {
      if (isSearchDropdownOpen && searchFocusedIndex >= 0 && searchFocusedIndex < flatItems.length) {
        e.preventDefault();
        const item = flatItems[searchFocusedIndex];
        handleNavigate(item.href);
      }
    }
  };

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      void performSearch(trimmed);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery, performSearch]);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const form = document.getElementById('topbar-search-form');
      if (form && !form.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);



  const handleNavigate = (href: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults({ products: [], orders: [], customers: [] });
    setSearchFocusedIndex(-1);
    navigate(href);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults({ products: [], orders: [], customers: [] });
    setSearchFocusedIndex(-1);

    let target = '/products';
    if (pathname.startsWith('/orders')) {
      target = '/orders';
    } else if (pathname.startsWith('/customers')) {
      target = '/customers';
    } else if (pathname.startsWith('/reviews')) {
      target = '/reviews';
    }
    router.push(`${target}?search=${encodeURIComponent(query)}`);
  };

  return (
    <form
      id="topbar-search-form"
      role="search"
      onSubmit={handleSearchSubmit}
      style={{ flex: 1, maxWidth: '500px', position: 'relative' }}
    >
      <label
        htmlFor="topbar-global-search"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          border: 0
        }}
      >
        Search products, orders, customers
      </label>
      <Search
        size={18}
        aria-hidden="true"
        style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }}
      />
      <input
        id="topbar-global-search"
        type="text"
        role="combobox"
        aria-expanded={isSearchDropdownOpen}
        aria-autocomplete="list"
        aria-controls="topbar-search-results"
        aria-activedescendant={searchFocusedIndex >= 0 ? `search-item-${searchFocusedIndex}` : undefined}
        value={searchQuery}
        onChange={(event) => {
          const val = event.target.value;
          setSearchQuery(val);
          if (val.trim().length < 2) {
            setSearchResults({ products: [], orders: [], customers: [] });
            setSearchOpen(false);
            setSearchFocusedIndex(-1);
          }
        }}
        onKeyDown={handleSearchKeyDown}
        onFocus={() => {
          onSearchFocus();
          if (searchQuery.trim().length >= 2) {
            setSearchOpen(true);
          }
        }}
        placeholder="Search products, orders, customers..."
        style={{
          width: '100%',
          padding: searchQuery ? '12px 40px 12px 44px' : '12px 16px 12px 44px',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          fontSize: '14px',
          outline: 'none',
          backgroundColor: 'var(--input-bg)',
          color: 'var(--text-primary)',
          transition: 'all 0.2s'
        }}
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => {
            setSearchQuery('');
            setSearchOpen(false);
            setSearchFocusedIndex(-1);
          }}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={16} />
        </button>
      )}

      {isSearchDropdownOpen && (searchQuery.trim().length >= 2) && (
        <div
          id="topbar-search-results"
          role="listbox"
          aria-label="Search results"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '8px',
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            border: '1px solid var(--border-color)',
            maxHeight: '400px',
            overflowY: 'auto',
            zIndex: 1000,
            padding: '12px'
          }}
        >
          {searchLoading ? (
            <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Searching...
            </div>
          ) : searchError ? (
            <div role="alert" style={{ textAlign: 'center', padding: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                Failed to perform search.
              </p>
              <button
                type="button"
                onClick={() => void performSearch(searchQuery.trim())}
                style={{
                  background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer',
                  fontWeight: '700', fontSize: '13px'
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            (() => {
              const flatItems = getFlatItems();
              if (flatItems.length === 0) {
                return (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    No results found for &ldquo;<strong style={{ color: 'var(--text-primary)' }}>{searchQuery}</strong>&rdquo;
                  </div>
                );
              }

              let currentFlatIndex = 0;
              const groups = [];
              if (searchResults.products.length > 0) {
                groups.push({ title: 'Products', items: searchResults.products, type: 'product' });
              }
              if (searchResults.orders.length > 0) {
                groups.push({ title: 'Orders', items: searchResults.orders, type: 'order' });
              }
              if (searchResults.customers.length > 0) {
                groups.push({ title: 'Customers', items: searchResults.customers, type: 'customer' });
              }

              return groups.map((group) => (
                <div key={group.title} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', marginBottom: '6px' }}>
                    {group.title}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {group.items.map((item) => {
                      const index = currentFlatIndex++;
                      const isFocused = searchFocusedIndex === index;

                      let title = '';
                      let subtitle = '';
                      let image = '';
                      let href = '';

                      if (group.type === 'product') {
                        const product = item as SearchProduct;
                        title = product.name;
                        subtitle = product.sku ? `SKU: ${product.sku} · Rs. ${product.price}` : `Rs. ${product.price}`;
                        image = product.image || PRODUCT_PLACEHOLDER;
                        href = `/products/${product._id}/edit`;
                      } else if (group.type === 'order') {
                        const order = item as SearchOrder;
                        title = `Order #${order.orderId?.substring(0, 8) || order._id?.substring(0, 8)}`;
                        subtitle = `${order.shippingAddress?.fullName || order.user?.fullName || 'Guest'} · Rs. ${order.totalAmount} · ${order.orderStatus}`;
                        image = '';
                        href = `/orders/${order._id}`;
                      } else if (group.type === 'customer') {
                        const customer = item as SearchCustomer;
                        title = customer.fullName;
                        subtitle = customer.email || customer.phone || 'No contact info';
                        image = customer.avatar || '';
                        href = `/customers?search=${encodeURIComponent(customer.fullName)}`;
                      }

                      return (
                        <button
                          key={item._id}
                          id={`search-item-${index}`}
                          role="option"
                          aria-selected={isFocused}
                          type="button"
                          onClick={() => handleNavigate(href)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '8px',
                            border: 'none',
                            borderRadius: '8px',
                            backgroundColor: isFocused ? 'var(--hover-bg)' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={() => setSearchFocusedIndex(index)}
                        >
                          {group.type === 'product' && (
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
                              <img src={image} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER; }} />
                            </div>
                          )}
                          {group.type === 'order' && (
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: 'rgba(255, 138, 0, 0.12)', color: '#FF8A00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <ShoppingBag size={20} />
                            </div>
                          )}
                          {group.type === 'customer' && (
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', backgroundColor: 'var(--primary)', color: '#0B132B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', flexShrink: 0 }}>
                              {image ? <img src={image} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : title.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {title}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {subtitle}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      )}
    </form>
  );
}
