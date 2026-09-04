'use client';

import { X, SlidersHorizontal, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { getCategories, getBrands } from '@/lib/api';
import type { Category, Brand } from '@/types/product';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';

export default function ProductFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({
    isOpen: isMobileOpen,
    onClose: () => setIsMobileOpen(false),
    containerRef: mobileDrawerRef,
    initialFocusRef: closeButtonRef,
  });

  const [priceRange, setPriceRange] = useState({
    min: searchParams.get('minPrice') || '',
    max: searchParams.get('maxPrice') || '',
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPriceRange({
        min: searchParams.get('minPrice') || '',
        max: searchParams.get('maxPrice') || '',
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const [sections, setSections] = useState<Record<string, boolean>>({
    categories: true,
    brands: true,
    price: true,
    rating: true,
    availability: true,
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    let isMounted = true;
    getCategories().then((data) => {
      if (isMounted) setCategories(data);
    });
    getBrands().then((data) => {
      if (isMounted) setBrands(data);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(key) === value || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set('page', '1');
    router.push(`/products?${params.toString()}`);
  };

  const clearAllFilters = () => {
    router.push('/products');
    setPriceRange({ min: '', max: '' });
  };

  const toggleSection = (section: string) => {
    setSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const activeFiltersCount = Array.from(searchParams.entries()).filter(
    ([key]) => key !== 'page' && key !== 'sortBy' && key !== 'keyword'
  ).length;

  const currentCategory = searchParams.get('category') || '';
  const currentBrand = searchParams.get('brand') || '';
  const currentRating = searchParams.get('rating') || '';
  const currentInStock = searchParams.get('inStock') || '';

  const renderFilterContent = () => (
    <div className="space-y-6">
      {/* Categories */}
      <div className="border-b border-slate-100 pb-5">
        <button
          type="button"
          onClick={() => toggleSection('categories')}
          className="flex items-center justify-between w-full mb-3 text-left font-bold text-slate-900 text-sm"
        >
          <span>Categories</span>
          {sections.categories ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {sections.categories && (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {categories.map((category) => (
              <label key={category._id} className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={currentCategory === category._id}
                  onChange={() => updateFilter('category', category._id)}
                  className="w-4 h-4 text-[#ff8a00] border-slate-300 rounded focus:ring-[#ff8a00]"
                />
                <span className="capitalize">{category.name}</span>
              </label>
            ))}
            {categories.length === 0 && (
              <p className="text-xs text-slate-400">No categories found</p>
            )}
          </div>
        )}
      </div>

      {/* Brands */}
      <div className="border-b border-slate-100 pb-5">
        <button
          type="button"
          onClick={() => toggleSection('brands')}
          className="flex items-center justify-between w-full mb-3 text-left font-bold text-slate-900 text-sm"
        >
          <span>Brands</span>
          {sections.brands ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {sections.brands && (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {brands.map((brand) => (
              <label key={brand._id} className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={currentBrand === brand._id}
                  onChange={() => updateFilter('brand', brand._id)}
                  className="w-4 h-4 text-[#ff8a00] border-slate-300 rounded focus:ring-[#ff8a00]"
                />
                <span>{brand.name}</span>
              </label>
            ))}
            {brands.length === 0 && (
              <p className="text-xs text-slate-400">No brands found</p>
            )}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div className="border-b border-slate-100 pb-5">
        <button
          type="button"
          onClick={() => toggleSection('price')}
          className="flex items-center justify-between w-full mb-3 text-left font-bold text-slate-900 text-sm"
        >
          <span>Price Range (PKR)</span>
          {sections.price ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {sections.price && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={priceRange.min}
                onChange={(e) => setPriceRange((prev) => ({ ...prev, min: e.target.value }))}
                onBlur={(e) => updateFilter('minPrice', e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#ff8a00]"
                aria-label="Minimum price"
              />
              <input
                type="number"
                placeholder="Max"
                value={priceRange.max}
                onChange={(e) => setPriceRange((prev) => ({ ...prev, max: e.target.value }))}
                onBlur={(e) => updateFilter('maxPrice', e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#ff8a00]"
                aria-label="Maximum price"
              />
            </div>
          </div>
        )}
      </div>

      {/* Rating */}
      <div className="border-b border-slate-100 pb-5">
        <button
          type="button"
          onClick={() => toggleSection('rating')}
          className="flex items-center justify-between w-full mb-3 text-left font-bold text-slate-900 text-sm"
        >
          <span>Customer Rating</span>
          {sections.rating ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {sections.rating && (
          <div className="space-y-2">
            {['4', '3', '2', '1'].map((ratingVal) => (
              <label key={ratingVal} className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="rating"
                  checked={currentRating === ratingVal}
                  onChange={() => updateFilter('rating', currentRating === ratingVal ? '' : ratingVal)}
                  onClick={() => {
                    if (currentRating === ratingVal) {
                      updateFilter('rating', '');
                    }
                  }}
                  className="w-4 h-4 text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                />
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={13}
                      className={i < parseInt(ratingVal, 10) ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}
                    />
                  ))}
                  <span className="text-xs text-slate-600 ml-1">& Up</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Stock Availability */}
      <div className="pb-2">
        <button
          type="button"
          onClick={() => toggleSection('availability')}
          className="flex items-center justify-between w-full mb-3 text-left font-bold text-slate-900 text-sm"
        >
          <span>Availability</span>
          {sections.availability ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {sections.availability && (
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-700">
              <input
                type="checkbox"
                checked={currentInStock === 'true'}
                onChange={() => updateFilter('inStock', currentInStock === 'true' ? '' : 'true')}
                className="w-4 h-4 text-[#ff8a00] border-slate-300 rounded focus:ring-[#ff8a00]"
              />
              <span>In Stock Only</span>
            </label>
          </div>
        )}
      </div>

      {/* Clear Button */}
      {activeFiltersCount > 0 && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
        >
          <X size={14} /> Clear All Filters ({activeFiltersCount})
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Filter Button */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 shadow-xs"
        aria-label="Open filter sidebar"
      >
        <SlidersHorizontal size={17} />
        Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
      </button>

      {/* Desktop Filter Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0" aria-label="Catalog filters">
        <div className="sticky top-24 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-slate-900">Filters</h2>
            {activeFiltersCount > 0 && (
              <span className="text-[11px] font-bold text-[#0b132b] bg-orange-100 px-2 py-0.5 rounded-full">
                {activeFiltersCount} active
              </span>
            )}
          </div>
          {renderFilterContent()}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div
          ref={mobileDrawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Filter products"
          className="fixed inset-0 z-50 lg:hidden flex justify-end"
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl p-5 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Filters</h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 hover:bg-slate-100 rounded-full transition"
                aria-label="Close filters"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1">{renderFilterContent()}</div>
          </div>
        </div>
      )}
    </>
  );
}
