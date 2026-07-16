'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import ProductCard from './ProductCard';
import { Sparkles } from 'lucide-react';

export default function RecommendedProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecommended = async () => {
      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/products/recommended?limit=8`
        );
        if (data.success) {
          setProducts(data.data);
        }
      } catch (error) {
        console.error('Error fetching recommended:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommended();
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles size={24} className="text-amber-500" />
        <h2 className="text-2xl font-bold text-gray-900">Recommended For You</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map(product => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
}