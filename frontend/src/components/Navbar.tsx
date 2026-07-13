'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Search, Menu, X, Package, Heart, LogOut, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';

export default function Navbar() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { items, wishlist } = useCartStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  
  const [mounted, setMounted] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ✅ Search Handler
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setIsMobileMenuOpen(false);
      setSearchQuery(''); // Clear after search
    }
  };

  // ✅ Properly update counts when items change
  useEffect(() => {
    setMounted(true);
    setCartCount(items.length);
    setWishlistCount(wishlist.length);
  }, [items, wishlist]);

  const handleLogout = () => {
    logout();
    setToast({ message: '👋 Logged out successfully', type: 'success' });
    setIsMobileMenuOpen(false);
  };

  return (
    <nav style={{ 
      backgroundColor: '#0F766E', 
      position: 'sticky', 
      top: 0, 
      zIndex: 1000,
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px'
      }}>
        
        {/* Logo */}
        <Link href="/" style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          textDecoration: 'none'
        }}>
          <span style={{ fontSize: '28px' }}>🌰</span>
          <span style={{ 
            fontSize: '26px', 
            fontWeight: '800', 
            color: 'white',
            letterSpacing: '-0.5px'
          }}>MevaPur</span>
        </Link>

        {/* Search Bar */}
        <form onSubmit={handleSearch} style={{ 
            flex: 1, 
            maxWidth: '600px', 
            display: 'flex', 
            borderRadius: '8px', 
            overflow: 'hidden', 
            border: '2px solid #F59E0B' 
        }}>
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dry fruits, nuts, dates..."
                style={{ 
                    flex: 1, 
                    padding: '10px 14px', 
                    border: 'none', 
                    outline: 'none', 
                    fontSize: '14px' 
                }}
            />
            <button 
                type="submit"
                style={{ 
                    backgroundColor: '#F59E0B', 
                    border: 'none', 
                    padding: '0 16px', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D97706'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F59E0B'}
            >
                <Search size={20} color="white" />
            </button>
        </form>

        {/* Right Section */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '20px', 
          color: 'white' 
        }}>
          
          {/* Wishlist Icon with Count */}
          <Link href="/wishlist" style={{ 
            background: 'none', 
            border: 'none', 
            color: 'white', 
            cursor: 'pointer', 
            position: 'relative',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center'
          }}>
            <Heart size={22} />
            {mounted && wishlistCount > 0 && (
              <span style={{ 
                position: 'absolute', 
                top: '-8px', 
                right: '-8px', 
                backgroundColor: '#EF4444', 
                color: 'white', 
                borderRadius: '50%', 
                width: '18px', 
                height: '18px', 
                fontSize: '10px', 
                fontWeight: '700', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                {wishlistCount}
              </span>
            )}
          </Link>

          {/* Account with Login/Logout */}
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', opacity: '0.8' }}>Hello,</div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>
                  {user?.fullName?.split(' ')[0] || 'User'}
                </div>
              </div>
              <button 
                onClick={handleLogout}
                style={{
                  padding: '8px 16px', 
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white', 
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '8px', 
                  cursor: 'pointer', 
                  fontWeight: '600', 
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => { 
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                }}
                onMouseLeave={e => { 
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                }}
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login" style={{ 
              cursor: 'pointer', 
              textAlign: 'right',
              textDecoration: 'none',
              color: 'white'
            }}>
              <div style={{ fontSize: '11px', opacity: '0.8' }}>Hello, Sign in</div>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>Account</div>
            </Link>
          )}

          {/* My Orders */}
          <Link href="/orders" style={{ 
            cursor: 'pointer', 
            textAlign: 'right',
            textDecoration: 'none',
            color: 'white'
          }}>
            <div style={{ fontSize: '11px', opacity: '0.8' }}>Track</div>
            <div style={{ fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Package size={14} /> My Orders
            </div>
          </Link>

          {/* Cart */}
          <Link href="/cart" style={{ 
            cursor: 'pointer', 
            position: 'relative', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '5px',
            textDecoration: 'none',
            color: 'white'
          }}>
            <ShoppingCart size={24} />
            {mounted && cartCount > 0 && (
              <span style={{ 
                position: 'absolute', 
                top: '-8px', 
                right: '-8px', 
                backgroundColor: '#F59E0B', 
                color: '#0F766E', 
                borderRadius: '50%', 
                width: '20px', 
                height: '20px', 
                fontSize: '12px', 
                fontWeight: '700', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                {cartCount}
              </span>
            )}
            <span style={{ fontWeight: '600' }}>Cart</span>
          </Link>

          {/* Mobile Menu Button */}
          <button 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'white', 
              cursor: 'pointer'
            }}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div style={{ 
          backgroundColor: 'white',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {/* Mobile Search */}
          <form onSubmit={handleSearch}>
            <div style={{ display: 'flex', border: '2px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  border: 'none', 
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
              <button 
                type="submit"
                style={{ 
                  backgroundColor: '#0F766E', 
                  border: 'none', 
                  padding: '0 16px', 
                  cursor: 'pointer',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Search size={20} />
              </button>
            </div>
          </form>
          
          {/* Mobile Menu - Login/Logout */}
          {isAuthenticated ? (
            <>
              <div style={{ 
                padding: '12px', 
                backgroundColor: '#F0FDFA', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <User size={20} color="#0F766E" />
                <div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>Signed in as</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F766E' }}>
                    {user?.fullName || 'User'}
                  </div>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                style={{
                  padding: '12px',
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <LogOut size={16} /> Logout
              </button>
            </>
          ) : (
            <Link 
              href="/login" 
              style={{ 
                color: '#374151', 
                textDecoration: 'none', 
                fontWeight: '600',
                padding: '12px',
                backgroundColor: '#F3F4F6',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <User size={16} /> Sign In
            </Link>
          )}
          
          <Link href="/cart" style={{ color: '#374151', textDecoration: 'none', fontWeight: '600' }}>
            🛒 Cart {mounted && cartCount > 0 ? `(${cartCount})` : ''}
          </Link>
          <Link href="/wishlist" style={{ color: '#374151', textDecoration: 'none', fontWeight: '600' }}>
            ❤️ Wishlist {mounted && wishlistCount > 0 ? `(${wishlistCount})` : ''}
          </Link>
          <Link href="/orders" style={{ color: '#374151', textDecoration: 'none', fontWeight: '600' }}>
            📦 My Orders
          </Link>
        </div>
      )}

      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </nav>
  );
}