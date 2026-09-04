'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react';
import { getPublicContent } from '@/services/content.service';
import { getSafeNavigationUrl } from '@/lib/navigation';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';
import { branding } from '@/config/branding';
import type { ContentItem } from '@/types/content';

export default function Hero() {
  const [sliders, setSliders] = useState<ContentItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    getPublicContent('slider')
      .then((items) => {
        if (mounted) {
          setSliders(items);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setSliders([]);
          setLoaded(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const total = sliders.length;

  const nextSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (total <= 1) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    }
  };

  // Auto-advance timer
  useEffect(() => {
    if (total <= 1 || !isPlaying || isHovered || isFocused) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const interval = setInterval(nextSlide, 7000);
    return () => clearInterval(interval);
  }, [total, isPlaying, isHovered, isFocused, nextSlide]);

  // If dynamic sliders exist, render dynamic accessible slider
  if (loaded && total > 0) {
    const current = sliders[currentIndex];
    const safeCta = current.button?.link ? getSafeNavigationUrl(current.button.link) : getSafeNavigationUrl('/products');
    const safeImage = current.image ? getSafeMediaUrl(current.image, '') : '';

    return (
      <section
        ref={sliderContainerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured highlights"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="relative bg-[#0b132b] text-white border-b border-slate-700 outline-none focus:ring-2 focus:ring-[#ff8a00] focus:ring-offset-2 focus:ring-offset-[#0b132b]"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid gap-8 items-center lg:grid-cols-[1.2fr_.8fr]">
            <div
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${currentIndex + 1} of ${total}`}
              className="max-w-2xl"
            >
              {current.subtitle && (
                <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-[#ffb45a] uppercase">
                  {current.subtitle}
                </p>
              )}
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl text-white">
                {current.title}
              </h1>
              {current.description && (
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
                  {current.description}
                </p>
              )}
              <div className="mt-7 flex flex-wrap gap-3 items-center">
                {safeCta && (
                  safeCta.isExternal || safeCta.isAction ? (
                    <a
                      href={safeCta.url}
                      target={safeCta.target}
                      rel={safeCta.rel}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#ff8a00] px-5 py-3 text-sm font-bold text-[#0b132b] transition hover:bg-[#ffab45] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0b132b]"
                    >
                      <ShoppingBag size={18} aria-hidden="true" />
                      {current.button?.text || 'Explore now'}
                    </a>
                  ) : (
                    <Link
                      href={safeCta.url}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#ff8a00] px-5 py-3 text-sm font-bold text-[#0b132b] transition hover:bg-[#ffab45] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0b132b]"
                    >
                      <ShoppingBag size={18} aria-hidden="true" />
                      {current.button?.text || 'Explore now'}
                    </Link>
                  )
                )}
                <Link
                  href="/products"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-500 px-5 py-3 text-sm font-semibold text-white transition hover:border-white focus:outline-none focus:ring-2 focus:ring-white"
                >
                  Browse all <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>
            </div>

            {/* Slide Visual / Image Container */}
            <div className="relative flex justify-center items-center">
              {safeImage ? (
                <div className="relative w-full max-w-md aspect-[4/3] rounded-xl overflow-hidden bg-slate-800 shadow-2xl border border-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={safeImage}
                    alt={current.title}
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                </div>
              ) : (
                <div className="w-full max-w-md p-6 rounded-xl border border-slate-700 bg-white/5 backdrop-blur-sm">
                  <p className="text-xs font-semibold tracking-wider text-[#ffb45a] uppercase">Catalogue Highlight</p>
                  <p className="mt-2 text-lg font-bold text-white">{current.title}</p>
                  <p className="mt-2 text-sm text-slate-300">{current.description || branding.shortDescription}</p>
                </div>
              )}
            </div>
          </div>

          {/* Slider Controls */}
          {total > 1 && (
            <div className="mt-8 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              {/* Pagination Dots */}
              <div className="flex items-center gap-2" role="tablist" aria-label="Slide Selection">
                {sliders.map((s, idx) => (
                  <button
                    key={s._id || idx}
                    type="button"
                    role="tab"
                    aria-selected={idx === currentIndex}
                    aria-label={`Go to slide ${idx + 1}: ${s.title}`}
                    onClick={() => goToSlide(idx)}
                    className={`h-2.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-white ${
                      idx === currentIndex ? 'w-8 bg-[#ff8a00]' : 'w-2.5 bg-slate-600 hover:bg-slate-400'
                    }`}
                  />
                ))}
              </div>

              {/* Navigation & Pause/Play Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label={isPlaying ? 'Pause slide rotation' : 'Resume slide rotation'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  type="button"
                  onClick={prevSlide}
                  className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="Previous slide"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs text-slate-400 font-mono px-1">
                  {currentIndex + 1} / {total}
                </span>
                <button
                  type="button"
                  onClick={nextSlide}
                  className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="Next slide"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Fallback: Truthful Brand Hero configured from branding
  return (
    <section className="border-b border-slate-200 bg-[#0b132b] text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.25fr_.75fr] lg:px-8 lg:py-14">
        <div className="max-w-2xl">
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-[#ffb45a] uppercase">{branding.tagline}</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Discover what your catalogue makes possible.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">{branding.shortDescription}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/products"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#ff8a00] px-5 py-3 text-sm font-bold text-[#0b132b] transition hover:bg-[#ffab45] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0b132b]"
            >
              <ShoppingBag size={18} aria-hidden="true" /> Browse catalogue
            </Link>
            <Link
              href="/products"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-500 px-5 py-3 text-sm font-semibold text-white transition hover:border-white focus:outline-none focus:ring-2 focus:ring-white"
            >
              Find a product <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            ['Catalogue-led', 'Browse currently active products.'],
            ['Market-aware', 'Eligibility is confirmed at checkout.'],
            ['Account-backed', 'Orders, wishlist and returns stay in one place.'],
          ].map(([title, description]) => (
            <div key={title} className="border border-slate-700 bg-white/5 p-4 rounded-md">
              <p className="font-semibold text-white">{title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-300">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
