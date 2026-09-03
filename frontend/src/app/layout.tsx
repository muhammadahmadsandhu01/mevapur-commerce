import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import Navbar from '@/components/Navbar';
import AuthBootstrap from '@/components/AuthBootstrap';
import CanonicalUrl from '@/components/CanonicalUrl';
import { publicConfig } from '@/config/publicConfig';
import HelpAssistant from '@/components/assistant/HelpAssistant';
import Footer from '@/components/Footer';
import { branding } from '@/config/branding';

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
  openGraph: {
    title: branding.siteName,
    description: branding.shortDescription,
    siteName: branding.siteName,
    type: 'website',
    url: publicConfig.siteOrigin,
    locale: branding.defaultLocale,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') || undefined;

  return (
    <html lang="en">
      <head>
        {nonce && <meta property="csp-nonce" content={nonce} />}
      </head>
      <body style={{
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <CanonicalUrl />
        <AuthBootstrap>
          <Navbar />
          <main>{children}</main>
          <Footer />
          <HelpAssistant />
        </AuthBootstrap>
      </body>
    </html>
  );
}
