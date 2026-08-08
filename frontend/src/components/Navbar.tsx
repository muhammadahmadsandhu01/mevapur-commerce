'use client';

import { FormEvent, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Heart, Menu, Package, Search, ShoppingCart, User, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getCategories } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import BrandLogo from '@/components/brand/BrandLogo';
import type { Category } from '@/types/product';

const subscribe = () => () => {};

export default function Navbar() {
  const router = useRouter();
  const { items, wishlist } = useCartStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void getCategories().then((rows) => setCategories(Array.isArray(rows) ? rows.slice(0, 8) : [])).catch(() => setCategories([]));
    return () => controller.abort();
  }, []);

  const submitSearch = useCallback((event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setMenuOpen(false); setQuery('');
    router.push(`/products?keyword=${encodeURIComponent(term)}`);
  }, [query, router]);

  const closeMenu = () => setMenuOpen(false);
  return <header className="sticky top-0 z-50 border-b border-slate-700 bg-[#0b132b] text-white shadow-sm">
    <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
      <BrandLogo theme="light" height={30} />
      <form onSubmit={submitSearch} className="hidden min-w-0 flex-1 md:flex" role="search"><label className="sr-only" htmlFor="global-product-search">Search products</label><input id="global-product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or SKU" className="min-w-0 flex-1 rounded-l-md border-0 px-4 py-2.5 text-sm text-slate-900 outline-none ring-2 ring-transparent focus:ring-[#ff8a00]" /><button type="submit" aria-label="Search products" className="rounded-r-md bg-[#ff8a00] px-4 text-[#0b132b] hover:bg-[#ffab45]"><Search size={19} /></button></form>
      <nav className="ml-auto flex items-center gap-2" aria-label="Primary navigation">
        <Link href={isAuthenticated ? '/account' : '/login'} aria-label="Account" className="hidden rounded-md p-2 hover:bg-white/10 sm:inline-flex"><User size={20} /></Link>
        <Link href="/wishlist" aria-label="Wishlist" className="relative rounded-md p-2 hover:bg-white/10"><Heart size={20} />{mounted && wishlist.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#ff8a00] px-1 text-center text-[10px] font-bold text-[#0b132b]">{wishlist.length}</span>}</Link>
        <Link href="/cart" aria-label="Cart" className="relative rounded-md p-2 hover:bg-white/10"><ShoppingCart size={21} />{mounted && items.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#ff8a00] px-1 text-center text-[10px] font-bold text-[#0b132b]">{items.length}</span>}</Link>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="mobile-navigation" className="rounded-md p-2 hover:bg-white/10 md:hidden"><span className="sr-only">Toggle menu</span>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </nav>
    </div>
    <div className="hidden border-t border-slate-700/80 md:block"><div className="mx-auto flex max-w-7xl items-center gap-5 overflow-x-auto px-4 py-2 text-sm sm:px-6 lg:px-8"><Link href="/products" className="shrink-0 font-semibold text-white hover:text-[#ffb45a]">Shop all</Link>{categories.map((category) => <Link key={category._id} href={`/products?category=${encodeURIComponent(category._id)}`} className="shrink-0 text-slate-200 hover:text-white">{category.name}</Link>)}<Link href="/orders" className="ml-auto inline-flex shrink-0 items-center gap-1 text-slate-200 hover:text-white"><Package size={15} /> Orders</Link></div></div>
    {menuOpen && <div id="mobile-navigation" className="border-t border-slate-700 bg-[#0b132b] px-4 py-4 md:hidden"><form onSubmit={submitSearch} className="mb-4 flex" role="search"><label className="sr-only" htmlFor="mobile-product-search">Search products</label><input id="mobile-product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="min-w-0 flex-1 rounded-l-md px-3 py-2 text-slate-900 outline-none" /><button type="submit" className="rounded-r-md bg-[#ff8a00] px-3 text-[#0b132b]" aria-label="Search"><Search size={18} /></button></form><div className="grid grid-cols-2 gap-2 text-sm"><Link onClick={closeMenu} href="/products" className="rounded bg-white/10 p-3 font-semibold">Shop all</Link><Link onClick={closeMenu} href="/orders" className="rounded bg-white/10 p-3">Orders</Link><Link onClick={closeMenu} href="/wishlist" className="rounded bg-white/10 p-3">Wishlist</Link><Link onClick={closeMenu} href={isAuthenticated ? '/account' : '/login'} className="rounded bg-white/10 p-3">{isAuthenticated ? user?.fullName?.split(' ')[0] || 'Account' : 'Sign in'}</Link></div><div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-700 pt-3">{categories.map((category) => <Link key={category._id} onClick={closeMenu} href={`/products?category=${encodeURIComponent(category._id)}`} className="py-2 text-sm text-slate-200">{category.name}</Link>)}</div>{isAuthenticated && <button type="button" onClick={() => { logout(); closeMenu(); }} className="mt-4 text-sm font-semibold text-[#ffb45a]">Sign out</button>}</div>}
  </header>;
}
