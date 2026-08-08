export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  x?: string;
}

export interface BrandingConfig {
  siteName: string;
  legalDisplayName: string;
  tagline: string;
  shortDescription: string;
  logoPath: string;
  logoLightPath: string;
  logoDarkPath: string;
  symbolPath: string;
  faviconPath: string;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  mutedColor: string;
  supportEmail?: string;
  salesEmail?: string;
  supportPhone?: string;
  whatsapp?: string;
  address?: string;
  businessHours?: string;
  socialLinks: SocialLinks;
  copyrightOwner: string;
  canonicalOrigin: string;
  defaultLocale: string;
}
