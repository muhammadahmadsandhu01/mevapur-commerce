'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, Star } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { accountService } from '@/services/account.service';
import type { Product } from '@/types/product';

export default function ProductCard({ product }: { product: Product }) {
  const { isAuthenticated } = useAuthStore();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useCartStore();
  const [saved, setSaved] = useState(() => isInWishlist(product._id));
  const [saving, setSaving] = useState(false);
  const price = Number(product.price || 0);
  const originalPrice = Number(product.originalPrice || 0);
  const hasSale = originalPrice > price;
  const image = product.images?.[0] || product.primaryImage || product.image || '/placeholder.png';
  const category = typeof product.category === 'object' ? product.category.name : '';
  const brand = typeof product.brand === 'object' ? product.brand.name : product.brand;
  const reviews = Number(product.numReviews ?? product.reviewCount ?? 0);
  const rating = Number(product.rating ?? 0);

  const toggleWishlist = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation(); if (saving) return;
    setSaving(true);
    try {
      if (isAuthenticated) {
        if (saved) await accountService.removeWishlist(product._id); else await accountService.addWishlist(product._id);
      } else if (saved) removeFromWishlist(product._id); else addToWishlist({ _id: product._id, id: product._id, name: product.name, price, image, slug: product.slug });
      setSaved((value) => !value);
    } catch { /* The account wishlist page presents recovery for authenticated failures. */ } finally { setSaving(false); }
  };

  return <article className="group relative flex h-full flex-col border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-md">
    <Link href={`/products/${product._id}`} className="absolute inset-0 z-0" aria-label={`View ${product.name}`} />
    <div className="relative z-10 aspect-square overflow-hidden bg-slate-100"><Image src={image.includes('example.com') || image.includes('via.placeholder.com') ? '/placeholder.png' : image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition duration-300 group-hover:scale-105" /><button type="button" onClick={toggleWishlist} disabled={saving} aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`} className="absolute right-2 top-2 rounded-full bg-white p-2 text-slate-700 shadow-sm transition hover:text-[#ff8a00] focus:outline-none focus:ring-2 focus:ring-[#ff8a00] disabled:opacity-50"><Heart size={17} className={saved ? 'fill-[#ff8a00] text-[#ff8a00]' : ''} /></button>{hasSale && <span className="absolute bottom-2 left-2 bg-[#0b132b] px-2 py-1 text-xs font-semibold text-white">Sale price</span>}</div>
    <div className="relative z-10 flex flex-1 flex-col p-4"><div className="min-h-5 text-xs font-medium text-slate-500">{category || brand || 'Product'}</div><h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[#0b132b] group-hover:underline">{product.name}</h3>{brand && category && <p className="mt-1 truncate text-xs text-slate-500">{brand}</p>}{reviews > 0 && rating > 0 && <div className="mt-3 flex items-center gap-1 text-xs text-slate-600"><Star size={15} className="fill-[#ff8a00] text-[#ff8a00]" /><span className="font-semibold text-slate-800">{rating.toFixed(1)}</span><span>({reviews})</span></div>}<div className="mt-auto pt-4"><div className="flex flex-wrap items-baseline gap-2"><span className="text-lg font-bold text-[#0b132b]">PKR {price.toLocaleString()}</span>{hasSale && <span className="text-sm text-slate-500 line-through">PKR {originalPrice.toLocaleString()}</span>}</div><p className={`mt-2 text-xs font-medium ${Number(product.stock ?? 0) > 0 ? 'text-green-800' : 'text-slate-500'}`}>{Number(product.stock ?? 0) > 0 ? 'Available to order' : 'Currently unavailable'}</p></div></div>
  </article>;
}
