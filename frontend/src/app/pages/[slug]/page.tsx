import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import { cache } from 'react';
import { getContentBySlug } from '@/services/content.service';
import SafeContentRenderer from '@/components/content/SafeContentRenderer';
import CMSOutageRetry from '@/components/content/CMSOutageRetry';
import type { ContentItem } from '@/types/content';

export const dynamic = 'force-dynamic';

// Request-scoped deduplication so generateMetadata and page component share 1 backend fetch
const getCachedPage = cache(async (slug: string): Promise<{ page: ContentItem | null; error: string | null }> => {
  if (!slug) return { page: null, error: null };
  try {
    const page = await getContentBySlug(slug);
    return { page, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[CMS Server Fetch Error] slug="${slug}": ${msg}`);
    return {
      page: null,
      error: 'Unable to load page content at this time. Please check your connection or try again.',
    };
  }
});

interface PageProps {
  params: Promise<{ slug: string }> | { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug || '';
  const { page, error } = await getCachedPage(slug);
  if (error) {
    return {
      title: 'Page Unavailable',
    };
  }
  if (!page || !page.isActive) {
    notFound();
  }
  return {
    title: page.seo?.metaTitle || page.title,
    description: page.seo?.metaDescription || page.subtitle || page.description,
  };
}

export default async function CMSDynamicPage({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug || '';

  const { page, error } = await getCachedPage(slug);

  if (error) {
    return (
      <main className="min-h-screen bg-[#f7f7f5] text-[#0b132b] py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <CMSOutageRetry error={error} />
        </div>
      </main>
    );
  }

  if (!page || !page.isActive) {
    notFound();
  }

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
            {page.title && (
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

        {/* Page Content */}
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
      </div>
    </main>
  );
}
