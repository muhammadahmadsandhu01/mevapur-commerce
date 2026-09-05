import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password',
  robots: { index: false, follow: false },
  alternates: { canonical: '/forgot-password' },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
