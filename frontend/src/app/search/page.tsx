'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import ProductCard from '@/components/products/ProductCard';
import { Search, Filter, SlidersHorizontal } from 'lucide-react';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    minPrice: '',
    maxPrice: '',
    sortBy: 'name'
  });

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        let url = `${process.env.NEXT_PUBLIC_API_URL}/products?search=${query}`;
        
        if (filters.category) url += `&category=${filters.category}`;
        if (filters.minPrice) url += `&minPrice=${filters.minPrice}`;
        if (filters.maxPrice) url += `&maxPrice=${filters.maxPrice}`;
        if (filters.sortBy) url += `&sortBy=${filters.sortBy}`;

        const response = await axios.get(url);
        if (response.data.success) {
          setProducts(response.data.data);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    if (query) {
      fetchProducts();
    }
  }, [query, filters]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '16px' }}>
            Search Results
          </h1>
          
          {/* Search Bar */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={20} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type="text"
                defaultValue={query}
                placeholder="Search products..."
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 44px',
                  border: '2px solid #E5E7EB',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none'
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    router.push(`/search?q=${encodeURIComponent(e.currentTarget.value)}`);
                  }
                }}
              />
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              style={{
                padding: '10px 14px',
                border: '2px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="">All Categories</option>
              <option value="dry-fruits">Dry Fruits</option>
              <option value="nuts">Nuts</option>
              <option value="seeds">Seeds</option>
              <option value="spices">Spices</option>
            </select>

            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
              style={{
                padding: '10px 14px',
                border: '2px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="name">Sort by Name</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="createdAt">Newest First</option>
            </select>

            <input
              type="number"
              placeholder="Min Price"
              value={filters.minPrice}
              onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
              style={{
                padding: '10px 14px',
                border: '2px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '14px',
                width: '120px'
              }}
            />

            <input
              type="number"
              placeholder="Max Price"
              value={filters.maxPrice}
              onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
              style={{
                padding: '10px 14px',
                border: '2px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '14px',
                width: '120px'
              }}
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              border: '5px solid #0F766E',
              borderTop: '5px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <p style={{ color: '#6B7280' }}>Searching products...</p>
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Search size={64} color="#9CA3AF" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
              No Products Found
            </h2>
            <p style={{ color: '#6B7280', marginBottom: '24px' }}>
              Try adjusting your search or filters
            </p>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#0F766E',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Browse All Products
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: '#6B7280', marginBottom: '24px', fontSize: '14px' }}>
              Found {products.length} product{products.length !== 1 ? 's' : ''} for "{query}"
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '24px'
            }}>
              {products.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '5px solid #0F766E',
            borderTop: '5px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ color: '#6B7280' }}>Loading search...</p>
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}