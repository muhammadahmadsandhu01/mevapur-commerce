import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
import { getProduct } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }> | { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  const id = resolved?.id || '';
  try {
    const product = await getProduct(id);
    if (!product || !product.isActive || product.status !== 'published') {
      return {
        title: 'Product Unavailable',
        robots: { index: false, follow: false },
        alternates: {
          canonical: `/products/${encodeURIComponent(id)}`,
        },
      };
    }

    const title = product.name || 'Product Details';
    const description = product.description?.slice(0, 160) || product.shortDescription?.slice(0, 160) || '';
    const canonicalPath = `/products/${encodeURIComponent(product.slug || id)}`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalPath,
      },
      openGraph: {
        title,
        description,
        type: 'website',
        url: canonicalPath,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    };
  } catch {
    return {
      title: 'Product Details',
      robots: { index: false, follow: false },
      alternates: {
        canonical: `/products/${encodeURIComponent(id)}`,
      },
    };
  }
}

export default function ProductDetailPage() {
  return <ProductDetailClient />;
}
