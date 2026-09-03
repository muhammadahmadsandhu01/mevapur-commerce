'use client';

import { useState, useEffect } from 'react';
import ProductCard from './ProductCard';
import { Sparkles } from 'lucide-react';
import type { Product } from '@/types/product';
import { getRecommendedProducts } from '@/lib/api';

export default function RecommendedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    getRecommendedProducts(8, controller.signal)
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
    <section className="mt-12" aria-label="Featured and recommended products">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles size={20} className="text-[#ff8a00]" />
        <h2 className="text-xl font-bold text-slate-900">Featured & Recommended</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
}
