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

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{`${branding.siteName} Administration`}</title>
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <ClientLayout nonce={nonce}>{children}</ClientLayout>
      </body>
    </html>
  );
}
