'use client';

import {
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from 'react';
import Link from 'next/link';
import Image from 'next/image';
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

interface SearchAutocompleteProps {
  query: string;
  onSelect: () => void;
  onClose: () => void;
}

const RECENT_SEARCHES_KEY = 'mevapur-recent-searches';
const MAX_RECENT_SEARCHES = 5;

export default function SearchAutocomplete({
  query,
  onSelect,
  onClose,
}: SearchAutocompleteProps) {

  const {
    suggestions,
    loading,
    error,
  } = useSearchWithDebounce(query);

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

    // Load recent searches
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);

    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
      }
    }
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

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, [onClose]);

  // Save recent search
  const saveRecentSearch = (text: string) => {
    const updated = [
      text,
      ...recentSearches.filter((item) => item !== text),
    ].slice(0, MAX_RECENT_SEARCHES);

    setRecentSearches(updated);

    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(updated)
    );
  };

  // Clear recent searches
  const clearRecentSearches = (
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();

    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  // Select product
  const handleSelect = (
    product: SearchSuggestion
  ) => {
    saveRecentSearch(product.name);
    onSelect();
  };

  // Keyboard navigation
  const handleKeyDown = (
    e: KeyboardEvent<HTMLDivElement>
  ) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, suggestions.length - 1)
        );
        break;

      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.max(prev - 1, 0)
        );
        break;

      case "Escape":
        onClose();
        break;

      case "Enter":
        if (
          selectedIndex >= 0 &&
          suggestions[selectedIndex]
        ) {
          e.preventDefault();
          handleSelect(suggestions[selectedIndex]);
        }
        break;
    }
  };

    // Don't render anything if nothing to show
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
      className="absolute left-0 right-0 top-full mt-2 z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
      onKeyDown={handleKeyDown}
      role="listbox"
      aria-label="Search suggestions"
    >
      <ul role="listbox" className="max-h-96 overflow-y-auto">

        {/* Loading */}
        {loading && (
          <li className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Searching...
          </li>
        )}

        {/* Error */}
        {!loading && error && (
          <li className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            {error}
          </li>
        )}

        {/* Suggestions */}
        {!loading &&
          !error &&
          suggestions.map((item, index) => (
            <li key={item._id}>
              <Link
                href={`/products/${item.slug}`}
                onClick={() => handleSelect(item)}
                role="option"
                aria-selected={selectedIndex === index}
                id={`search-option-${index}`}
                className={`flex items-center gap-3 px-4 py-3 transition hover:bg-teal-50 ${
                  selectedIndex === index
                    ? "bg-teal-50"
                    : ""
                }`}
              >
                <div className="relative w-10 h-10 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                  <Image
                    src={item.image || "/placeholder.png"}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-gray-900">
                    {item.name}
                  </p>

                  <p className="text-xs text-gray-500">
                    {item.category?.name ?? "Product"}
                  </p>
                </div>

                <div className="font-semibold text-teal-700 whitespace-nowrap">
                  Rs {item.price.toLocaleString()}
                </div>
              </Link>
            </li>
          ))}

                  {/* No Results */}
        {!loading &&
          !error &&
          query.trim().length >= 2 &&
          suggestions.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500">
              No products found for{" "}
              <span className="font-medium">&quot;{query}&quot;</span>
            </li>
          )}

        {/* Recent Searches */}
        {!loading &&
          !error &&
          query.trim().length < 2 &&
          recentSearches.length > 0 && (
            <>
              <li className="flex items-center justify-between bg-gray-50 px-4 py-2 border-t border-b">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
                  <Clock className="w-3 h-3" />
                  Recent Searches
                </div>

                <button
                  onClick={clearRecentSearches}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Clear All
                </button>
              </li>

              {recentSearches.map((item, index) => (
                <li key={index}>
                  <Link
                    href={`/products?keyword=${encodeURIComponent(item)}`}
                    onClick={onSelect}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <Clock className="w-4 h-4 text-gray-400" />

                    <span className="text-gray-700">
                      {item}
                    </span>
                  </Link>
                </li>
              ))}
            </>
          )}
      </ul>
    </div>
  );
}
