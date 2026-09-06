import { publicConfig } from './publicConfig.ts';
import type { BrandingConfig, SocialLinks } from './brandingTypes';

const emptyContact = '';

const readSocialLinks = (): Readonly<SocialLinks> =>
  Object.freeze({
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || emptyContact,
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || emptyContact,
    x: process.env.NEXT_PUBLIC_SOCIAL_X || emptyContact,
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE || emptyContact,
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN || emptyContact,
    tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK || emptyContact,
  });

/**
 * Customer-replaceable public display values. These are intentionally public
 * and must never contain credentials, legal assurances, or private contacts.
 * Exported with dynamic property getters to ensure environment updates in tests
 * and SSR resolve dynamically without stale module caching.
 */
export const branding: BrandingConfig = Object.freeze({
  get siteName(): string {
    return publicConfig.siteName;
  },
  get legalDisplayName(): string {
    return publicConfig.legalDisplayName;
  },
  get tagline(): string {
    return publicConfig.tagline;
  },
  get shortDescription(): string {
    return publicConfig.shortDescription;
  },
  get logoPath(): string {
    return publicConfig.logoPath;
  },
  get logoLightPath(): string {
    return publicConfig.logoLightPath;
  },
  get logoDarkPath(): string {
    return publicConfig.logoDarkPath;
  },
  get symbolPath(): string {
    return publicConfig.symbolPath;
  },
  get faviconPath(): string {
    return publicConfig.faviconPath;
  },
  get socialPreviewPath(): string {
    return publicConfig.socialPreviewPath;
  },
  get primaryColor(): string {
    return publicConfig.primaryColor;
  },
  get accentColor(): string {
    return publicConfig.accentColor;
  },
  get surfaceColor(): string {
    return publicConfig.surfaceColor;
  },
  get mutedColor(): string {
    return publicConfig.mutedColor;
  },
  get supportEmail(): string {
    return process.env.NEXT_PUBLIC_SUPPORT_EMAIL || emptyContact;
  },
  get salesEmail(): string {
    return process.env.NEXT_PUBLIC_SALES_EMAIL || emptyContact;
  },
  get supportPhone(): string {
    return process.env.NEXT_PUBLIC_SUPPORT_PHONE || emptyContact;
  },
  get whatsapp(): string {
    return process.env.NEXT_PUBLIC_WHATSAPP || emptyContact;
  },
  get address(): string {
    return process.env.NEXT_PUBLIC_STORE_ADDRESS || emptyContact;
  },
  get businessHours(): string {
    return process.env.NEXT_PUBLIC_BUSINESS_HOURS || emptyContact;
  },
  get socialLinks(): Readonly<SocialLinks> {
    return readSocialLinks();
  },
  get copyrightOwner(): string {
    return publicConfig.legalDisplayName || publicConfig.siteName;
  },
  get canonicalOrigin(): string {
    return publicConfig.siteOrigin;
  },
  get defaultLocale(): string {
    return process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'en';
  },
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
