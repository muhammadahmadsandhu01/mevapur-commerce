'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { 
  Search, 
  Bell, 
  MessageSquare, 
  Plus, 
  Moon, 
  Sun, 
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Lock,
  X
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const router = useRouter();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const notifications = [
    { id: 1, title: 'New order #1234 received', time: '2 minutes ago', type: 'order' },
    { id: 2, title: 'Low stock alert: Premium Almonds', time: '15 minutes ago', type: 'inventory' },
    { id: 3, title: 'New customer registered', time: '1 hour ago', type: 'customer' },
    { id: 4, title: 'Payment received for order #1230', time: '2 hours ago', type: 'payment' },
    { id: 5, title: 'Product review pending approval', time: '3 hours ago', type: 'review' },
  ];

  const messages = [
    { id: 1, name: 'Ahmed Khan', message: 'When will my order arrive?', time: '5 min ago', unread: true },
    { id: 2, name: 'Sara Malik', message: 'Need help with return', time: '1 hour ago', unread: true },
    { id: 3, name: 'Ali Raza', message: 'Thanks for quick delivery!', time: '3 hours ago', unread: false },
  ];

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
      {/* Left Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
        <button
          onClick={onMenuClick}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Menu size={24} />
        </button>

        {/* Search Bar */}
        <div style={{
          flex: 1,
          maxWidth: '500px',
          position: 'relative'
        }}>
          <Search 
            size={18} 
            style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)'
            }}
          />
          <input
            type="text"
            placeholder="Search products, orders, customers..."
            style={{
              width: '100%',
              padding: '12px 16px 12px 44px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              transition: 'all 0.2s'
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-light)';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* Right Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Quick Create Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowQuickCreate(!showQuickCreate)}
            style={{
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Plus size={18} />
            <span>Create</span>
          </button>

          {showQuickCreate && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '240px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              zIndex: 1000
            }}>
              {[
                { label: 'Add Product', href: '/products/add', icon: Package },
                { label: 'Create Order', href: '/orders/new', icon: ShoppingCart },
                { label: 'Add Customer', href: '/customers/add', icon: Users },
                { label: 'Create Coupon', href: '/coupons/add', icon: Percent },
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    router.push(item.href);
                    setShowQuickCreate(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '10px',
            borderRadius: '10px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Messages */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMessages(!showMessages)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '10px',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <MessageSquare size={20} />
            <span style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--danger)'
            }} />
          </button>

          {showMessages && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '360px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              zIndex: 1000
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                fontWeight: '700',
                fontSize: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>Messages</span>
                <button 
                  onClick={() => setShowMessages(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: msg.unread ? 'var(--primary-light)' : 'transparent'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = msg.unread ? 'var(--primary-light)' : 'transparent';
                    }}
                  >
                    <div style={{ 
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px'
                    }}>
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: '600',
                        color: 'var(--text-primary)'
                      }}>
                        {msg.name}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: 'var(--text-secondary)' 
                      }}>
                        {msg.time}
                      </div>
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {msg.message}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{
                padding: '12px 20px',
                textAlign: 'center',
                borderTop: '1px solid var(--border-color)'
              }}>
                <button style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px'
                }}>
                  View all messages
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '10px',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Bell size={20} />
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              backgroundColor: 'var(--danger)',
              color: 'white',
              borderRadius: '10px',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: '700',
              minWidth: '18px',
              textAlign: 'center'
            }}>
              {notifications.length}
            </span>
          </button>

          {showNotifications && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '360px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              zIndex: 1000
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                fontWeight: '700',
                fontSize: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>Notifications</span>
                <button 
                  onClick={() => setShowNotifications(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      marginBottom: '4px',
                      color: 'var(--text-primary)'
                    }}>
                      {notif.title}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-secondary)' 
                    }}>
                      {notif.time}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{
                padding: '12px 20px',
                textAlign: 'center',
                borderTop: '1px solid var(--border-color)'
              }}>
                <button style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px'
                }}>
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 12px',
              borderRadius: '10px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '16px',
              fontWeight: '700'
            }}>
              {user?.fullName?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '14px',
                color: 'var(--text-primary)'
              }}>
                {user?.fullName || 'Admin'}
              </div>
              <div style={{ 
                fontSize: '12px', 
                color: 'var(--text-secondary)' 
              }}>
                {user?.role || 'Administrator'}
              </div>
            </div>
            <ChevronDown size={16} color="var(--text-secondary)" />
          </button>

          {showProfileMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '240px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              zIndex: 1000
            }}>
              {[
                { icon: User, label: 'My Profile', href: '/profile' },
                { icon: Lock, label: 'Change Password', href: '/change-password' },
                { icon: Settings, label: 'Account Settings', href: '/settings' },
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    router.push(item.href);
                    setShowProfileMenu(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--danger)',
                    fontSize: '14px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'var(--danger-light)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
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