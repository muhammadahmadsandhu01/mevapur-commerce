"use client";

import Image from "next/image";
import Link from "next/link";
import { CartItem } from "@/store/cartStore";
import { PricingResult } from "@/lib/checkout/pricing";
import { Tag, Trash2, Plus, Minus } from "lucide-react";
import { calculatePricing } from '@/lib/checkout/pricing';
import { createOrder } from '@/services/order.service';

interface OrderSummaryProps {
  items: CartItem[];
  couponCode: string;
  appliedCoupon: string | null;
  totals: PricingResult;
  loading: boolean;
  setCouponCode: (val: string) => void;
  onApplyCoupon: () => { success: boolean; message: string };
  onRemoveCoupon: () => void;
  updateQuantity: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
}

export default function OrderSummary({
  items,
  couponCode,
  appliedCoupon,
  totals,
  loading,
  setCouponCode,
  onApplyCoupon,
  onRemoveCoupon,
  updateQuantity,
  removeFromCart,
}: OrderSummaryProps) {
  
  const handleApply = () => {
    const result = onApplyCoupon();
    alert(result.message); // Simple feedback for now
  };

  if (items.length === 0 && !loading) {
    return (
      <div className="text-center py-10 bg-white rounded-2xl border">
        <p className="text-gray-500 mb-4">Your cart is empty</p>
        <Link href="/products" className="text-teal-600 font-bold hover:underline">
          Continue Shopping →
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm sticky top-24">
      <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        Order Summary
      </h3>

      {/* Items List */}
      <div className="space-y-4 mb-6 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
        {items.map((item) => (
          <div key={item._id || item.id} className="flex gap-4 pb-4 border-b last:border-0">
            <Link href={`/products/${item.slug || item._id}`} className="shrink-0">
              <Image
                src={item.image || "/placeholder.png"}
                alt={item.name}
                width={80}
                height={80}
                className="rounded-lg object-cover border border-gray-100"
              />
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/products/${item.slug || item._id}`}>
                <h4 className="font-semibold text-gray-800 text-sm line-clamp-2 hover:text-teal-600">
                  {item.name}
                </h4>
              </Link>
              <p className="text-xs text-gray-500 mt-1">In Stock</p>
              
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center border rounded-md">
                  <button onClick={() => updateQuantity(item._id || item.id, Math.max(1, item.quantity - 1))} className="p-1 hover:bg-gray-100"><Minus size={14}/></button>
                  <span className="px-2 text-xs font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item._id || item.id, item.quantity + 1)} className="p-1 hover:bg-gray-100"><Plus size={14}/></button>
                </div>
                <button onClick={() => removeFromCart(item._id || item.id)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                  <Trash2 size={12}/> Remove
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-teal-700">Rs. {(parseFloat(String(item.price)) * item.quantity).toFixed(0)}</p>
              <p className="text-xs text-gray-400 mt-1">Rs. {parseFloat(String(item.price)).toFixed(0)} × {item.quantity}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Coupon */}
      {!appliedCoupon ? (
        <div className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <button onClick={handleApply} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800">
              Apply
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-6 bg-green-50 border border-green-200 p-3 rounded-lg flex justify-between items-center">
          <span className="text-green-700 text-sm font-semibold flex items-center gap-2">
            <Tag size={14}/> {appliedCoupon} Applied
          </span>
          <button onClick={onRemoveCoupon} className="text-xs text-red-600 font-medium hover:underline">Remove</button>
        </div>
      )}

      {/* Totals */}
      <div className="space-y-2 mb-6 bg-slate-50 p-4 rounded-xl">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>Rs. {totals.subtotal.toFixed(2)}</span>
        </div>
        {totals.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount</span>
            <span>-Rs. {totals.discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-gray-600">
          <span>Shipping</span>
          <span className={totals.shippingCost === 0 ? "text-green-600 font-bold" : ""}>
            {totals.shippingCost === 0 ? "FREE" : `Rs. ${totals.shippingCost}`}
          </span>
        </div>
        <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold text-gray-900">
          <span>Total</span>
          <span>Rs. {totals.grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <button disabled={loading} className="w-full bg-teal-700 text-white py-3.5 rounded-xl font-bold text-lg hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-700/20">
        {loading ? "Processing..." : "Place Order"}
      </button>
      
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        Secure Checkout
      </div>
    </div>
  );
}