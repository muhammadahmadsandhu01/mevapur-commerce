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
  const src =
    variant === 'symbol'
      ? branding.symbolPath
      : theme === 'dark'
        ? branding.logoDarkPath
        : theme === 'light'
          ? branding.logoLightPath
          : branding.logoPath;
  const width = variant === 'symbol' ? height : Math.round(height * 5.5);

  const image = (
    <Image
      src={src}
      alt={branding.siteName}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );

  if (!href) return image;

  return (
    <Link href={href} className={`inline-flex items-center no-underline ${className}`}>
      {image}
    </Link>
  );
}
