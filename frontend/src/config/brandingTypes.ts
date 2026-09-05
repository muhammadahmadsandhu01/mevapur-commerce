export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  linkedin?: string;
  tiktok?: string;
}

export interface ThemeColors {
  primary: string;
  accent: string;
  surface: string;
  muted: string;
}

export interface BrandingConfig {
  readonly siteName: string;
  readonly legalDisplayName: string;
  readonly tagline: string;
  readonly shortDescription: string;
  readonly logoPath: string;
  readonly logoLightPath: string;
  readonly logoDarkPath: string;
  readonly symbolPath: string;
  readonly faviconPath: string;
  readonly socialPreviewPath: string;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly surfaceColor: string;
  readonly mutedColor: string;
  readonly supportEmail?: string;
  readonly salesEmail?: string;
  readonly supportPhone?: string;
  readonly whatsapp?: string;
  readonly address?: string;
  readonly businessHours?: string;
  readonly socialLinks: Readonly<SocialLinks>;
  readonly copyrightOwner: string;
  readonly canonicalOrigin: string;
  readonly defaultLocale: string;
}
