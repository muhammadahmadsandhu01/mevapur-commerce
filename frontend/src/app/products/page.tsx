'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import ProductCard from '@/components/products/ProductCard';
import ProductFilters from '@/components/products/ProductFilters';
import RecentlyViewed from '@/components/products/RecentlyViewed';
import RecommendedProducts from '@/components/products/RecommendedProducts';
import PromotionalBanner from '@/components/products/PromotionalBanner';
import { getProducts, getCategories } from '@/lib/api';
import type { Product, Category, PaginationMeta } from '@/types/product';

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pages: 1,
    total: 0,
    limit: 12,
    hasNext: false,
    hasPrev: false,
  });

  const keywordFromUrl = searchParams.get('keyword') || '';
  const [searchInput, setSearchInput] = useState(keywordFromUrl);

  // Synchronize local search input when URL changes via Back/Forward
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchInput(keywordFromUrl);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [keywordFromUrl]);

  // Fetch Categories for Breadcrumbs & Filters
  useEffect(() => {
    let isMounted = true;
    getCategories().then((cats) => {
      if (isMounted) setCategories(cats);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch products whenever search params change
  useEffect(() => {
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setLoading(true);
    }, 0);

    const category = searchParams.get('category') || undefined;
    const subcategory = searchParams.get('subcategory') || undefined;
    const brand = searchParams.get('brand') || undefined;
    const minPrice = searchParams.get('minPrice') || undefined;
    const maxPrice = searchParams.get('maxPrice') || undefined;
    const rating = searchParams.get('rating') || undefined;
    const inStock = searchParams.get('inStock') || undefined;
    const sortBy = searchParams.get('sortBy') || 'newest';
    const page = searchParams.get('page') || '1';
    const keyword = searchParams.get('keyword') || undefined;

    getProducts({
      category,
      subcategory,
      brand,
      minPrice,
      maxPrice,
      rating,
      inStock,
      sortBy,
      page,
      keyword,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setProducts(res.data);
          setPagination(res.pagination);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error('Error loading products:', err);
          setProducts([]);
          setLoading(false);
        }
      });

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = searchInput.trim();
    if (trimmed) {
      params.set('keyword', trimmed);
    } else {
      params.delete('keyword');
    }
    params.set('page', '1');
    startTransition(() => {
      router.push(`/products?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    startTransition(() => {
      router.push(`/products?${params.toString()}`);
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sortBy', e.target.value);
    params.set('page', '1');
    startTransition(() => {
      router.push(`/products?${params.toString()}`);
    });
  };

  const removeActiveFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.set('page', '1');
    startTransition(() => {
      router.push(`/products?${params.toString()}`);
    });
  };

  const getCategoryName = (idOrSlug: string) => {
    if (!idOrSlug) return '';
    const cat = categories.find((c) => c._id === idOrSlug || c.slug === idOrSlug);
    return cat ? cat.name : idOrSlug;
  };

  const categoryParam = searchParams.get('category') || '';
  const subcategoryParam = searchParams.get('subcategory') || '';
  const keywordParam = searchParams.get('keyword') || '';

  const pageHeading = keywordParam
    ? `Search: "${keywordParam}"`
    : subcategoryParam
      ? getCategoryName(subcategoryParam)
      : categoryParam
        ? getCategoryName(categoryParam)
        : 'All Products';

  const activeFilters = Array.from(searchParams.entries()).filter(
    ([key]) => key !== 'page' && key !== 'sortBy' && key !== 'keyword'
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <PromotionalBanner />

      {/* Sticky Header with Breadcrumb, Search, and Sort */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav aria-label="Breadcrumb" className="flex text-sm text-slate-600 mb-3 flex-wrap items-center gap-1.5">
            <Link href="/" className="hover:text-[#ff8a00] font-medium text-slate-900">Home</Link>
            <span className="text-slate-500">/</span>
            {categoryParam ? (
              <>
                <Link href={`/products?category=${encodeURIComponent(categoryParam)}`} className="hover:text-[#ff8a00] text-slate-700">
                  {getCategoryName(categoryParam)}
                </Link>
                {subcategoryParam && (
                  <>
                    <span className="text-slate-500">/</span>
                    <span className="text-slate-900 font-semibold" aria-current="page">
                      {getCategoryName(subcategoryParam)}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-slate-900 font-semibold" aria-current="page">All Products</span>
            )}
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{pageHeading}</h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                {loading ? (
                  <span className="animate-pulse">Loading products...</span>
                ) : pagination.total === 0 ? (
                  'No products found'
                ) : (
                  `Showing ${((pagination.page - 1) * pagination.limit) + 1}–${Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  )} of ${pagination.total} products`
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72" role="search">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input
                  type="text"
                  placeholder="Search catalogue..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#ff8a00] focus:border-transparent outline-none bg-white text-slate-900"
                  aria-label="Search catalogue"
                />
              </form>

              <select
                onChange={handleSortChange}
                value={searchParams.get('sortBy') || 'newest'}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 font-medium focus:ring-2 focus:ring-[#ff8a00] outline-none cursor-pointer"
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

          {/* Active Filter Chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4" role="list" aria-label="Active filters">
              {activeFilters.map(([key, value]) => (
                <span
                  key={`${key}-${value}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-slate-900 text-xs font-bold rounded-full border border-orange-200"
                >
                  <span className="capitalize">{key}:</span>
                  <span>{key === 'category' ? getCategoryName(value) : value}</span>
                  <button
                    type="button"
                    onClick={() => removeActiveFilter(key)}
                    className="hover:text-red-700 ml-1 p-0.5"
                    aria-label={`Remove ${key} filter`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          <ProductFilters />

          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                    <div className="aspect-square bg-slate-200 rounded-lg mb-4" />
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-slate-200 rounded w-1/2 mb-4" />
                    <div className="h-5 bg-slate-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">No products found</h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                  Try adjusting your search criteria or resetting filters to explore available products.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/products')}
                  className="px-5 py-2.5 bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-bold text-sm rounded-lg shadow-sm transition"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                  {products.map((prod) => (
                    <ProductCard key={prod._id} product={prod} />
                  ))}
                </div>

                {pagination.pages > 1 && (
                  <nav className="flex items-center justify-center gap-2 mt-12" role="navigation" aria-label="Pagination">
                    <button
                      type="button"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={!pagination.hasPrev}
                      className="p-2.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition bg-white"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    {[...Array(pagination.pages)].map((_, i) => {
                      const pageNum = i + 1;
                      if (pageNum === 1 || pageNum === pagination.pages || Math.abs(pageNum - pagination.page) <= 1) {
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => handlePageChange(pageNum)}
                            className={`w-10 h-10 rounded-lg font-bold text-sm transition ${
                              pagination.page === pageNum
                                ? 'bg-[#ff8a00] text-[#0b132b] shadow-sm'
                                : 'border border-slate-300 hover:bg-slate-100 text-slate-700 bg-white'
                            }`}
                            aria-label={`Page ${pageNum}`}
                            aria-current={pagination.page === pageNum ? 'page' : undefined}
                          >
                            {pageNum}
                          </button>
                        );
                      } else if (Math.abs(pageNum - pagination.page) === 2) {
                        return <span key={pageNum} className="text-slate-600 px-1">...</span>;
                      }
                      return null;
                    })}

                    <button
                      type="button"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={!pagination.hasNext}
                      className="p-2.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition bg-white"
                      aria-label="Next page"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </nav>
                )}
              </>
            )}

            {!loading && products.length > 0 && (
              <div className="mt-12 space-y-8">
                <RecentlyViewed />
                <RecommendedProducts />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
          <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-3" />
          <p className="text-slate-600 font-medium">Loading catalog...</p>
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
