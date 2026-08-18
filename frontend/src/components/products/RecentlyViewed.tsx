'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import ProductCard from './ProductCard';
import { Clock } from 'lucide-react';
import type { Product } from '@/types/product';

export default function RecentlyViewed() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentlyViewed = async () => {
      const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
      if (viewed.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/products/recently-viewed?ids=${viewed.join(',')}`
        );
        if (data.success) {
          setProducts(data.data);
        }
      } catch (error) {
        console.error('Error fetching recently viewed:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentlyViewed();
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex items-center gap-2 mb-6">
        <Clock size={24} className="text-[#ff8a00]" />
        <h2 className="text-2xl font-bold text-gray-900">Recently Viewed</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map(product => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
}

