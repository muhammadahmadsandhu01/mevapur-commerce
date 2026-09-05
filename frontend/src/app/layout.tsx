import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import Navbar from '@/components/Navbar';
import AuthBootstrap from '@/components/AuthBootstrap';
import { publicConfig } from '@/config/publicConfig';
import HelpAssistant from '@/components/assistant/HelpAssistant';
import Footer from '@/components/Footer';
import SkipLink from '@/components/SkipLink';
import { branding } from '@/config/branding';
import { safeJsonLdStringify } from '@/lib/safeJsonLd';

export const metadata: Metadata = {
  metadataBase: new URL(publicConfig.siteOrigin),
  title: {
    default: `${branding.siteName} — ${branding.tagline}`,
    template: `%s | ${branding.siteName}`,
  },
  description: branding.shortDescription,
  applicationName: branding.siteName,
  icons: {
    icon: branding.faviconPath,
    apple: branding.symbolPath,
  },
  robots: publicConfig.searchIndexingEnabled
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
  openGraph: {
    title: branding.siteName,
    description: branding.shortDescription,
    siteName: branding.siteName,
    type: 'website',
    url: publicConfig.siteOrigin,
    locale: branding.defaultLocale,
    images: [
      {
        url: branding.socialPreviewPath,
        alt: branding.siteName,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: branding.siteName,
    description: branding.shortDescription,
    images: [branding.socialPreviewPath],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') || undefined;

  const logoAbsoluteUrl = branding.logoPath.startsWith('http')
    ? branding.logoPath
    : `${publicConfig.siteOrigin}${branding.logoPath}`;

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: branding.siteName,
    url: publicConfig.siteOrigin,
    description: branding.shortDescription,
    publisher: {
      '@type': 'Organization',
      name: branding.legalDisplayName || branding.siteName,
      url: publicConfig.siteOrigin,
      logo: logoAbsoluteUrl,
      ...(branding.supportEmail ? { email: branding.supportEmail } : {}),
      ...(branding.supportPhone ? { telephone: branding.supportPhone } : {}),
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${publicConfig.siteOrigin}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: branding.legalDisplayName || branding.siteName,
    url: publicConfig.siteOrigin,
    logo: logoAbsoluteUrl,
    ...(branding.supportEmail ? { email: branding.supportEmail } : {}),
    ...(branding.supportPhone ? { telephone: branding.supportPhone } : {}),
  };

  return (
    <html lang="en">
      <head>
        {nonce && <meta property="csp-nonce" content={nonce} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(organizationJsonLd) }}
        />
      </head>
      <body
        className="flex min-h-screen flex-col"
        style={{
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <SkipLink />
        <AuthBootstrap>
          <Navbar />
          <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <Footer />
          <HelpAssistant />
        </AuthBootstrap>
      </body>
    </html>
  );
}
