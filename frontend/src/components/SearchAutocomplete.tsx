'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Clock,
  AlertCircle,
} from 'lucide-react';

import {
  SearchSuggestion,
} from '@/lib/api';

import {
  useSearchWithDebounce,
} from '@/hooks/useSearchWithDebounce';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';

interface SearchAutocompleteProps {
  query: string;
  onSelect: () => void;
  onClose: () => void;
  selectedIndex?: number;
}

const RECENT_SEARCHES_KEY = 'storefront-recent-searches';
const LEGACY_RECENT_SEARCHES_KEY = 'mevapur-recent-searches';
const MAX_RECENT_SEARCHES = 5;

export default function SearchAutocomplete({
  query,
  onSelect,
  onClose,
  selectedIndex = -1,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const {
    suggestions,
    loading,
    error,
  } = useSearchWithDebounce(query);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load recent searches
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY) || localStorage.getItem(LEGACY_RECENT_SEARCHES_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setRecentSearches(parsed);
            localStorage.setItem(RECENT_SEARCHES_KEY, stored);
            localStorage.removeItem(LEGACY_RECENT_SEARCHES_KEY);
          }
        } catch {
          localStorage.removeItem(RECENT_SEARCHES_KEY);
          localStorage.removeItem(LEGACY_RECENT_SEARCHES_KEY);
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Save recent search
  const saveRecentSearch = (text: string) => {
    const updated = [
      text,
      ...recentSearches.filter((item) => item !== text),
    ].slice(0, MAX_RECENT_SEARCHES);

    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  // Clear recent searches
  const clearRecentSearches = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const handleProductClick = (product: SearchSuggestion) => {
    saveRecentSearch(product.name);
    onSelect();
    router.push(`/products/${product.slug || product._id}`);
  };

  if (
    !loading &&
    !error &&
    suggestions.length === 0 &&
    query.trim().length < 2 &&
    recentSearches.length === 0
  ) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      id="search-suggestions"
      className="absolute left-0 right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
      role="listbox"
      aria-label="Search suggestions"
    >
      <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
        {/* Loading state */}
        {loading && (
          <li className="flex items-center justify-center gap-2 px-4 py-5 text-xs font-semibold text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-[#ff8a00]" />
            Searching active catalogue...
          </li>
        )}

        {/* Error state */}
        {!loading && error && (
          <li className="flex items-center justify-center gap-2 px-4 py-5 text-xs text-rose-600 font-medium">
            <AlertCircle className="w-4 h-4" />
            {error}
          </li>
        )}

        {/* Suggestions list */}
        {!loading &&
          !error &&
          suggestions.map((item, index) => {
            const isSelected = selectedIndex === index;
            const targetUrl = `/products/${item.slug || item._id}`;
            const img = getSafeMediaUrl(item.image);

            return (
              <li key={item._id}>
                <Link
                  href={targetUrl}
                  onClick={(e) => {
                    e.preventDefault();
                    handleProductClick(item);
                  }}
                  role="option"
                  aria-selected={isSelected}
                  id={`search-option-${index}`}
                  className={`flex items-center gap-3 px-4 py-3 transition ${
                    isSelected ? 'bg-orange-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-md overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                    <Image
                      src={img}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.category?.name || 'Dry Fruits & Nuts'}
                    </p>
                  </div>

                  <div className="font-extrabold text-xs text-[#0b132b] shrink-0">
                    PKR {item.price.toLocaleString()}
                  </div>
                </Link>
              </li>
            );
          })}

        {/* No results */}
        {!loading &&
          !error &&
          query.trim().length >= 2 &&
          suggestions.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-slate-500">
              No matching products found for &ldquo;<strong className="text-slate-800">{query}</strong>&rdquo;
            </li>
          )}

        {/* Recent searches */}
        {!loading &&
          !error &&
          query.trim().length < 2 &&
          recentSearches.length > 0 && (
            <>
              <li className="flex items-center justify-between bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Recent Searches
                </div>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="text-slate-500 hover:text-rose-600 transition font-semibold"
                >
                  Clear
                </button>
              </li>

              {recentSearches.map((item, index) => (
                <li key={index}>
                  <Link
                    href={`/products?keyword=${encodeURIComponent(item)}`}
                    onClick={onSelect}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-xs font-medium text-slate-700 transition"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{item}</span>
                  </Link>
                </li>
              ))}
            </>
          )}
      </ul>
    </div>
  );
}
