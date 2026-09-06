'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, Star } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { accountService } from '@/services/account.service';
import type { Product } from '@/types/product';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';

export default function ProductCard({ product }: { product: Product }) {
  const { isAuthenticated } = useAuthStore();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useCartStore();
  const [saved, setSaved] = useState(() => isInWishlist(product._id));
  const [saving, setSaving] = useState(false);

  const price = Number(product.price || 0);
  const originalPrice = Number(product.originalPrice || 0);
  const hasSale = originalPrice > price;

  const rawImage = product.primaryImage || product.images?.[0] || product.image || '/placeholder.png';
  const image = getSafeMediaUrl(rawImage);

  const category = typeof product.category === 'object' ? product.category?.name : '';
  const brand = typeof product.brand === 'object' ? product.brand?.name : product.brand;
  const reviews = Number(product.numReviews ?? product.reviewCount ?? 0);
  const rating = Number(product.rating ?? 0);
  const targetHref = `/products/${encodeURIComponent(product._id)}`;

  const toggleWishlist = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      if (isAuthenticated) {
        if (saved) await accountService.removeWishlist(product._id);
        else await accountService.addWishlist(product._id);
      } else if (saved) {
        removeFromWishlist(product._id);
      } else {
        addToWishlist({
          _id: product._id,
          id: product._id,
          name: product.name,
          price,
          image,
          slug: product.slug,
        });
      }
      setSaved((value) => !value);
    } catch {
      // Account wishlist page provides error recovery
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="group relative flex h-full flex-col border border-slate-200 bg-white rounded-xl overflow-hidden transition hover:border-slate-300 hover:shadow-md">
      <Link
        href={targetHref}
        className="flex flex-1 flex-col focus:outline-none focus:ring-2 focus:ring-[#ff8a00]"
        aria-label={`View ${product.name}`}
      >
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />

          {hasSale && (
            <span className="absolute bottom-2 left-2 bg-[#0b132b] px-2 py-0.5 text-[11px] font-bold text-white rounded">
              Sale
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="min-h-4 text-[11px] font-bold text-slate-600 uppercase tracking-wide">
            {category || brand || 'Product'}
          </div>

          <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-slate-900 group-hover:underline">
            {product.name}
          </h3>

          {brand && category && (
            <p className="mt-1 truncate text-xs text-slate-600">{brand}</p>
          )}

          {reviews > 0 && rating > 0 && (
            <div className="mt-2.5 flex items-center gap-1 text-xs text-slate-700">
              <Star size={14} className="fill-amber-500 text-amber-500" />
              <span className="font-bold text-slate-900">{rating.toFixed(1)}</span>
              <span className="text-slate-600">({reviews})</span>
            </div>
          )}

          <div className="mt-auto pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-base font-extrabold text-[#0b132b]">
                PKR {price.toLocaleString()}
              </span>
              {hasSale && (
                <span className="text-xs text-slate-600 line-through">
                  PKR {originalPrice.toLocaleString()}
                </span>
              )}
            </div>
            <p className={`mt-1.5 text-xs font-bold ${Number(product.stock ?? 0) > 0 ? 'text-emerald-800' : 'text-slate-600'}`}>
              {Number(product.stock ?? 0) > 0 ? 'Available to order' : 'Currently unavailable'}
            </p>
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={toggleWishlist}
        disabled={saving}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        className="absolute right-2 top-2 z-20 rounded-full bg-white/95 backdrop-blur p-2 text-slate-800 shadow-sm transition hover:text-[#ff8a00] focus:outline-none focus:ring-2 focus:ring-[#ff8a00] disabled:opacity-50"
      >
        <Heart size={16} className={saved ? 'fill-[#ff8a00] text-[#ff8a00]' : ''} />
      </button>
    </article>
  );
}
