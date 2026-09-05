import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment Status',
  robots: { index: false, follow: false },
  alternates: { canonical: '/payment-result' },
};

export default function PaymentResultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
