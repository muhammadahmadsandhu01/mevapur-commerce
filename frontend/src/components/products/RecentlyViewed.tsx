'use client';

import { useState, useEffect } from 'react';
import ProductCard from './ProductCard';
import { Clock } from 'lucide-react';
import type { Product } from '@/types/product';
import { getRecentlyViewed } from '@/lib/api';

export default function RecentlyViewed() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let viewed: string[] = [];
    try {
      viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    } catch {
      viewed = [];
    }

    if (!Array.isArray(viewed) || viewed.length === 0) {
      const timer = window.setTimeout(() => {
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    getRecentlyViewed(viewed.slice(0, 8), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setProducts(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="mt-12" aria-label="Recently viewed products">
      <div className="flex items-center gap-2 mb-6">
        <Clock size={20} className="text-[#ff8a00]" />
        <h2 className="text-xl font-bold text-slate-900">Recently Viewed</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
}
