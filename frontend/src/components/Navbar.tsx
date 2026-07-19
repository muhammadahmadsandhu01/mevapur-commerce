'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Search, Menu, X, Package, Heart, LogOut, User, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';
import { getCategories } from '@/lib/api';
import SearchAutocomplete from '@/components/SearchAutocomplete';

interface Category {
  _id: string;
  name: string;
  slug: string;
  children?: Category[];
}

export default function Navbar() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const { items, wishlist } = useCartStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  
  const [mounted, setMounted] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCats();
  }, []);

  useEffect(() => {
    setMounted(true);
    setCartCount(items.length);
    setWishlistCount(wishlist.length);
  }, [items, wishlist]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchQuery.trim();
    if (!keyword) return;
      setIsSearchFocused(false);
      setIsMobileMenuOpen(false);
    router.push(`/products?keyword=${encodeURIComponent(keyword)}`);
    setSearchQuery('');
  };

  const handleLogout = () => {
    logout();
    setToast({ message: '👋 Logged out successfully', type: 'success' });
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* MAIN NAVBAR */}
      <nav className="sticky top-0 z-50 bg-primary-700 shadow-md">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between gap-5">
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span className="text-3xl">🌰</span>
            <span className="text-2xl font-extrabold text-white tracking-tight">MevaPur</span>
          </Link>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-xl">

            <form
              onSubmit={handleSearch}
              className="flex rounded-lg overflow-visible border-2 border-secondary-500"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => {
                  setTimeout(() => {
                    setIsSearchFocused(false);
                  }, 150);
                }}
                placeholder="Search dry fruits, nuts, dates..."
                className="flex-1 px-4 py-2.5 border-none outline-none text-sm"
                aria-label="Search products"
                aria-controls="search-suggestions"
                aria-expanded={isSearchFocused && searchQuery.trim().length >= 2}
              />

              <button
                type="submit"
                className="bg-secondary-500 border-none px-4 cursor-pointer flex items-center justify-center"
              >
                <Search size={20} color="white" />
              </button>
            </form>

            {isSearchFocused && (
              <SearchAutocomplete
                query={searchQuery}
                onSelect={() => {
                  setIsSearchFocused(false);
                  setIsMobileMenuOpen(false);
                  setSearchQuery('');
                }}
                onClose={() => setIsSearchFocused(false)}
              />
            )}

          </div>

          {/* Right Section */}
          <div className="flex items-center gap-5 text-white">
            <Link href="/wishlist" className="relative no-underline text-white flex items-center">
              <Heart size={22} />
              {mounted && wishlistCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs font-bold flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs opacity-80">Hello,</div>
                  <div className="text-sm font-semibold">{user?.fullName?.split(' ')[0] || 'User'}</div>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 bg-white/15 text-white border border-white/30 rounded-lg cursor-pointer font-semibold text-sm flex items-center gap-1.5">
                  <LogOut size={14} /> Logout
                </button>
              </div>
            ) : (
              <Link href="/login" className="cursor-pointer text-right no-underline text-white">
                <div className="text-xs opacity-80">Hello, Sign in</div>
                <div className="text-sm font-semibold">Account</div>
              </Link>
            )}

            <Link href="/orders" className="cursor-pointer text-right no-underline text-white">
              <div className="text-xs opacity-80">Track</div>
              <div className="text-sm font-semibold flex items-center gap-1">
                <Package size={14} /> My Orders
              </div>
            </Link>

            <Link href="/cart" className="cursor-pointer relative flex items-center gap-1 no-underline text-white">
              <ShoppingCart size={24} />
              {mounted && cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-secondary-500 text-primary-700 rounded-full w-5 h-5 text-sm font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
              <span className="font-semibold">Cart</span>
            </Link>

            <button className="bg-transparent border-none text-white cursor-pointer md:hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="bg-white p-5 flex flex-col gap-4 md:hidden">
            <form onSubmit={handleSearch}>
              <div className="flex border-2 border-gray-200 rounded-lg overflow-hidden">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products..." className="flex-1 px-4 py-3 border-none outline-none text-sm" />
                <button type="submit" className="bg-primary-700 border-none px-4 cursor-pointer text-white flex items-center">
                  <Search size={20} />
                </button>
              </div>
            </form>
            <Link href="/products" className="text-gray-700 no-underline font-semibold p-3 bg-gray-100 rounded-lg flex items-center gap-2">
              <Menu size={16} /> All Categories
            </Link>
            {isAuthenticated ? (
              <button onClick={handleLogout} className="p-3 bg-red-100 text-red-700 border-none rounded-lg cursor-pointer font-semibold text-sm flex items-center justify-center gap-2">
                <LogOut size={16} /> Logout
              </button>
            ) : (
              <Link href="/login" className="text-gray-700 no-underline font-semibold p-3 bg-gray-100 rounded-lg flex items-center justify-center gap-2">
                <User size={16} /> Sign In
              </Link>
            )}
            <Link href="/cart" className="text-gray-700 no-underline font-semibold">🛒 Cart {mounted && cartCount > 0 ? `(${cartCount})` : ''}</Link>
            <Link href="/wishlist" className="text-gray-700 no-underline font-semibold">❤️ Wishlist {mounted && wishlistCount > 0 ? `(${wishlistCount})` : ''}</Link>
            <Link href="/orders" className="text-gray-700 no-underline font-semibold">📦 My Orders</Link>
          </div>
        )}
      </nav>

      {/* MEGA MENU BAR - Desktop Only (FIXED: hidden md:block instead of inline styles) */}
      <div className="hidden md:block bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-5 flex items-center gap-8 h-12">
          
          {/* All Categories Button */}
          <div 
            className="flex items-center gap-2 cursor-pointer font-bold text-primary-700 text-sm h-full relative"
            onMouseEnter={() => setActiveCategory('all')}
            onMouseLeave={() => setActiveCategory(null)}
          >
            <Menu size={18} /> All Categories <ChevronDown size={16} />
            
            {activeCategory === 'all' && !loadingCategories && (
              <div className="absolute top-full left-0 bg-white shadow-lg rounded-b-lg z-[9999] min-w-[250px] border border-gray-200 border-t-0 pt-2">
                {categories.map(cat => (
                  <Link key={cat._id} href={`/products?category=${cat.slug}`} 
                    className="block px-5 py-3 text-gray-700 no-underline text-sm hover:bg-teal-50 transition-colors"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Category Links */}
          {!loadingCategories && categories.slice(0, 6).map(cat => (
            <div key={cat._id} className="relative h-full flex items-center"
              onMouseEnter={() => setActiveCategory(cat._id)}
              onMouseLeave={() => setActiveCategory(null)}
            >
              <Link href={`/products?category=${cat.slug}`} className="text-gray-700 no-underline text-sm font-medium hover:text-primary-700 transition-colors">
                {cat.name}
              </Link>

              {activeCategory === cat._id && cat.children && cat.children.length > 0 && (
                <div className="absolute top-full left-0 bg-white shadow-lg rounded-b-lg z-[9999] min-w-[200px] border border-gray-200 border-t-0 py-2">
                  {cat.children.map(sub => (
                    <Link key={sub._id} href={`/products?category=${cat.slug}&subcategory=${sub.slug}`} 
                      className="block px-5 py-2.5 text-gray-600 no-underline text-sm hover:bg-teal-50 hover:text-primary-700 hover:pl-6 transition-all"
                    >
                      {sub.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          <Link href="/products" className="ml-auto text-red-500 no-underline text-sm font-bold flex items-center gap-1">
            🔥 Flash Deals
          </Link>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}