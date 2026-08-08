import { publicConfig } from '@/config/publicConfig';
import type { BrandingConfig } from '@/config/brandingTypes';

const BRAND_COLORS = Object.freeze({
  primary: '#0B132B',
  accent: '#FF8A00',
  surface: '#F7F7F5',
  muted: '#6B7280',
});

const emptyContact = '';

/**
 * Customer-replaceable public display values. These are intentionally public
 * and must never contain credentials, legal assurances, or private contacts.
 */
export const branding: BrandingConfig = Object.freeze({
  siteName: publicConfig.siteName,
  legalDisplayName: publicConfig.siteName,
  tagline: 'CHOOSE BEYOND.',
  shortDescription: 'A modern, configurable, multi-category commerce platform.',
  logoPath: '/brand/harzaar-logo-horizontal.svg',
  logoLightPath: '/brand/harzaar-logo-light.svg',
  logoDarkPath: '/brand/harzaar-logo-dark.svg',
  symbolPath: '/brand/harzaar-symbol.svg',
  faviconPath: '/brand/favicon.svg',
  primaryColor: BRAND_COLORS.primary,
  accentColor: BRAND_COLORS.accent,
  surfaceColor: BRAND_COLORS.surface,
  mutedColor: BRAND_COLORS.muted,
  supportEmail: emptyContact,
  salesEmail: emptyContact,
  supportPhone: emptyContact,
  whatsapp: emptyContact,
  address: emptyContact,
  businessHours: emptyContact,
  socialLinks: Object.freeze({
    facebook: emptyContact,
    instagram: emptyContact,
    x: emptyContact,
  }),
  copyrightOwner: publicConfig.siteName,
  canonicalOrigin: publicConfig.siteOrigin,
  defaultLocale: 'en',
});

export const hasPublicContact = (value: string | undefined | null): value is string =>
  Boolean(value?.trim());

export const visibleSocialLinks = () =>
  Object.entries(branding.socialLinks).filter(([, url]) => {
    if (!hasPublicContact(url)) return false;
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  });

export const copyrightLine = () =>
  `© ${new Date().getFullYear()} ${branding.copyrightOwner}. All rights reserved.`;
