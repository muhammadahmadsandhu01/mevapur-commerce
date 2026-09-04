'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { revalidateCart, type RevalidationSummary } from '@/lib/cartRevalidation';
import { formatMoney, calculateSubtotal } from '@/lib/money';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';

export default function CartPage() {
  const { items, updateQuantity, removeFromCart, reconcileItems } = useCartStore();
  const [revalidating, setRevalidating] = useState(false);
  const [revalidationSummary, setRevalidationSummary] = useState<RevalidationSummary | null>(null);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Authoritative revalidation check on mount
  useEffect(() => {
    if (!mounted || items.length === 0) return;

    const controller = new AbortController();

    async function runRevalidation() {
      setRevalidating(true);
      try {
        const res = await revalidateCart(items, controller.signal);
        if (!controller.signal.aborted) {
          reconcileItems(res.items);
          if (res.summary.hasChanges) {
            setRevalidationSummary(res.summary);
          }
        }
      } catch {
        // Keep existing state
      } finally {
        if (!controller.signal.aborted) {
          setRevalidating(false);
        }
      }
    }

    void runRevalidation();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const handleManualRevalidate = async () => {
    if (revalidating || items.length === 0) return;
    setRevalidating(true);
    try {
      const res = await revalidateCart(items);
      reconcileItems(res.items);
      setRevalidationSummary(res.summary);
    } catch {
      // Keep existing state
    } finally {
      setRevalidating(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-[#ff8a00] animate-spin mb-3" />
        <p className="text-xs text-slate-600 font-semibold">Loading your cart...</p>
      </div>
    );
  }

  const totalItemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = calculateSubtotal(items.filter((i) => !i.isUnavailable));
  const hasUnavailableItems = items.some((i) => i.isUnavailable);

  if (items.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4">
          <ShoppingBag size={32} className="text-[#ff8a00]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0b132b]">Your cart is empty</h1>
        <p className="mt-2 text-sm text-slate-700 max-w-md">
          Explore our fresh dry fruits, organic nuts, and premium natural products to add items to your cart.
        </p>
        <Link
          href="/products"
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0b132b] px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 shadow-sm transition"
        >
          Browse Catalogue <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#9a3412]">Review & Checkout</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[#0b132b]">Your Shopping Cart</h1>
        </div>

        <button
          type="button"
          onClick={handleManualRevalidate}
          disabled={revalidating}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw size={14} className={revalidating ? 'animate-spin text-[#ff8a00]' : ''} />
          {revalidating ? 'Verifying prices & stock...' : 'Revalidate Prices & Stock'}
        </button>
      </div>

      {/* Revalidation Notices */}
      {revalidationSummary && revalidationSummary.hasChanges && (
        <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50 text-slate-900" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <h2 className="font-bold text-slate-900 mb-1">Notice: Cart updated with latest catalog data</h2>
              <ul className="list-disc pl-4 space-y-1 text-slate-800">
                {revalidationSummary.messages.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* Cart Items List */}
        <section className="space-y-4" aria-label="Cart items">
          {items.map((item) => {
            const pId = item.productId || item.id || item._id || '';
            const image = getSafeMediaUrl(item.image);
            const lineKey = `${pId}:${item.variantId || 'default'}`;
            const isUnavailable = item.isUnavailable;

            return (
              <article
                key={lineKey}
                className={`flex flex-col sm:flex-row gap-4 p-5 bg-white border rounded-2xl transition shadow-xs ${
                  isUnavailable ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'
                }`}
              >
                {/* Product Thumbnail */}
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  <Image
                    src={image}
                    alt={item.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                  {isUnavailable && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center text-white text-[10px] font-bold uppercase p-1 text-center">
                      Unavailable
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/products/${item.slug || pId}`}
                        className="text-base font-bold text-slate-900 hover:text-[#9a3412] transition"
                      >
                        {item.name}
                      </Link>
                      <span className="font-extrabold text-base text-[#0b132b] shrink-0 sm:hidden">
                        {formatMoney(item.price * item.quantity)}
                      </span>
                    </div>

                    {item.variant && (
                      <p className="text-xs text-slate-700 font-semibold mt-0.5">{item.variant}</p>
                    )}

                    {item.sku && (
                      <p className="text-[11px] text-slate-600 font-mono mt-0.5">SKU: {item.sku}</p>
                    )}

                    {item.priceChanged && item.oldPrice && (
                      <span className="inline-block mt-1 text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                        Price updated from PKR {item.oldPrice.toLocaleString()}
                      </span>
                    )}

                    {isUnavailable && (
                      <span className="inline-block mt-1 text-[11px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded">
                        Item out of stock or discontinued
                      </span>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between gap-4 mt-4 pt-3 border-t border-slate-100">
                    <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white">
                      <button
                        type="button"
                        onClick={() => updateQuantity(pId, item.quantity - 1, item.variantId)}
                        disabled={item.quantity <= 1 || isUnavailable}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-8 text-center text-xs font-bold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(pId, item.quantity + 1, item.variantId)}
                        disabled={
                          isUnavailable ||
                          (item.stock !== null && item.stock !== undefined && item.quantity >= item.stock) ||
                          item.quantity >= 20
                        }
                        aria-label={`Increase quantity of ${item.name}`}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(pId, item.variantId)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-rose-700 transition rounded-lg hover:bg-rose-50"
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      <Trash2 size={15} /> Remove
                    </button>
                  </div>
                </div>

                {/* Price Desktop */}
                <div className="hidden sm:flex flex-col items-end justify-between shrink-0 text-right">
                  <span className="font-extrabold text-base text-[#0b132b]">
                    {formatMoney(item.price * item.quantity)}
                  </span>
                  <span className="text-xs text-slate-600 font-medium">
                    {formatMoney(item.price)} each
                  </span>
                </div>
              </article>
            );
          })}
        </section>

        {/* Order Summary Sidebar */}
        <aside className="h-fit bg-white border border-slate-200 rounded-2xl p-6 shadow-xs lg:sticky lg:top-24">
          <h2 className="text-lg font-extrabold text-slate-900">Order Summary</h2>

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between text-slate-700">
              <span>Items Total ({totalItemsCount})</span>
              <span className="font-bold text-slate-900">{formatMoney(subtotal)}</span>
            </div>

            <div className="flex justify-between text-slate-700">
              <span>Estimated Shipping</span>
              <span className="text-xs text-slate-600 font-medium">Calculated at checkout</span>
            </div>

            <div className="flex justify-between text-slate-700">
              <span>Estimated Tax</span>
              <span className="text-xs text-slate-600 font-medium">Included where applicable</span>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="flex justify-between items-baseline mb-4">
              <span className="text-base font-extrabold text-slate-900">Estimated Total</span>
              <span className="text-2xl font-black text-[#0b132b]">{formatMoney(subtotal)}</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Final totals, shipping rates, and coupon discounts are confirmed authoritatively by the server during checkout.
            </p>

            {hasUnavailableItems ? (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-800 text-center">
                  Please remove unavailable items before proceeding
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full flex min-h-[48px] items-center justify-center rounded-xl bg-slate-300 text-slate-500 font-bold text-sm cursor-not-allowed"
                >
                  Proceed to Checkout
                </button>
              </div>
            ) : (
              <Link
                href="/checkout"
                className="w-full flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-extrabold text-sm shadow-sm transition"
              >
                Proceed to Checkout <ArrowRight size={17} />
              </Link>
            )}

            <Link
              href="/products"
              className="mt-4 block text-center text-xs font-bold text-[#0b132b] hover:underline underline-offset-4"
            >
              Continue Shopping
            </Link>

            {/* Trust Assurance */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-700 font-semibold">
              <ShieldCheck size={16} className="text-emerald-700" />
              <span>Safe & Secure Authoritative Checkout</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
