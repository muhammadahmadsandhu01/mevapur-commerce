import type { MetadataRoute } from 'next';
import { branding } from '../config/branding.ts';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: branding.siteName,
    short_name: branding.siteName,
    description: branding.shortDescription,
    start_url: '/',
    display: 'standalone',
    background_color: branding.surfaceColor,
    theme_color: branding.primaryColor,
    icons: [
      {
        src: branding.faviconPath,
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: branding.symbolPath,
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
