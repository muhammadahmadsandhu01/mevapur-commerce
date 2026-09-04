'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProductCard from '@/components/products/ProductCard';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import type { Product, Category, Brand } from '@/types/product';
import { getProducts, getCategories, getBrands } from '@/lib/api';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || searchParams.get('keyword') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(query);

  const selectedCategory = searchParams.get('category') || '';
  const selectedBrand = searchParams.get('brand') || '';
  const selectedSort = searchParams.get('sortBy') || 'newest';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchInput(query);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getCategories(), getBrands()]).then(([cats, brs]) => {
      if (isMounted) {
        setCategories(cats);
        setBrands(brs);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!query.trim() && !selectedCategory && !selectedBrand) {
      const timer = window.setTimeout(() => {
        setProducts([]);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
    }, 0);

    getProducts({
      keyword: query.trim() || undefined,
      category: selectedCategory || undefined,
      brand: selectedBrand || undefined,
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      sortBy: selectedSort || undefined,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setProducts(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error('Search query failed:', err);
          setProducts([]);
          setLoading(false);
        }
      });

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedCategory, selectedBrand, selectedSort, minPrice, maxPrice]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = searchInput.trim();
    if (trimmed) {
      params.set('q', trimmed);
    } else {
      params.delete('q');
    }
    router.push(`/search?${params.toString()}`);
  };

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-4">
            Search Catalogue
          </h1>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex gap-3 mb-4" role="search">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search products by name, SKU, or category..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#ff8a00] bg-white"
                aria-label="Search keyword"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-bold text-sm rounded-lg transition"
            >
              Search
            </button>
          </form>

          {/* Quick Filters */}
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <select
              value={selectedCategory}
              onChange={(e) => updateParam('category', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none cursor-pointer text-sm"
              aria-label="Filter by category"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={selectedBrand}
              onChange={(e) => updateParam('brand', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none cursor-pointer text-sm"
              aria-label="Filter by brand"
            >
              <option value="">All Brands</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              value={selectedSort}
              onChange={(e) => updateParam('sortBy', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none cursor-pointer text-sm"
              aria-label="Sort products"
            >
              <option value="newest">Newest First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
              <option value="best-selling">Best Selling</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-10 h-10 text-[#ff8a00] animate-spin mx-auto mb-3" />
            <p className="text-slate-500 font-medium text-sm">Searching active products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200">
            <AlertCircle size={48} className="text-slate-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">No Products Found</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              {query
                ? `No matching published products found for "${query}". Try another search term.`
                : 'Enter a search term above or browse our full catalogue.'}
            </p>
            <Link
              href="/products"
              className="inline-block px-5 py-2.5 bg-[#0b132b] text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition"
            >
              Browse All Products
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600 mb-6" aria-live="polite">
              Found <strong className="text-slate-900">{products.length}</strong> product{products.length !== 1 ? 's' : ''}
              {query && <span> for &ldquo;<strong>{query}</strong>&rdquo;</span>}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {products.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
          <Loader2 className="w-10 h-10 text-[#ff8a00] animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Loading search interface...</p>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
