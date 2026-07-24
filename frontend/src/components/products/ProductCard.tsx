'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Product } from '@/types/product'; // ✅ Sirf import rahega

interface ProductCardProps {
  product: Product;
  onWishlist?: (productId: string) => void;
}

export default function ProductCard({ product, onWishlist }: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Check if product is in wishlist (from localStorage or API)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setIsWishlisted(wishlist.includes(product._id));
    }
  }, [product._id]);

  const price = Number(product.price ?? 0);
  const originalPrice = Number(product.originalPrice ?? 0);
  const discount = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (typeof window !== 'undefined') {
      let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      
      if (isWishlisted) {
        wishlist = wishlist.filter((id: string) => id !== product._id);
      } else {
        wishlist.push(product._id);
      }
      
      localStorage.setItem('wishlist', JSON.stringify(wishlist));
      setIsWishlisted(!isWishlisted);
      
      if (onWishlist) {
        onWishlist(product._id);
      }
    }
  };

  const getProductImage = () => {
  const img = product.images?.[0] || product.primaryImage || product.image;

    if (!img) return "/placeholder.png";
    // Ignore fake/demo URLs
    if (
      img.includes("example.com") ||
      img.includes("via.placeholder.com")
    ) {
      return "/placeholder.png";
    }
    return img;
  };

  return (
    <Link 
      href={`/products/${product._id}`} 
      className="group block h-full bg-white rounded-xl border border-gray-100 hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
    >
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse" />
        )}
        
        <Image 
          src={getProductImage()} 
          alt={product.name}
          fill
          className={`object-cover group-hover:scale-110 transition-transform duration-700 ease-out ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          sizes="(max-width: 768px) 50vw, 25vw"
          onLoad={() => setImageLoaded(true)}
          priority
        />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {discount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-md shadow-lg">
              {discount}% OFF
            </span>
            )}
          {(product as any).isFeatured && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-md shadow-lg">
              Featured
            </span>
          )}
          {(product.stock ?? 0) < 10 && (product.stock ?? 0) > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-md shadow-lg">
              Only {product.stock ?? 0} left
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button 
          onClick={handleWishlist}
          className="absolute top-3 right-3 p-2.5 bg-white/95 backdrop-blur-sm rounded-full shadow-lg hover:bg-red-50 hover:scale-110 transition-all duration-200 z-10"
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart 
            size={18} 
            className={`transition-colors ${isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"}`} 
          />
        </button>
      </div>

      {/* Content Container */}
      <div className="p-4 flex flex-col h-[200px]">
        {/* Category */}
        <span className="text-xs font-medium text-teal-700 uppercase tracking-wide mb-1">
          {typeof product.category === "object" ? product.category?.name : product.category ?? "Dry Fruits"}
        </span>

        {/* Product Name */}
        <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2 group-hover:text-teal-700 transition-colors text-sm leading-snug min-h-[40px]">
          {product.name}
        </h3>
        
        {/* Brand */}
        <p className="text-xs text-gray-500 mb-2">
          {typeof product.brand === "object" ? product.brand?.name : product.brand ?? "MevaPur"}
        </p>
        
        {/* Rating */}
        <div className="flex items-center gap-1.5 mb-3">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <Star 
                key={i} 
                size={14} 
                className={i < Math.floor(product.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} 
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 font-medium">({product.numReviews || product.reviewCount || 0})</span>
        </div>

        {/* Price (Pushed to bottom) */}
        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-xl font-bold text-teal-700">
            Rs. {price.toLocaleString()}
          </span>
          {product.originalPrice && Number(product.originalPrice) > Number(product.price) && (
            <span className="text-sm text-gray-400 line-through">
              Rs. {originalPrice.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}