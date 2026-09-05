import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Order Confirmed',
  robots: { index: false, follow: false },
  alternates: { canonical: '/order-success' },
};

export default function OrderSuccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
