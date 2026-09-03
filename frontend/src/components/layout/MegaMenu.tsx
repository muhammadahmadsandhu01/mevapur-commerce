'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCategories } from '@/lib/api';
import type { Category } from '@/types/product';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';

export default function MegaMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getCategories()
      .then((data) => {
        if (isMounted) setCategories(data);
      })
      .catch((error) => {
        console.error('Error fetching categories:', error);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || categories.length === 0) return null;

  return (
    <nav aria-label="Mega menu" className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex space-x-6 overflow-x-auto">
            {categories.slice(0, 8).map((category) => (
              <div
                key={category._id}
                className="relative shrink-0"
                onMouseEnter={() => setActiveCategory(category._id)}
                onMouseLeave={() => setActiveCategory(null)}
              >
                <Link
                  href={`/products?category=${encodeURIComponent(category._id)}`}
                  className="text-slate-700 hover:text-[#ff8a00] py-2 text-sm font-semibold transition-colors inline-block"
                >
                  {category.name}
                </Link>

                {activeCategory === category._id && category.description && (
                  <div className="absolute left-0 top-full w-80 bg-white shadow-xl border border-slate-100 rounded-xl p-4 z-50 animate-in fade-in duration-150">
                    {category.image && (
                      <div className="relative w-full h-32 rounded-lg overflow-hidden bg-slate-100 mb-3">
                        <Image
                          src={getSafeMediaUrl(category.image)}
                          alt={category.name}
                          fill
                          sizes="320px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <h3 className="text-sm font-bold text-slate-900 mb-1">{category.name}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{category.description}</p>
                    <Link
                      href={`/products?category=${encodeURIComponent(category._id)}`}
                      className="inline-block mt-3 text-xs font-bold text-[#ff8a00] hover:underline"
                    >
                      Browse {category.name} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center space-x-4 shrink-0 pl-4 border-l border-slate-200">
            <Link
              href="/products"
              className="text-slate-700 hover:text-[#ff8a00] text-xs font-bold uppercase tracking-wider"
            >
              Shop All
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
