'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Heart } from 'lucide-react';
import { useCartStore, WishlistItem } from '@/store/cartStore';

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  image: string;
  images?: string[];
  rating?: number;
  reviewCount?: number;
  stock?: number;
  category?: {
    name: string;
    slug: string;
  };
}

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, addToWishlist, removeFromWishlist, wishlist } = useCartStore();
  
  const isInWishlist = wishlist.some(w => w._id === product._id || w.id === product._id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    // ✅ FIXED: Removed 'quantity' as it's not in Omit<CartItem, 'quantity'> type
    // The store automatically sets quantity to 1 for new items
    addToCart({
      id: product._id,
      product: product._id,
      name: product.name,
      price: product.price,
      image: product.image
      // quantity removed - handled internally by store
    });
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();

    const wishlistItem: WishlistItem = {
      _id: product._id,
      id: product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      slug: product.slug
    };

    if (isInWishlist) {
      removeFromWishlist(product._id);
    } else {
      addToWishlist(wishlistItem);
    }
  };

  const discount = product.originalPrice 
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) 
    : 0;

return (
    <div className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100">
      <Link href={`/products/${product.slug}`} className="block relative">
        {/* Image Container */}
        <div className="relative aspect-square overflow-hidden bg-gray-50">
          <Image
            src={product.image || '/placeholder.png'}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
          
          {/* Discount Badge */}
          {discount > 0 && (
            <span className="absolute top-3 left-3 bg-red-500 text-white px-2 py-1 rounded-md text-xs font-bold">
              -{discount}%
            </span>
          )}

          {/* Wishlist Button */}
          <button
            onClick={handleWishlistToggle}
            className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
          >
            <Heart 
              size={18} 
              className={isInWishlist ? 'fill-red-500 text-red-500' : 'text-gray-400'} 
            />
          </button>
        </div>

        {/* Product Info */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2 min-h-[2.5rem]">
            {product.name}
          </h3>
          
          <div className="flex items-center gap-2 mb-3">
            {product.rating && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-500">★</span>
                <span className="text-sm text-gray-600">{product.rating}</span>
                {product.reviewCount && (
                  <span className="text-xs text-gray-400">({product.reviewCount})</span>
                )}
              </div>
            )}
        </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-teal-700">
                Rs {product.price.toLocaleString()}
              </span>
              {product.originalPrice && product.originalPrice > product.price && (
                <span className="text-sm text-gray-400 line-through">
                  Rs {product.originalPrice.toLocaleString()}
                </span>
              )}
            </div>

            <button
              onClick={handleAddToCart}
              className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              disabled={product.stock === 0}
            >
              <ShoppingCart size={18} />
            </button>
          </div>

          {product.stock === 0 && (
            <p className="text-red-500 text-sm mt-2 font-medium">Out of Stock</p>
          )}
        </div>
      </Link>
    </div>
  );
}