'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ShoppingCart, Trash2, ArrowRight } from 'lucide-react';
import { useCartStore, type WishlistItem } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { accountService, type AccountOwnReviewProduct } from '@/services/account.service';
import { getSessionGeneration, isCurrentSessionGeneration } from '@/lib/authSession';

type RemoteItem = {
  id: string;
  product: AccountOwnReviewProduct;
};

export default function WishlistPage() {
  const { wishlist: localItems, removeFromWishlist: removeLocal, moveWishlistToCart, addToCart } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const [items, setItems] = useState<RemoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const gen = getSessionGeneration();
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const result = await accountService.wishlist();
      if (isCurrentSessionGeneration(gen)) {
        setItems(result.items as RemoteItem[]);
      }
    } catch {
      if (isCurrentSessionGeneration(gen)) {
        setError('Saved products could not be loaded. Please try again.');
      }
    } finally {
      if (isCurrentSessionGeneration(gen)) {
        setLoading(false);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const remove = async (item: RemoteItem | WishlistItem) => {
    if (isAuthenticated && 'product' in item) {
      const prodId = item.product._id || item.product.id;
      await accountService.removeWishlist(prodId);
      await load();
    } else {
      removeLocal(item.id);
    }
  };

  const display = isAuthenticated ? items : localItems;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-[#9a3412]">SAVED PRODUCTS</p>
      <h1 className="mt-1 text-3xl font-bold text-[#0b132b]">Your wishlist</h1>
      <p className="mt-2 text-sm text-slate-600">
        {isAuthenticated
          ? 'Saved to your account and available across your signed-in devices.'
          : 'This temporary wishlist is saved in this browser. Sign in to keep it with your account.'}
      </p>

      {error && (
        <div role="alert" className="mt-5 border border-amber-300 bg-amber-50 p-4 text-sm">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-52 animate-pulse bg-slate-200 rounded-xl" />
          ))}
        </div>
      ) : display.length === 0 ? (
        <section className="mt-6 border border-dashed border-slate-300 bg-white p-10 text-center rounded-2xl">
          <Heart className="mx-auto text-[#ff8a00] h-10 w-10" />
          <h2 className="mt-3 font-semibold text-lg text-slate-900">Nothing saved yet</h2>
          <p className="mt-1 text-sm text-slate-600">Save available products to return to them later.</p>
          <Link
            href="/products"
            className="mt-5 inline-block rounded-xl bg-[#0b132b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2a4f]"
          >
            Browse products
          </Link>
        </section>
      ) : (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {display.map((item) => {
            const remote = 'product' in item ? item.product : null;
            const local = item as WishlistItem;
            const id = remote ? (remote._id || remote.id) : local.id;
            const name = remote ? remote.name : local.name;
            const price = Number(remote ? (remote.salePrice ?? remote.price) : local.price);
            const available = remote ? Number(remote.stock ?? 0) > 0 : true;
            const hasVariants = Boolean(remote?.hasVariants || (remote?.variants && remote.variants.length > 0));
            const productHref = `/products/${remote?.slug || id}`;
            const imageSrc = remote?.images?.[0] || (local as WishlistItem).image || '';

            return (
              <article key={'product' in item ? item.id : local.id} className="border border-slate-200 bg-white p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {imageSrc && (
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                        <Image src={imageSrc} alt={name} fill sizes="64px" className="object-cover" />
                      </div>
                    )}
                    <div>
                      <Link href={productHref} className="font-bold text-sm text-[#0b132b] hover:underline">
                        {name}
                      </Link>
                      <p className="mt-1 text-sm font-bold text-slate-900">PKR {price.toLocaleString()}</p>
                      <p className={`mt-0.5 text-xs font-medium ${available ? 'text-green-800' : 'text-slate-500'}`}>
                        {available ? (hasVariants ? 'Options available' : 'In stock') : 'Currently unavailable'}
                      </p>
                    </div>
                  </div>
                  <Heart className="text-[#ff8a00] h-5 w-5 shrink-0 fill-[#ff8a00]" />
                </div>

                <div className="mt-5 flex items-center gap-3 pt-3 border-t border-slate-100">
                  {hasVariants ? (
                    <Link
                      href={productHref}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b132b] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1c2a4f]"
                    >
                      Choose Options <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={!available}
                      onClick={() => {
                        if (remote) addToCart({ id, name, price, image: imageSrc, stock: remote.stock });
                        else moveWishlistToCart(local.id);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0b132b] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#1c2a4f]"
                    >
                      <ShoppingCart size={14} /> Add to cart
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(item)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-700"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
