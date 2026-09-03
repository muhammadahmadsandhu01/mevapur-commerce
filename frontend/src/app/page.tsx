'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Grid3X3, Search, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { getCategories, getTopProducts } from '@/lib/api';
import ProductCard from '@/components/products/ProductCard';
import { branding } from '@/config/branding';
import type { Category, Product } from '@/types/product';

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [categoryRows, topProducts] = await Promise.all([
        getCategories(),
        getTopProducts(8),
      ]);
      setCategories(Array.isArray(categoryRows) ? categoryRows.filter((category: Category) => category.isActive !== false) : []);
      setProducts(topProducts);
    } catch {
      setError('The catalogue could not be loaded. Please try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#0b132b]">
      <section className="border-b border-slate-200 bg-[#0b132b] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.25fr_.75fr] lg:px-8 lg:py-14">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-[#ffb45a]">{branding.tagline}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Discover what your catalogue makes possible.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">{branding.shortDescription}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/products" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#ff8a00] px-5 py-3 text-sm font-bold text-[#0b132b] transition hover:bg-[#ffab45] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0b132b]"><ShoppingBag size={18} /> Browse catalogue</Link>
              <Link href="/products" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-500 px-5 py-3 text-sm font-semibold text-white transition hover:border-white focus:outline-none focus:ring-2 focus:ring-white">Find a product <ArrowRight size={17} /></Link>
            </div>
          </div>
          <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[['Catalogue-led', 'Browse currently active products.'], ['Market-aware', 'Eligibility is confirmed at checkout.'], ['Account-backed', 'Orders, wishlist and returns stay in one place.']].map(([title, description]) => <div key={title} className="border border-slate-700 bg-white/5 p-4"><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-5 text-slate-300">{description}</p></div>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#ff8a00]">DISCOVER</p><h2 className="mt-1 text-2xl font-bold">Browse categories</h2></div><Link href="/products" className="text-sm font-semibold text-[#0b132b] underline underline-offset-4">View all products</Link></div>
        {loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><div className="h-24 animate-pulse bg-slate-200" /><div className="h-24 animate-pulse bg-slate-200" /><div className="h-24 animate-pulse bg-slate-200" /><div className="h-24 animate-pulse bg-slate-200" /></div> : categories.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-8 text-center"><Grid3X3 className="mx-auto text-slate-500" /><h3 className="mt-3 font-semibold">Categories will appear here</h3><p className="mt-1 text-sm text-slate-600">Browse the active catalogue to see what is currently available.</p><Link href="/products" className="mt-4 inline-block font-semibold text-[#0b132b] underline">Browse products</Link></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{categories.slice(0, 12).map((category) => <Link key={category._id} href={`/products?category=${encodeURIComponent(category._id)}`} className="group min-h-28 border border-slate-200 bg-white p-4 transition hover:border-[#ff8a00] focus:outline-none focus:ring-2 focus:ring-[#ff8a00]"><Grid3X3 size={20} className="text-[#ff8a00]" /><h3 className="mt-5 text-sm font-semibold group-hover:underline">{category.name}</h3>{category.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{category.description}</p>}</Link>)}</div>}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#ff8a00]">POPULAR NOW</p><h2 className="mt-1 text-2xl font-bold">Top-rated catalogue products</h2></div><Link href="/products?sortBy=rating" className="text-sm font-semibold text-[#0b132b] underline underline-offset-4">See more</Link></div>
        {error ? <div role="alert" className="border border-amber-300 bg-amber-50 p-5"><p className="font-semibold">{error}</p><button type="button" onClick={() => void load()} className="mt-3 rounded-md bg-[#0b132b] px-4 py-2 text-sm font-semibold text-white">Retry</button></div> : loading ? <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-80 animate-pulse bg-slate-200" />)}</div> : products.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-8 text-center"><h3 className="font-semibold">No featured products are available yet</h3><p className="mt-1 text-sm text-slate-600">The catalogue can still be explored as products are configured.</p></div> : <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{products.map((product) => <ProductCard key={product._id} product={product} />)}</div>}
      </section>

      <section className="border-y border-slate-200 bg-white"><div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:px-8">{[[Search, 'Clear product discovery', 'Search, categories, and supported filters keep browsing focused.'], [Truck, 'Checkout-aware shipping', 'Shipping and delivery expectations are calculated from the configured market.'], [ShieldCheck, 'Account controls', 'Track orders, invoices, returns, wishlist, and notifications securely.']].map(([Icon, title, description]) => { const ItemIcon = Icon as typeof Search; return <div key={title as string} className="flex gap-3"><ItemIcon className="mt-0.5 shrink-0 text-[#ff8a00]" /><div><h3 className="font-semibold">{title as string}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{description as string}</p></div></div>; })}</div></section>
    </main>
  );
}
