import Link from 'next/link';
import { FileText, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#0b132b] py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
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
      </div>
    </main>
  );
}
