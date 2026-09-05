import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search Results',
  robots: { index: false, follow: false },
  alternates: { canonical: '/search' },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
