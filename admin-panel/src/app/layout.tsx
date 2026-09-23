import type { Metadata } from 'next';
import { headers } from 'next/headers';
import ClientLayout from './ClientLayout';
import { branding } from '@/config/branding';

export const metadata: Metadata = {
  title: `${branding.siteName} Administration`,
  description: branding.shortDescription,
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') || undefined;

  const runtimeApiUrl = process.env.API_URL || process.env.BACKEND_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const runtimeAdminUrl = process.env.ADMIN_URL || process.env.NEXT_PUBLIC_ADMIN_URL || '';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{`${branding.siteName} Administration`}</title>
        <script
          nonce={nonce}
          id="__ENV_INJECTION__"
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__ = Object.assign(window.__ENV__ || {}, { NEXT_PUBLIC_API_URL: ${JSON.stringify(runtimeApiUrl)}, NEXT_PUBLIC_ADMIN_URL: ${JSON.stringify(runtimeAdminUrl)} });`,
          }}
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <ClientLayout nonce={nonce}>{children}</ClientLayout>
      </body>
    </html>
  );
}
