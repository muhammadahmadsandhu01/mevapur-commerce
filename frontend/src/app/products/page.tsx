'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/products/ProductCard';
import ProductFilters from '@/components/products/ProductFilters';
import RecentlyViewed from '@/components/products/RecentlyViewed';
import RecommendedProducts from '@/components/products/RecommendedProducts';
import PromotionalBanner from '@/components/products/PromotionalBanner';
import { Search, ChevronLeft, ChevronRight, Loader, X } from 'lucide-react';
import Link from 'next/link';
import api, { getCategories } from "@/lib/api";
import type { Product, Category } from "@/types/product";

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ 
    page: 1, 
    pages: 1, 
    total: 0, 
    limit: 12,
    hasNext: false,
    hasPrev: false
  });
  const [searchQuery, setSearchQuery] = useState(searchParams.get('keyword') || '');
  const currentKeyword = searchParams.get("keyword") || "";

  // Fetch Categories for Breadcrumbs
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    fetchCats();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedQuery = searchQuery.trim();

      // Agar URL already same keyword contain karta hai to kuch mat karo
      if (trimmedQuery === currentKeyword) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());

      if (trimmedQuery) {
        params.set("keyword", trimmedQuery);
      } else {
        params.delete("keyword");
      }

      params.set("page", "1");

      router.push(`/products?${params.toString()}`);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, currentKeyword, router]);

  // Fetch products when URL changes
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/products?${searchParams.toString()}`);
          if (response.data.success) {
              setProducts(response.data.data);
              setPagination({
                  page: response.data.pagination.page,
                  pages: response.data.pagination.pages,
                  total: response.data.pagination.total,
                  limit: response.data.pagination.limit,
                  hasNext: response.data.pagination.hasNext,
                  hasPrev: response.data.pagination.hasPrev,
              });
          }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [searchParams]);

  // Track recently viewed
  useEffect(() => {
    if (products.length > 0) {
      let viewed: string[] = [];
      try {
        viewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
      } catch {
        viewed = [];
      }
      const productIds = products.map(p => p._id);
      const updated = [...new Set([...productIds, ...viewed])].slice(0, 10);
      localStorage.setItem('recentlyViewed', JSON.stringify(updated));
    }
  }, [products]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/products?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sortBy', e.target.value);
    params.set('page', '1');
    router.push(`/products?${params.toString()}`);
  };

  const removeActiveFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.set('page', '1');
    router.push(`/products?${params.toString()}`);
  };

  // Helper to get category name from slug
  const getCategoryName = (slug: string) => {
    if (!slug) return "";
    const cat = categories.find(c => c.slug === slug);
    return cat ? cat.name : slug 
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const categorySlug = searchParams.get('category') || '';
  const subcategorySlug = searchParams.get('subcategory') || '';
  const keyword = searchParams.get('keyword') || '';

  const pageTitle = keyword 
    ? `Search: "${keyword}"` 
    : subcategorySlug 
      ? getCategoryName(subcategorySlug)
      : categorySlug 
        ? getCategoryName(categorySlug)
        : 'All Products';

  const activeFilters = Array.from(searchParams.entries()).filter(
    ([key]) => key !== 'page' && key !== 'sortBy' && key !== 'keyword'
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Promotional Banner */}
      <PromotionalBanner />

      {/* Breadcrumb & Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Dynamic Breadcrumb */}
          <nav className="flex text-sm text-gray-500 mb-4" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-teal-700 transition-colors">Home</Link>
            {categorySlug && (
              <>
                <span className="mx-2">/</span>
                <Link href={`/products?category=${categorySlug}`} className="hover:text-teal-700 transition-colors">
                  {getCategoryName(categorySlug)}
                </Link>
              </>
            )}
            {subcategorySlug && (
              <>
                <span className="mx-2">/</span>
                <span className="text-gray-900 font-medium" aria-current="page">
                  {getCategoryName(subcategorySlug)}
                </span>
              </>
            )}
            {!categorySlug && !keyword && (
              <>
                <span className="mx-2">/</span>
                <span className="text-gray-900 font-medium" aria-current="page">All Products</span>
              </>
            )}
          </nav>
          
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
              <p className="text-gray-500 mt-1">
                {
                  loading ? (
                    <span className="animate-pulse">Loading products...</span>
                  ) : pagination.total === 0 ? (
                    "No products found"
                  ) : (
                    `Showing ${((pagination.page - 1) * pagination.limit) + 1}–${Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )} of ${pagination.total} products`
                  )
                }
              </p>
            </div>

            {/* Search & Sort */}
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search products, brands, SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-700 focus:border-transparent outline-none text-sm shadow-sm"
                  aria-label="Search products"
                />
              </div>
              <select 
                onChange={handleSortChange}
                value={searchParams.get('sortBy') || 'newest'}
                className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-700 outline-none bg-white cursor-pointer shadow-sm"
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 text-sm rounded-full border border-teal-100 animate-in fade-in duration-200"
                >
                  <span className="font-medium capitalize">{key}:</span>
                  <span>{value}</span>
                  <button 
                    onClick={() => removeActiveFilter(key)} 
                    className="hover:text-teal-900 ml-1"
                    aria-label={`Remove ${key} filter`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Filters Sidebar */}
          <ProductFilters />

          {/* Product Grid */}
          <div className="flex-1">
            {loading ? (
              // Skeleton Loading
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                    <div className="aspect-square bg-gray-200 rounded-lg mb-4" />
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
                    <div className="h-5 bg-gray-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              // Empty State
              <div className="text-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="text-7xl mb-6">🔍</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">No products found</h3>
                <p className="text-gray-500 mb-8 max-w-md mx-auto">
                  Try adjusting your filters or search query to find what you're looking for.
                </p>
                <div className="flex gap-4 justify-center">
                  <button 
                    onClick={() => router.push('/products')}
                    className="px-6 py-3 bg-teal-700 text-white rounded-lg font-medium hover:bg-teal-800 transition-colors shadow-sm"
                  >
                    Clear All Filters
                  </button>
                  <Link 
                    href="/"
                    className="px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    Continue Shopping
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {products.map((product) => (
                    <ProductCard key={product._id} product={product} />
                  ))}
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <nav className="flex items-center justify-center gap-2 mt-12" role="navigation" aria-label="Product pagination">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={!pagination.hasPrev}
                      className="p-2.5 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    
                    {[...Array(pagination.pages)].map((_, i) => {
                      const pageNum = i + 1;
                      if (pageNum === 1 || pageNum === pagination.pages || Math.abs(pageNum - pagination.page) <= 1) {
                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={`w-11 h-11 rounded-lg font-medium transition-all ${
                              pagination.page === pageNum 
                                ? 'bg-teal-700 text-white shadow-md' 
                                : 'border border-gray-200 hover:bg-gray-50 text-gray-700'
                            }`}
                            aria-label={`Page ${pageNum}`}
                            aria-current={pagination.page === pageNum ? 'page' : undefined}
                          >
                            {pageNum}
                          </button>
                        );
                      } else if (Math.abs(pageNum - pagination.page) === 2) {
                        return <span key={pageNum} className="text-gray-400 px-2">...</span>;
                      }
                      return null;
                    })}

                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={!pagination.hasNext}
                      className="p-2.5 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      aria-label="Next page"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </nav>
                )}
              </>
            )}

            {/* Recently Viewed & Recommended */}
            {!loading && products.length > 0 && (
              <>
                <RecentlyViewed />
                <RecommendedProducts />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="animate-spin text-teal-700" size={48} />
      </div>
    }>
      <ProductsPageContent />
    </Suspense>
  );
}