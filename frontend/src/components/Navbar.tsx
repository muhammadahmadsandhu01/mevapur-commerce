'use client';

import { FormEvent, useCallback, useEffect, useState, useSyncExternalStore, useRef, KeyboardEvent } from 'react';
import Link from 'next/link';
import { Heart, Menu, Package, Search, ShoppingCart, User, X, ChevronDown, LogOut, MapPin, Star, ShieldCheck, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getCategories } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import BrandLogo from '@/components/brand/BrandLogo';
import SearchAutocomplete from '@/components/SearchAutocomplete';
import type { Category } from '@/types/product';

const subscribe = () => () => {};

export default function Navbar() {
  const router = useRouter();
  const { items, wishlist } = useCartStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [categories, setCategories] = useState<Category[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    getCategories()
      .then((rows) => {
        if (isMounted) setCategories(Array.isArray(rows) ? rows.slice(0, 8) : []);
      })
      .catch(() => {
        if (isMounted) setCategories([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!userDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [userDropdownOpen]);

  const submitSearch = useCallback(
    (event?: FormEvent) => {
      if (event) event.preventDefault();
      const term = query.trim();
      if (!term) return;
      setMenuOpen(false);
      setShowSuggestions(false);
      router.push(`/products?keyword=${encodeURIComponent(term)}`);
    },
    [query, router]
  );

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || query.trim().length < 2) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => prev + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    } else if (e.key === 'Enter') {
      // If a dropdown option is highlighted, find its link and navigate
      if (selectedIndex >= 0) {
        const option = document.getElementById(`search-option-${selectedIndex}`);
        if (option) {
          e.preventDefault();
          (option as HTMLAnchorElement).click();
          setShowSuggestions(false);
          return;
        }
      }
      submitSearch();
    }
  };

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    setUserDropdownOpen(false);
    setMenuOpen(false);
    try {
      await logout();
      router.push('/login?message=Signed+out+successfully');
    } catch {
      router.push('/login');
    }
  };

  return (
    <header className="no-print print-hidden sticky top-0 z-50 border-b border-slate-700 bg-[#0b132b] text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <BrandLogo theme="light" height={30} priority={true} />

        {/* Desktop Search Bar with Autocomplete */}
        <div ref={searchContainerRef} className="relative hidden min-w-0 flex-1 max-w-xl md:block">
          <form onSubmit={submitSearch} className="flex" role="search">
            <label className="sr-only" htmlFor="global-product-search">
              Search products
            </label>
            <input
              id="global-product-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowSuggestions(true);
                setSelectedIndex(-1);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search products, brands, or SKU..."
              className="min-w-0 flex-1 rounded-l-md border-0 px-4 py-2 text-sm text-slate-900 outline-none ring-2 ring-transparent focus:ring-[#ff8a00] bg-white"
              autoComplete="off"
            />
            <button
              type="submit"
              aria-label="Search products"
              className="rounded-r-md bg-[#ff8a00] px-4 text-[#0b132b] hover:bg-[#ffab45] transition flex items-center justify-center font-bold"
            >
              <Search size={18} />
            </button>
          </form>

          {showSuggestions && query.trim().length >= 2 && (
            <SearchAutocomplete
              query={query}
              selectedIndex={selectedIndex}
              onSelect={() => setShowSuggestions(false)}
              onClose={() => setShowSuggestions(false)}
            />
          )}
        </div>

        {/* Primary Nav Controls */}
        <nav className="ml-auto flex items-center gap-2" aria-label="Primary navigation">
          {mounted && isAuthenticated && user ? (
            <div className="relative hidden sm:inline-block" ref={userDropdownRef}>
              <button
                type="button"
                id="header-user-menu-button"
                aria-expanded={userDropdownOpen}
                aria-haspopup="menu"
                aria-label={`User menu for ${user.fullName || user.email}`}
                onClick={() => setUserDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition border border-transparent focus:border-[#ff8a00] focus:outline-none cursor-pointer"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff8a00] text-[#0b132b] font-bold text-xs shrink-0 shadow-xs">
                  {(user.fullName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                </div>
                <span className="max-w-[130px] truncate text-slate-100 font-semibold text-xs">
                  {user.fullName ? user.fullName.split(' ')[0] : 'My Account'}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${userDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {userDropdownOpen && (
                <div
                  id="header-user-dropdown-menu"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="header-user-menu-button"
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-700/80 bg-[#0d162f] p-2 text-white shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-md"
                >
                  <div className="px-3 py-2.5 border-b border-slate-700/60 mb-1.5">
                    <p className="text-xs font-bold text-white truncate">{user.fullName || 'Customer'}</p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
                    {user.role && user.role !== 'customer' && (
                      <span className="mt-1 inline-block rounded-full bg-[#ff8a00]/20 px-2 py-0.5 text-[10px] font-bold text-[#ff8a00] uppercase tracking-wider">
                        {user.role}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5" role="none">
                    <Link
                      href="/account?tab=profile"
                      role="menuitem"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                    >
                      <User size={15} className="text-[#ff8a00]" />
                      <span>Personal Profile</span>
                    </Link>
                    <Link
                      href="/account?tab=addresses"
                      role="menuitem"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                    >
                      <MapPin size={15} className="text-[#ff8a00]" />
                      <span>Address Book</span>
                    </Link>
                    <Link
                      href="/account?tab=orders"
                      role="menuitem"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                    >
                      <Package size={15} className="text-[#ff8a00]" />
                      <span>Orders & Returns</span>
                    </Link>
                    <Link
                      href="/account?tab=reviews"
                      role="menuitem"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                    >
                      <Star size={15} className="text-[#ff8a00]" />
                      <span>My Reviews</span>
                    </Link>
                    <Link
                      href="/account?tab=security"
                      role="menuitem"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                    >
                      <ShieldCheck size={15} className="text-[#ff8a00]" />
                      <span>Security & Sessions</span>
                    </Link>
                    <Link
                      href="/account?tab=notifications"
                      role="menuitem"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                    >
                      <Bell size={15} className="text-[#ff8a00]" />
                      <span>Notifications</span>
                    </Link>
                  </div>

                  <div className="my-1.5 border-t border-slate-700/60" />

                  <button
                    type="button"
                    role="menuitem"
                    id="header-logout-button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/15 hover:text-red-300 transition text-left cursor-pointer"
                  >
                    <LogOut size={15} />
                    <span>Sign Out / Logout</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              aria-label="Sign in"
              className="hidden rounded-md p-2 hover:bg-white/10 sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white"
            >
              <User size={18} />
              <span className="hidden lg:inline text-xs">Sign In</span>
            </Link>
          )}

          <Link href="/wishlist" aria-label="Wishlist" className="relative rounded-md p-2 hover:bg-white/10">
            <Heart size={20} />
            {mounted && wishlist.length > 0 && (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#ff8a00] px-1 text-center text-[10px] font-bold text-[#0b132b]">
                {wishlist.length}
              </span>
            )}
          </Link>

          <Link href="/cart" aria-label="Cart" className="relative rounded-md p-2 hover:bg-white/10">
            <ShoppingCart size={21} />
            {mounted && items.length > 0 && (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#ff8a00] px-1 text-center text-[10px] font-bold text-[#0b132b]">
                {items.length}
              </span>
            )}
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md p-2 hover:bg-white/10 md:hidden"
          >
            <span className="sr-only">Toggle menu</span>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>
      </div>

      {/* Category Bar */}
      <div className="hidden border-t border-slate-700/80 md:block">
        <div className="mx-auto flex max-w-7xl items-center gap-5 overflow-x-auto px-4 py-2 text-sm sm:px-6 lg:px-8">
          <Link href="/products" className="shrink-0 font-semibold text-white hover:text-[#ffb45a]">
            Shop all
          </Link>
          {categories.map((category) => (
            <Link
              key={category._id}
              href={`/products?category=${encodeURIComponent(category._id)}`}
              className="shrink-0 text-slate-200 hover:text-white"
            >
              {category.name}
            </Link>
          ))}
          <Link
            href="/orders"
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-slate-200 hover:text-white"
          >
            <Package size={15} /> Orders
          </Link>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {menuOpen && (
        <div id="mobile-navigation" className="border-t border-slate-700 bg-[#0b132b] px-4 py-4 md:hidden">
          <form onSubmit={submitSearch} className="mb-4 flex" role="search">
            <label className="sr-only" htmlFor="mobile-product-search">
              Search products
            </label>
            <input
              id="mobile-product-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products"
              className="min-w-0 flex-1 rounded-l-md px-3 py-2 text-slate-900 outline-none bg-white text-sm"
            />
            <button type="submit" className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-r-md bg-[#ff8a00] px-3 text-[#0b132b]" aria-label="Search">
              <Search size={18} />
            </button>
          </form>

          {mounted && isAuthenticated && user ? (
            <div className="mb-3 rounded-xl bg-white/10 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ff8a00] text-[#0b132b] font-bold text-xs shrink-0">
                  {(user.fullName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user.fullName || 'Customer'}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1 shrink-0 p-1.5 cursor-pointer"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          ) : (
            <div className="mb-3">
              <Link
                onClick={closeMenu}
                href="/login"
                className="flex items-center justify-center gap-2 rounded-lg bg-[#ff8a00] p-2.5 text-xs font-bold text-[#0b132b]"
              >
                <User size={16} /> Sign in to your account
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link onClick={closeMenu} href="/products" className="min-h-[44px] flex items-center rounded bg-white/10 p-3 font-semibold">
              Shop all
            </Link>
            <Link onClick={closeMenu} href="/orders" className="min-h-[44px] flex items-center rounded bg-white/10 p-3">
              Orders
            </Link>
            <Link onClick={closeMenu} href="/wishlist" className="min-h-[44px] flex items-center rounded bg-white/10 p-3">
              Wishlist
            </Link>
            <Link
              onClick={closeMenu}
              href={isAuthenticated ? '/account' : '/login'}
              className="min-h-[44px] flex items-center rounded bg-white/10 p-3"
            >
              {isAuthenticated ? 'My Account' : 'Sign in'}
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-700 pt-3">
            {categories.map((category) => (
              <Link
                key={category._id}
                onClick={closeMenu}
                href={`/products?category=${encodeURIComponent(category._id)}`}
                className="py-2.5 text-sm text-slate-200"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
