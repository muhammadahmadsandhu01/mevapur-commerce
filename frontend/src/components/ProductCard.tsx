'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { ShoppingCart, Heart } from 'lucide-react';
import { useCartStore, WishlistItem } from '@/store/cartStore';
import type { Product } from '@/types/product';
import { Star } from "lucide-react";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, addToWishlist, removeFromWishlist, wishlist } = useCartStore();
  
  const isInWishlist = useMemo(
    () =>
        wishlist.some(
        (w) => w._id === product._id || w.id === product._id
        ),
    [wishlist, product._id]
    );

  // ✅ Fix #8: Safe stock check (handles undefined/null/0)
  const isOutOfStock = useMemo(() => {
    if (product.variants?.length) {
      return !product.variants.some(v => (v.stock ?? 0) > 0);
    }

    return (product.stock ?? 0) <= 0;
  }, [product.stock, product.variants]);

  // ✅ Fix #7: Safe discount calculation (prevents negative values)
  const calcDiscount = () => {
    const original = Number(product.originalPrice || 0);
    const current = Number(product.price || 0);
    
    if (original > 0 && original > current) {
      return Math.round(((original - current) / original) * 100);
    }
    return 0;
  };
  
  const discount = useMemo(() => calcDiscount(), [ product.price, product.originalPrice ]);

  // ✅ Image URL helper for cleaner JSX
  const imageUrl = useMemo(
  () =>
        product.primaryImage ||
        product.image ||
        product.images?.[0] ||
        "/placeholder.png",
    [product.primaryImage, product.image, product.images]
  );

  const brandName = typeof product.brand === "object" ? product.brand?.name : product.brand;
  const categoryName = typeof product.category === "object" ? product.category?.name : product.category;
  const reviewCount = product.reviewCount ?? product.numReviews ?? 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    // ✅ Fix #2: Prevent event bubbling to Link
    e.stopPropagation();
    
    if (isOutOfStock) return;

    addToCart({
      id: product._id,
      product: product._id,
      name: product.name,
      price: Number(product.price) || 0,
      image: imageUrl,
      stock: product.stock ?? undefined,
      sku: product.sku
    });
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    // ✅ Fix #2: Prevent event bubbling to Link
    e.stopPropagation();

    const wishlistItem: WishlistItem = {
      _id: product._id,
      id: product._id,
      name: product.name,
      price: Number(product.price) || 0,
      image: imageUrl,
      slug: product.slug,
      variant: product.variants?.find(v => v.isDefault)?.sku
    };

    if (isInWishlist) {
      removeFromWishlist(product._id);
    } else {
      addToWishlist(wishlistItem);
    }
  };

  return (
    // ✅ Fix #1: Proper outer div with 'group' class for hover effects
    <div className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 flex flex-col h-full">
      
      <Link href={`/products/${product.slug || product._id}`} className="group block">
        {/* ✅ Fix #2: Proper relative parent for Image fill */}
        <div className="relative aspect-square overflow-hidden bg-gray-50">
          <Image
            src={imageUrl}
            alt={product.name || "Product Image"}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            // ✅ Fix #4: Removed unnecessary loading="lazy" (Next.js handles this automatically)
          />
          
          {/* Discount Badge */}
          {discount > 0 && (
            <span className="absolute top-3 left-3 bg-red-500 text-white px-2 py-1 rounded-md text-xs font-bold shadow-sm">
              -{discount}%
            </span>
          )}

          {/* ✅ Fix #10: Accessibility title added */}
          {/* ✅ Fix #3: type="button" added */}
          <button
            type="button"
            onClick={handleWishlistToggle}
            title={isInWishlist ? "Remove from Wishlist" : "Add to Wishlist"}
            className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart 
              size={18} 
              className={isInWishlist ? 'fill-red-500 text-red-500' : 'text-gray-400'} 
            />
          </button>
        </div>

        {/* Product Info */}
        <div className="p-4 flex flex-col flex-grow">
          <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2 min-h-[2.5rem] group-hover:text-teal-700 transition-colors">
            {product.name || "Unnamed Product"}
          </h3>

        {(brandName || categoryName) && (
          <p className="text-xs text-gray-500 mb-2">
            {brandName}
            {brandName && categoryName && " • "}
            {categoryName}
          </p>
        )}
          
          {/* ✅ Fix #6: Safe rating check (handles 0 rating) */}
          {typeof product.rating === "number" && (
            <div className="flex items-center gap-1 mb-3">
              <Star size={14} fill="currentColor" className="text-yellow-500"/>
              <span className="text-sm text-gray-600 font-medium"> {product.rating} </span>
              <span className="text-xs text-gray-400"> ({reviewCount}) </span>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between">
            <div className="flex flex-col">
              {/* ✅ Fix #4: Safe price formatting */}
              <span className="text-lg font-bold text-teal-700">
                PKR {Number(product.price || 0).toLocaleString()}
              </span>
              
              {product.originalPrice && Number(product.originalPrice) > Number(product.price) && (
                <span className="text-xs text-gray-400 line-through">
                  PKR {Number(product.originalPrice).toLocaleString()}
                </span>
              )}
            </div>

            {/* ✅ Fix #10: Accessibility title added */}
            {/* ✅ Fix #3: type="button" added */}
            <button
              type="button"
              onClick={handleAddToCart}
              title="Add to Cart"
              disabled={isOutOfStock}
              className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                isOutOfStock 
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500' 
                  : 'bg-teal-600 text-white hover:bg-teal-700'
              }`}
              aria-label="Add to cart"
            >
              <ShoppingCart size={18} />
            </button>
          </div>

          {/* Stock Status */}
          {isOutOfStock && (
            <p className="text-red-500 text-xs font-bold mt-2 uppercase tracking-wide">
              Out of Stock
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}