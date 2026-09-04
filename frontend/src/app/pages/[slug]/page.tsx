'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, FileText, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { getContentBySlug } from '@/services/content.service';
import SafeContentRenderer from '@/components/content/SafeContentRenderer';
import type { ContentItem } from '@/types/content';

export default function CMSDynamicPage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : '';

  const [page, setPage] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const fetchPage = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const result = await getContentBySlug(slug);
      if (!result || !result.isActive) {
        setIsNotFound(true);
      } else {
        setPage(result);
      }
    } catch {
      setError('Unable to load page content at this time. Please check your connection or try again.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchPage(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchPage]);

  // Update document title for client-side navigation
  useEffect(() => {
    if (page?.title) {
      document.title = `${page.seo?.metaTitle || page.title} - MevaPur`;
    }
  }, [page]);

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#0b132b] py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center space-x-2 text-xs sm:text-sm text-slate-700">
            <li>
              <Link href="/" className="hover:text-[#b45309] font-medium transition-colors">
                Home
              </Link>
            </li>
            <li>
              <ChevronRight size={14} className="text-slate-600" aria-hidden="true" />
            </li>
            <li>
              <span className="text-slate-700">Pages</span>
            </li>
            {page?.title && (
              <>
                <li>
                  <ChevronRight size={14} className="text-slate-600" aria-hidden="true" />
                </li>
                <li className="font-bold text-[#0b132b] truncate max-w-[200px] sm:max-w-xs" aria-current="page">
                  {page.title}
                </li>
              </>
            )}
          </ol>
        </nav>

        {/* Loading Skeleton */}
        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm animate-pulse">
            <div className="h-8 w-2/3 bg-slate-200 rounded mb-4" />
            <div className="h-4 w-1/3 bg-slate-200 rounded mb-8" />
            <div className="space-y-3">
              <div className="h-4 bg-slate-200 rounded w-full" />
              <div className="h-4 bg-slate-200 rounded w-5/6" />
              <div className="h-4 bg-slate-200 rounded w-4/6" />
              <div className="h-4 bg-slate-200 rounded w-full" />
              <div className="h-4 bg-slate-200 rounded w-3/4" />
            </div>
          </div>
        )}

        {/* 404 Not Found State */}
        {!loading && isNotFound && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 sm:p-12 text-center shadow-sm">
            <FileText size={48} className="mx-auto text-slate-500 mb-4" />
            <h1 className="text-2xl font-bold text-[#0b132b] mb-2">Page Not Found</h1>
            <p className="text-sm text-slate-700 max-w-md mx-auto mb-6">
              The page you are looking for does not exist, is in draft mode, or is not currently published.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-md bg-[#0b132b] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                <ArrowLeft size={16} /> Return to Storefront
              </Link>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-md border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition"
              >
                Browse Catalogue
              </Link>
            </div>
          </div>
        )}

        {/* Outage / Server Error State */}
        {!loading && error && !isNotFound && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-6 sm:p-8 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle size={22} className="text-amber-800 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-amber-900">Unable to load page</h2>
                <p className="mt-1 text-sm text-amber-900">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchPage()}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition"
                >
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        {!loading && page && (
          <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm">
            <header className="border-b border-slate-200 pb-6 mb-8">
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#0b132b]">
                {page.title}
              </h1>
              {page.subtitle && (
                <p className="mt-2 text-base sm:text-lg text-slate-700 font-medium">
                  {page.subtitle}
                </p>
              )}
              {page.updatedAt && (
                <p className="mt-3 text-xs text-slate-600 font-medium">
                  Last updated: {new Date(page.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </header>

            <SafeContentRenderer content={page.content} />
          </article>
        )}
      </div>
    </main>
  );
}
