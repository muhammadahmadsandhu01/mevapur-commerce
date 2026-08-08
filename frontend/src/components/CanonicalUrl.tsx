'use client';

import { usePathname } from 'next/navigation';
import { publicConfig } from '@/config/publicConfig';

export default function CanonicalUrl() {
  const pathname = usePathname();
  const canonicalPath = pathname === '/' ? '' : pathname.replace(/\/+$/, '');

  return (
    <link
      rel="canonical"
      href={`${publicConfig.siteOrigin}${canonicalPath}`}
    />
  );
}
