import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Products',
  alternates: {
    canonical: '/products',
  },
};

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
