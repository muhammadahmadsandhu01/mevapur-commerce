'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShoppingCart,
  Heart,
  Star,
  Truck,
  Shield,
  RotateCcw,
  Minus,
  Plus,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle,
  CreditCard,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import type { Product, ProductVariant } from '@/types/product';
import Toast from '@/components/Toast';
import ProductReviews from '@/components/products/ProductReviews';
import { accountService } from '@/services/account.service';
import { useAuthStore } from '@/store/authStore';
import { getProduct } from '@/lib/api';
import {
  getSafeMediaUrl,
  findMatchingVariant,
  getAttributeOptionMatrix,
} from '@/lib/catalogAdapter';
import { safeJsonLdStringify } from '@/lib/safeJsonLd';

export default function ProductDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { addToCart } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');
  const [wishlist, setWishlist] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Variant selection state
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  const productId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  useEffect(() => {
    const controller = new AbortController();

    const fetchProductData = async () => {
      if (!productId || productId === 'undefined') {
        setError('Invalid product identifier');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const fetchedProduct = await getProduct(productId, controller.signal);

        if (fetchedProduct) {
          setProduct(fetchedProduct);

          // Initialize default attributes from default variant or first variant
          if (fetchedProduct.variants && fetchedProduct.variants.length > 0) {
            const defaultVar = fetchedProduct.variants.find((v) => v.isDefault) || fetchedProduct.variants[0];
            const initialAttrs: Record<string, string> = {};
            defaultVar.attributes.forEach((a) => {
              initialAttrs[a.name] = a.value;
            });
            setSelectedAttributes(initialAttrs);
          }

          if (isAuthenticated) {
            accountService
              .wishlist()
              .then((result) => {
                setWishlist(
                  result.items.some(
                    (entry) =>
                      String((entry.product as { _id: string })._id) === String(fetchedProduct._id)
                  )
                );
              })
              .catch(() => setWishlist(false));
          } else {
            const { isInWishlist } = useCartStore.getState();
            setWishlist(isInWishlist(fetchedProduct._id));
          }
        } else {
          setError('Product not found or currently unavailable');
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          console.error('Error fetching product:', err);
          setError('Failed to load product details. Please try again.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchProductData();

    return () => {
      controller.abort();
    };
  }, [productId, isAuthenticated]);

  // Selected variant resolved purely
  const activeVariant: ProductVariant | null = useMemo(() => {
    if (!product || !product.variants || product.variants.length === 0) {
      return null;
    }
    return findMatchingVariant(product.variants, selectedAttributes);
  }, [product, selectedAttributes]);

  // Attribute options matrix
  const attributeMatrix = useMemo(() => {
    if (!product || !product.variants || product.variants.length === 0) {
      return {};
    }
    return getAttributeOptionMatrix(product.variants, selectedAttributes);
  }, [product, selectedAttributes]);

  // Dynamic gallery images
  const uniqueImages = useMemo(() => {
    if (!product) return ['/placeholder.png'];
    const list: string[] = [];
    if (activeVariant?.images && activeVariant.images.length > 0) {
      list.push(...activeVariant.images);
    }
    if (product.images && product.images.length > 0) {
      list.push(...product.images);
    }
    const filtered = Array.from(new Set(list.map((img) => getSafeMediaUrl(img)).filter((img) => img !== '/placeholder.png')));
    return filtered.length > 0 ? filtered : ['/placeholder.png'];
  }, [product, activeVariant]);

  const currentPrice = activeVariant ? Number(activeVariant.price) : Number(product?.price || 0);
  const currentOriginalPrice = activeVariant
    ? (activeVariant.salePrice && activeVariant.salePrice > 0 ? Number(activeVariant.salePrice) : undefined)
    : (product?.originalPrice ? Number(product.originalPrice) : undefined);

  const discount = currentOriginalPrice && currentOriginalPrice > currentPrice
    ? Math.round(((currentOriginalPrice - currentPrice) / currentOriginalPrice) * 100)
    : (product?.discount || 0);

  const availableStock = activeVariant ? Number(activeVariant.stock ?? 0) : Number(product?.stock ?? 0);
  const isOutOfStock = availableStock <= 0;

  const handleSelectAttribute = (name: string, value: string) => {
    setSelectedAttributes((prev) => ({
      ...prev,
      [name]: value,
    }));
    setSelectedImage(0);
  };

  const handleAddToCart = () => {
    if (!product) return;

    const variantName = activeVariant
      ? activeVariant.attributes.map((a) => `${a.name}: ${a.value}`).join(', ')
      : undefined;

    for (let i = 0; i < quantity; i++) {
      addToCart({
        id: product._id,
        name: product.name,
        price: currentPrice,
        image: uniqueImages[0] || '/placeholder.png',
        stock: availableStock,
        variantId: activeVariant?._id,
        variant: variantName,
        sku: activeVariant?.sku || product.sku,
      });
    }

    setToast({
      message: `Added ${quantity} item(s) to your cart`,
      type: 'success',
    });
  };

  const handleBuyNow = () => {
    handleAddToCart();
    setToast({ message: 'Proceeding to checkout...', type: 'info' });
    setTimeout(() => router.push('/checkout'), 800);
  };

  const handleWishlist = async () => {
    if (!product) return;
    const { addToWishlist, removeFromWishlist, isInWishlist } = useCartStore.getState();

    if (isAuthenticated) {
      try {
        if (wishlist) {
          await accountService.removeWishlist(product._id);
          setWishlist(false);
          setToast({ message: 'Removed from your account wishlist', type: 'info' });
        } else {
          await accountService.addWishlist(product._id);
          setWishlist(true);
          setToast({ message: 'Saved to your account wishlist', type: 'success' });
        }
      } catch {
        setToast({ message: 'Unable to update wishlist', type: 'error' });
      }
      return;
    }

    if (isInWishlist(product._id)) {
      removeFromWishlist(product._id);
      setWishlist(false);
      setToast({ message: 'Removed from wishlist', type: 'info' });
    } else {
      addToWishlist({
        _id: product._id,
        id: product._id,
        name: product.name,
        price: currentPrice,
        image: uniqueImages[0] || '/placeholder.png',
        slug: product.slug,
      });
      setWishlist(true);
      setToast({ message: 'Saved to wishlist', type: 'success' });
    }
  };

  const nextImage = () => {
    setSelectedImage((prev) => (prev + 1) % uniqueImages.length);
  };

  const prevImage = () => {
    setSelectedImage((prev) => (prev - 1 + uniqueImages.length) % uniqueImages.length);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-slate-700 font-medium">Loading product details...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <AlertCircle className="w-16 h-16 text-slate-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Product Not Found</h1>
        <p className="text-slate-700 max-w-md mb-6">
          {error || 'The product you requested is currently unavailable or has been archived.'}
        </p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#0b132b] text-white rounded-lg font-semibold hover:bg-slate-800 transition"
        >
          Browse All Products
        </Link>
      </div>
    );
  }

  const categoryName = typeof product.category === 'object' ? product.category?.name : product.category;
  const brandName = typeof product.brand === 'object' ? product.brand?.name : product.brand;

  // JSON-LD structured data for SEO
  const reviewCountNumber = Number(product.reviewCount || 0);
  const ratingNumber = Number(product.rating || 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.shortDescription || '',
    image: uniqueImages,
    sku: activeVariant?.sku || product.sku,
    offers: {
      '@type': 'Offer',
      price: currentPrice,
      priceCurrency: 'PKR',
      availability: availableStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
    aggregateRating: ratingNumber > 0 && reviewCountNumber > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: ratingNumber,
      reviewCount: reviewCountNumber,
    } : undefined,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Structured Data Script */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
      />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="bg-white border-b border-slate-200 py-3.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-slate-600 flex-wrap">
          <Link href="/" className="text-slate-900 hover:text-[#9a3412] font-semibold">Home</Link>
          <ChevronRight size={14} className="text-slate-400" />
          <Link href="/products" className="text-slate-700 hover:text-[#9a3412]">Products</Link>
          {categoryName && (
            <>
              <ChevronRight size={14} className="text-slate-400" />
              <Link href={`/products?category=${typeof product.category === 'object' ? product.category?._id : ''}`} className="text-slate-700 hover:text-[#9a3412]">
                {categoryName}
              </Link>
            </>
          )}
          <ChevronRight size={14} className="text-slate-400" />
          <span className="text-slate-900 font-bold truncate max-w-xs">{product.name}</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Main Product Presentation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm mb-10">
          {/* Gallery Column */}
          <div>
            <div
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 cursor-zoom-in"
              onClick={() => setShowFullscreen(true)}
            >
              <Image
                src={uniqueImages[selectedImage] || '/placeholder.png'}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition duration-300"
              />

              {uniqueImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    aria-label="Previous image"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow flex items-center justify-center hover:bg-white transition text-slate-800"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    aria-label="Next image"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow flex items-center justify-center hover:bg-white transition text-slate-800"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {discount > 0 && (
                <div className="absolute top-3 left-3 bg-[#0b132b] text-white text-xs font-bold px-2.5 py-1 rounded">
                  {discount}% OFF
                </div>
              )}
            </div>

            {uniqueImages.length > 1 && (
              <div className="flex gap-3 mt-4 overflow-x-auto pb-2" role="tablist" aria-label="Product thumbnails">
                {uniqueImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    role="tab"
                    aria-selected={selectedImage === idx}
                    aria-label={`Thumbnail ${idx + 1}`}
                    onClick={() => setSelectedImage(idx)}
                    className={`relative w-20 h-20 shrink-0 rounded-lg overflow-hidden border-2 transition ${
                      selectedImage === idx ? 'border-[#ff8a00] ring-2 ring-orange-200' : 'border-slate-300 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <Image src={img} alt="" fill sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Column */}
          <div className="flex flex-col">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#9a3412] mb-2">
              {[brandName, categoryName].filter(Boolean).join(' • ') || 'Verified Product'}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 leading-snug">
              {product.name}
            </h1>

            {/* Rating and Reviews */}
            <div className="flex items-center gap-3 text-sm text-slate-700 mb-5">
              <div className="flex items-center gap-1 text-amber-600">
                <Star size={17} className="fill-amber-500 text-amber-500" />
                <span className="font-bold text-slate-900">{product.rating.toFixed(1)}</span>
              </div>
              <span>•</span>
              <span>{product.reviewCount} customer reviews</span>
              {Boolean(product.soldCount && product.soldCount > 0) && (
                <>
                  <span>•</span>
                  <span className="font-bold text-[#9a3412]">{product.soldCount} ordered</span>
                </>
              )}
            </div>

            {/* SKU and Availability */}
            <div className="text-xs text-slate-600 mb-4 flex items-center gap-4">
              <span>SKU: <strong className="font-mono text-slate-900">{activeVariant?.sku || product.sku || 'N/A'}</strong></span>
              <span>•</span>
              <span className={`font-bold ${availableStock > 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                {availableStock > 0 ? `In Stock (${availableStock} units)` : 'Out of Stock'}
              </span>
            </div>

            {/* Price Presentation */}
            <div className="bg-slate-50 border border-slate-200 p-4 sm:p-5 rounded-xl mb-6">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black text-[#0b132b]">
                  PKR {currentPrice.toLocaleString()}
                </span>
                {currentOriginalPrice && currentOriginalPrice > currentPrice && (
                  <span className="text-lg text-slate-500 line-through font-medium">
                    PKR {currentOriginalPrice.toLocaleString()}
                  </span>
                )}
              </div>
              {discount > 0 && currentOriginalPrice && (
                <p className="text-xs font-bold text-emerald-800 mt-1">
                  You save PKR {(currentOriginalPrice - currentPrice).toLocaleString()} ({discount}% discount)
                </p>
              )}
            </div>

            {/* Attribute & Variant Selection */}
            {Object.keys(attributeMatrix).length > 0 && (
              <div className="space-y-4 mb-6 border-t border-b border-slate-100 py-5">
                {Object.entries(attributeMatrix).map(([attrName, options]) => (
                  <div key={attrName}>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                      {attrName}: <span className="font-bold text-slate-900">{selectedAttributes[attrName] || 'Select'}</span>
                    </label>
                    <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={`Select ${attrName}`}>
                      {options.map((opt) => {
                        const isSelected = selectedAttributes[attrName] === opt.value;
                        const isUnavailable = !opt.available;

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            disabled={isUnavailable}
                            onClick={() => handleSelectAttribute(attrName, opt.value)}
                            className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                              isSelected
                                ? 'border-[#ff8a00] bg-orange-100 text-slate-900 ring-2 ring-orange-200'
                                : isUnavailable
                                  ? 'border-slate-200 text-slate-400 line-through bg-slate-100 cursor-not-allowed'
                                  : 'border-slate-300 text-slate-800 hover:border-slate-500 bg-white'
                            }`}
                          >
                            {opt.value} {!opt.inStock && !isUnavailable && '(Out of stock)'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity Selector & Add Actions */}
            <div className="mt-auto space-y-4 pt-2">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">Quantity:</span>
                <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || isOutOfStock}
                    aria-label="Decrease quantity"
                    className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-12 text-center text-sm font-bold text-slate-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                    disabled={quantity >= availableStock || isOutOfStock}
                    aria-label="Increase quantity"
                    className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  className="flex-1 min-h-[48px] bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShoppingCart size={19} /> Add to Cart
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={isOutOfStock}
                  className="flex-1 min-h-[48px] bg-[#0b132b] hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CreditCard size={19} /> Buy Now
                </button>
                <button
                  type="button"
                  onClick={handleWishlist}
                  aria-label={wishlist ? 'Remove from wishlist' : 'Save to wishlist'}
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center transition ${
                    wishlist ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-slate-300 bg-white text-slate-700 hover:text-[#9a3412]'
                  }`}
                >
                  <Heart size={20} className={wishlist ? 'fill-rose-600 text-rose-600' : ''} />
                </button>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 text-center">
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <Truck size={18} className="mx-auto text-[#0b132b] mb-1" />
                  <p className="text-[11px] font-bold text-slate-800">Verified Delivery</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <Shield size={18} className="mx-auto text-[#0b132b] mb-1" />
                  <p className="text-[11px] font-bold text-slate-800">Secure Payment</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <RotateCcw size={18} className="mx-auto text-[#0b132b] mb-1" />
                  <p className="text-[11px] font-bold text-slate-800">Easy Returns</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs: Description, Specs, Reviews */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex border-b border-slate-200 gap-6" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'description'}
              onClick={() => setActiveTab('description')}
              className={`pb-3 font-bold text-sm sm:text-base border-b-2 transition ${
                activeTab === 'description' ? 'border-[#ff8a00] text-[#0b132b]' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Description
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'specs'}
              onClick={() => setActiveTab('specs')}
              className={`pb-3 font-bold text-sm sm:text-base border-b-2 transition ${
                activeTab === 'specs' ? 'border-[#ff8a00] text-[#0b132b]' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Specifications
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'reviews'}
              onClick={() => setActiveTab('reviews')}
              className={`pb-3 font-bold text-sm sm:text-base border-b-2 transition ${
                activeTab === 'reviews' ? 'border-[#ff8a00] text-[#0b132b]' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Customer Reviews ({product.reviewCount})
            </button>
          </div>

          <div className="pt-6">
            {activeTab === 'description' && (
              <div className="prose max-w-none text-slate-800 leading-relaxed">
                <p className="whitespace-pre-line">{product.description || product.shortDescription || 'No description provided.'}</p>
                {product.highlights && product.highlights.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-base font-bold text-slate-900 mb-3">Key Highlights</h3>
                    <ul className="space-y-2 list-none p-0">
                      {product.highlights.map((h, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm text-slate-800">
                          <CheckCircle size={15} className="text-[#9a3412]" /> {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'specs' && (
              <div>
                {product.attributes && product.attributes.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {product.attributes.map((attr, idx) => (
                      <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <span className="text-xs font-bold text-slate-600 block mb-0.5">{attr.name}</span>
                        <span className="text-sm font-bold text-slate-900">{attr.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">Standard specifications apply.</p>
                )}
              </div>
            )}

            {activeTab === 'reviews' && (
              <ProductReviews productId={product._id} />
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Image Modal */}
      {showFullscreen && (
        <div
          role="dialog"
          aria-label="Image fullscreen preview"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowFullscreen(false)}
        >
          <button
            type="button"
            onClick={() => setShowFullscreen(false)}
            aria-label="Close fullscreen view"
            className="absolute top-5 right-5 text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition"
          >
            <X size={24} />
          </button>
          <div className="relative max-w-4xl max-h-[85vh] w-full h-full" onClick={(e) => e.stopPropagation()}>
            <Image
              src={uniqueImages[selectedImage] || '/placeholder.png'}
              alt={product.name}
              fill
              className="object-contain"
            />
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
