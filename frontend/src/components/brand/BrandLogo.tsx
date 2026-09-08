'use client';

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
}

export default function BrandLogo({
  variant = 'horizontal',
  theme = 'light',
  href = '/',
  className = '',
  height = 32,
  priority = false,
}: BrandLogoProps) {
  const isSymbol = variant === 'symbol';
  const src = isSymbol
    ? branding.symbolPath
    : theme === 'light'
      ? branding.logoLightPath
      : theme === 'dark'
        ? branding.logoDarkPath
        : branding.logoPath;

  // Aspect ratio is 5.5:1 (220x40) for horizontal logo, 1:1 (32x32) for symbol
  const width = isSymbol ? height : Math.round(height * 5.5);

  const imageElement = (
    <Image
      src={src}
      alt={branding.siteName}
      width={width}
      height={height}
      priority={priority}
      style={{
        height: `${height}px`,
        width: 'auto',
        maxWidth: '100%',
        objectFit: 'contain',
      }}
      className={`shrink-0 ${className}`}
    />
  );

  if (!href) {
    return <span className="inline-flex items-center">{imageElement}</span>;
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center no-underline focus:outline-hidden focus:ring-2 focus:ring-[#ff8a00] rounded-sm"
    >
      {imageElement}
    </Link>
  );
}
