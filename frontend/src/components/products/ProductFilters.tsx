'use client';

import { X, SlidersHorizontal, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getCategories, getBrands } from "@/lib/api";
import type { Category, Brand } from "@/types/product";

export default function ProductFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  useEffect(() => {
    setPriceRange({
      min: searchParams.get("minPrice") || "",
      max: searchParams.get("maxPrice") || "",
    }); 
  }, [searchParams]);
  const [sections, setSections] = useState<Record<string, boolean>>({
    categories: true,
    brands: true,
    price: true,
    rating: true,
    availability: true,
    discount: false,
    attributes: false,
    delivery: false
  });

  // Sample data - In production, fetch from API
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
      } catch (err) {
        console.error("Category Error:", err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const data = await getBrands();
        setBrands(data);
      } catch (err) {
        console.error("Brand Error:", err);
      }
    };
    fetchBrands();
  }, []);
  const attributes = {
    weight: ['100g', '250g', '500g', '1kg'],
    organic: ['Yes', 'No'],
    imported: ['Yes', 'No']
  };

  const updateFilter = (key: string, value: string, isMulti = false) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (isMulti) {
      const current = params.get(key)?.split(',') || [];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      
      if (updated.length === 0) {
        params.delete(key);
      } else {
        params.set(key, updated.join(','));
      }
    } else {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    
    params.set('page', '1');
    router.push(`/products?${params.toString()}`);
  };

  const clearAllFilters = () => {
    router.push('/products');
    setPriceRange({ min: '', max: '' });
  };

  const toggleSection = (section: string) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const activeFiltersCount = Array.from(searchParams.entries()).filter(
    ([key]) => key !== 'page' && key !== 'sortBy'
  ).length;

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Categories - Multi-select */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('categories')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Categories</h3>
          {sections.categories ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.categories && (
          <div className="space-y-2.5">
            {categories.map(category => (
              <label key={category._id} className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox"
                  checked={(searchParams.get("category") || "")
                    .split(",")
                    .includes(category._id)}
                  onChange={() => updateFilter("category", category._id, true)}
                  className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
                />
                <span className="text-sm text-gray-700 group-hover:text-teal-700 capitalize">
                  {category.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Brands - Multi-select */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('brands')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Brands</h3>
          {sections.brands ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.brands && (
          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {brands.map(brand => (
              <label key={brand._id} className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox"
                  checked={(searchParams.get("brand") || "")
                    .split(",")
                    .includes(brand._id)}
                  onChange={() => updateFilter("brand", brand._id, true)}
                  className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
                />
                <span className="text-sm text-gray-700 group-hover:text-teal-700">
                  {brand.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('price')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Price Range</h3>
          {sections.price ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.price && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input 
                type="number" 
                placeholder="Min" 
                value={priceRange.min}
                onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                onBlur={(e) => updateFilter('minPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-700 focus:border-transparent outline-none"
              />
              <input 
                type="number" 
                placeholder="Max" 
                value={priceRange.max}
                onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                onBlur={(e) => updateFilter('maxPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-700 focus:border-transparent outline-none"
              />
            </div>
            {/* Visual Slider (Optional enhancement) */}
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div className="text-xs font-semibold inline-block text-teal-600">
                  Rs. {priceRange.min || 0}
                </div>
                <div className="text-xs font-semibold inline-block text-teal-600">
                  Rs. {priceRange.max || 10000}
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-teal-200">
                <div 
                  style={{ 
                    width: `${((parseInt(priceRange.min) || 0) / 10000) * 100}%`,
                    marginLeft: '0%'
                  }} 
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-teal-500" 
                />
                <div 
                  style={{ width: `${((parseInt(priceRange.max) || 10000) / 10000) * 100}%` }} 
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-teal-500" 
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rating */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('rating')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Rating</h3>
          {sections.rating ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.rating && (
          <div className="space-y-2.5">
            {['4', '3', '2', '1'].map(rating => (
              <label key={rating} className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="radio" 
                  name="rating"
                  checked={searchParams.get('rating') === rating}
                  onChange={() => updateFilter('rating', rating)}
                  className="w-4 h-4 text-teal-700 border-gray-300 focus:ring-teal-700"
                />
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      size={14} 
                      className={i < parseInt(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} 
                    />
                  ))}
                  <span className="text-sm text-gray-600 ml-1">& Above</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('availability')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Availability</h3>
          {sections.availability ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.availability && (
          <div className="space-y-2.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={searchParams.get('inStock') === 'true'}
                onChange={() => updateFilter('inStock', searchParams.get('inStock') === 'true' ? '' : 'true')}
                className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
              />
              <span className="text-sm text-gray-700">In Stock</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={searchParams.get('inStock') === 'false'}
                onChange={() => updateFilter('inStock', searchParams.get('inStock') === 'false' ? '' : 'false')}
                className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
              />
              <span className="text-sm text-gray-700">Out of Stock</span>
            </label>
          </div>
        )}
      </div>

      {/* Discount */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('discount')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Discount</h3>
          {sections.discount ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.discount && (
          <div className="space-y-2.5">
            {['10', '20', '30', '50'].map(percent => (
              <label key={percent} className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={searchParams.get('discount') === percent}
                  onChange={() => updateFilter('discount', percent)}
                  className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
                />
                <span className="text-sm text-gray-700">{percent}% & Above</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Attributes */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('attributes')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Attributes</h3>
          {sections.attributes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.attributes && (
          <div className="space-y-4">
            {Object.entries(attributes).map(([key, values]) => (
              <div key={key}>
                <h4 className="text-sm font-medium text-gray-700 capitalize mb-2">{key}</h4>
                <div className="space-y-2">
                  {values.map(value => (
                    <label key={value} className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
                      />
                      <span className="text-sm text-gray-700">{value}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delivery Options */}
      <div className="border-b border-gray-100 pb-6">
        <button 
          onClick={() => toggleSection('delivery')}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-gray-900">Delivery Options</h3>
          {sections.delivery ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {sections.delivery && (
          <div className="space-y-2.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={searchParams.get('freeShipping') === 'true'}
                onChange={() => updateFilter('freeShipping', searchParams.get('freeShipping') === 'true' ? '' : 'true')}
                className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
              />
              <span className="text-sm text-gray-700">Free Shipping</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={searchParams.get('expressDelivery') === 'true'}
                onChange={() => updateFilter('expressDelivery', searchParams.get('expressDelivery') === 'true' ? '' : 'true')}
                className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
              />
              <span className="text-sm text-gray-700">Express Delivery</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={searchParams.get('cod') === 'true'}
                onChange={() => updateFilter('cod', searchParams.get('cod') === 'true' ? '' : 'true')}
                className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-700"
              />
              <span className="text-sm text-gray-700">Cash on Delivery</span>
            </label>
          </div>
        )}
      </div>

      {/* Clear Filters Button */}
      {activeFiltersCount > 0 && (
        <button 
          onClick={clearAllFilters}
          className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <X size={16} />
          Clear All Filters ({activeFiltersCount})
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Filter Button */}
      <button 
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:shadow-md transition-shadow"
      >
        <SlidersHorizontal size={18} />
        Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
      </button>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-24 bg-white p-6 rounded-xl border border-gray-100 shadow-sm max-h-[calc(100vh-8rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Filters</h2>
            {activeFiltersCount > 0 && (
              <span className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-1 rounded-full">
                {activeFiltersCount} active
              </span>
            )}
          </div>
          <FilterContent />
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileOpen(false)} 
          />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-white pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Filters</h2>
                <p className="text-sm text-gray-500 mt-1">{activeFiltersCount} filters applied</p>
              </div>
              <button 
                onClick={() => setIsMobileOpen(false)} 
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="mt-6">
              <FilterContent />
            </div>
          </div>
        </div>
      )}
    </>
  );
}