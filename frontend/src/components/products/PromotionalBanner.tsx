'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { X, Megaphone, ArrowRight } from 'lucide-react';
import { getPublicContent } from '@/services/content.service';
import { getSafeNavigationUrl } from '@/lib/navigation';
import type { ContentItem } from '@/types/content';

export default function PromotionalBanner() {
  const [banners, setBanners] = useState<ContentItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    getPublicContent('banner')
      .then((items) => {
        if (mounted) {
          setBanners(items);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setBanners([]);
          setLoaded(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const total = banners.length;

  const nextBanner = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  useEffect(() => {
    if (total <= 1 || isPaused || !isVisible) return;

    // Respect user's reduced-motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const timer = setInterval(nextBanner, 6000);
    return () => clearInterval(timer);
  }, [total, isPaused, isVisible, nextBanner]);

  if (!loaded || !isVisible || total === 0) {
    return null;
  }

  const current = banners[currentIndex];
  const safeButtonNav = current.button?.link ? getSafeNavigationUrl(current.button.link) : null;

  return (
    <aside
      aria-label="Promotions and announcements"
      className="bg-[#0b132b] text-white py-2.5 px-4 relative overflow-hidden border-b border-slate-700 transition-colors"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center justify-center gap-3 text-center">
          <Megaphone size={16} className="shrink-0 text-[#ffb45a]" aria-hidden="true" />
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm">
            <span className="font-bold text-white">{current.title}</span>
            {current.subtitle && (
              <>
                <span className="hidden sm:inline text-slate-400">•</span>
                <span className="text-slate-300 font-normal">{current.subtitle}</span>
              </>
            )}
            {safeButtonNav && (
              safeButtonNav.isExternal || safeButtonNav.isAction ? (
                <a
                  href={safeButtonNav.url}
                  target={safeButtonNav.target}
                  rel={safeButtonNav.rel}
                  className="inline-flex items-center gap-1 font-semibold text-[#ffb45a] hover:text-white underline ml-1"
                >
                  {current.button?.text || 'Learn more'}
                  <ArrowRight size={13} aria-hidden="true" />
                </a>
              ) : (
                <Link
                  href={safeButtonNav.url}
                  className="inline-flex items-center gap-1 font-semibold text-[#ffb45a] hover:text-white underline ml-1"
                >
                  {current.button?.text || 'Learn more'}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              )
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {total > 1 && (
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline" aria-live="polite">
              {currentIndex + 1}/{total}
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-white/10 rounded-md transition text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Dismiss announcement banner"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
