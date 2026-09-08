'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { branding } from '@/config/branding';

interface BrandLogoProps {
  variant?: 'horizontal' | 'symbol';
  theme?: 'light' | 'dark';
  href?: string;
  className?: string;
  height?: number;
  priority?: boolean;
  mode?: 'wordmark' | 'image';
}

export default function BrandLogo({
  variant = 'horizontal',
  theme = 'light',
  href = '/',
  className = '',
  height = 32,
  priority = false,
  mode,
}: BrandLogoProps) {
  const [imageError, setImageError] = useState(false);

  // Check if custom image logo mode is explicitly enabled
  const isImageMode = (mode || branding.logoMode) === 'image';
  const customLogoSrc =
    theme === 'dark'
      ? branding.logoDarkPath
      : theme === 'light'
        ? branding.logoLightPath
        : branding.logoPath;

  // Render symbol-only variant
  if (variant === 'symbol') {
    const symbolElement = (
      <Image
        src={branding.symbolPath}
        alt={branding.siteName}
        width={height}
        height={height}
        priority={priority}
        className={`shrink-0 ${className}`}
      />
    );

    if (!href) return symbolElement;

    return (
      <Link
        href={href}
        aria-label={branding.siteName}
        className={`inline-flex items-center justify-center no-underline focus:outline-hidden focus:ring-2 focus:ring-[#ff8a00] rounded-sm ${className}`}
      >
        {symbolElement}
      </Link>
    );
  }

  // Render custom image logo if opted-in and not errored
  if (isImageMode && !imageError && customLogoSrc) {
    const customWidth = Math.round(height * 5.5);
    const customImageElement = (
      <Image
        src={customLogoSrc}
        alt={branding.siteName}
        width={customWidth}
        height={height}
        priority={priority}
        onError={() => setImageError(true)}
        className={`shrink-0 ${className}`}
      />
    );

    if (!href) return customImageElement;

    return (
      <Link
        href={href}
        aria-label={branding.siteName}
        className={`inline-flex items-center no-underline focus:outline-hidden focus:ring-2 focus:ring-[#ff8a00] rounded-sm ${className}`}
      >
        {customImageElement}
      </Link>
    );
  }

  // Default dynamic wordmark: configurable symbol + siteName text token
  const textColorClass =
    theme === 'light'
      ? 'text-[var(--surface,#f7f7f5)] text-slate-100'
      : 'text-[var(--primary,#0b132b)] text-slate-900';
  const fontSizePx = Math.max(13, Math.round(height * 0.58));

  const wordmarkContent = (
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 select-none ${className}`}>
      <Image
        src={branding.symbolPath}
        alt=""
        aria-hidden="true"
        width={height}
        height={height}
        priority={priority}
        className="shrink-0"
      />
      <span
        className={`font-extrabold tracking-wider uppercase font-sans whitespace-nowrap overflow-hidden text-ellipsis leading-none max-w-[160px] sm:max-w-xs md:max-w-sm ${textColorClass}`}
        style={{ fontSize: `${fontSizePx}px` }}
      >
        {branding.siteName}
      </span>
    </span>
  );

  if (!href) {
    return (
      <span className="inline-flex items-center">
        {wordmarkContent}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center no-underline focus:outline-hidden focus:ring-2 focus:ring-[#ff8a00] rounded-sm"
    >
      {wordmarkContent}
    </Link>
  );
}
