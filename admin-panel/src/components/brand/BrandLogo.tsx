import Image from 'next/image';
import Link from 'next/link';
import { branding } from '@/config/branding';

interface BrandLogoProps {
  variant?: 'horizontal' | 'symbol';
  theme?: 'light' | 'dark';
  href?: string;
  height?: number;
}

export default function BrandLogo({
  variant = 'horizontal',
  theme = 'dark',
  href = '/',
  height = 28,
}: BrandLogoProps) {
  const src =
    variant === 'symbol'
      ? branding.symbolPath
      : theme === 'light'
        ? branding.logoLightPath
        : branding.logoDarkPath;
  const width = variant === 'symbol' ? height : Math.round(height * 5.5);

  const image = (
    <Image
      src={src}
      alt={branding.siteName}
      width={width}
      height={height}
      priority
    />
  );

  if (!href) return image;

  return (
    <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
      {image}
    </Link>
  );
}
