'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCategories } from '@/lib/api';

interface Category {
  _id: string;
  name: string;
  slug: string;
  image?: string;
  description?: string;
  isFeatured?: boolean;
  children?: Category[];
}

export default function MegaMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Error fetching categories:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  if (loading) return null;

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Categories Dropdown */}
          <div className="flex space-x-8">
            {categories.map((category) => (
              <div
                key={category._id}
                className="relative"
                onMouseEnter={() => setActiveCategory(category._id)}
                onMouseLeave={() => setActiveCategory(null)}
              >
                <Link
                  href={`/products/category/${category.slug}`}
                  className="text-gray-700 hover:text-teal-700 px-3 py-2 text-sm font-medium transition-colors"
                >
                  {category.name}
                </Link>

                {/* Mega Menu Dropdown */}
                {activeCategory === category._id && category.children && category.children.length > 0 && (
                  <div className="absolute left-0 top-full w-screen max-w-6xl bg-white shadow-xl border-t border-gray-100 z-50">
                    <div className="grid grid-cols-4 gap-8 p-8">
                      {/* Category Info */}
                      <div className="col-span-1">
                        {category.image && (
                          <img
                            src={category.image}
                            alt={category.name}
                            className="w-full h-48 object-cover rounded-lg mb-4"
                          />
                        )}
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{category.name}</h3>
                        <p className="text-sm text-gray-600">{category.description}</p>
                        <Link
                          href={`/products/category/${category.slug}`}
                          className="inline-block mt-4 text-teal-700 hover:text-teal-800 text-sm font-medium"
                        >
                          View All →
                        </Link>
                      </div>

                      {/* Subcategories */}
                      <div className="col-span-3">
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">
                          Shop by {category.name}
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                          {category.children.map((subcat) => (
                            <Link
                              key={subcat._id}
                              href={`/products/category/${category.slug}?sub=${subcat.slug}`}
                              className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                            >
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 group-hover:text-teal-700">
                                  {subcat.name}
                                </div>
                              </div>
                              <svg
                                className="w-5 h-5 text-gray-400 group-hover:text-teal-700"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Brands Link */}
          <div className="flex items-center space-x-6">
            <Link
              href="/brands"
              className="text-gray-700 hover:text-teal-700 text-sm font-medium"
            >
              Brands
            </Link>
            <Link
              href="/deals"
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              🔥 Deals
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}