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
  },
  robots: publicConfig.searchIndexingEnabled
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: branding.siteName,
    description: branding.shortDescription,
    siteName: branding.siteName,
    type: 'website',
    url: publicConfig.siteOrigin,
    locale: branding.defaultLocale,
  },
  twitter: {
    card: 'summary_large_image',
    title: branding.siteName,
    description: branding.shortDescription,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') || undefined;

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: branding.siteName,
    url: publicConfig.siteOrigin,
    description: branding.shortDescription,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${publicConfig.siteOrigin}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html lang="en">
      <head>
        {nonce && <meta property="csp-nonce" content={nonce} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(websiteJsonLd) }}
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

