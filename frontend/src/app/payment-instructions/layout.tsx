import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment Instructions',
  robots: { index: false, follow: false },
  alternates: { canonical: '/payment-instructions' },
};

export default function PaymentInstructionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
