'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { 
  ShoppingCart, Heart, Star, Truck, Shield, RotateCcw, 
  Minus, Plus, Share2, MessageCircle, ChevronRight, 
  ChevronLeft, X, CheckCircle, CreditCard
} from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import type { Product, ProductVariant, ProductAttribute} from "@/types/product";
import Link from 'next/link';
import Toast from '@/components/Toast';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToCart } = useCartStore();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');
  const [wishlist, setWishlist] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // 🌟 NEW: Variant State
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!params.id || params.id === 'undefined') {
        setError('Invalid product ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/products/${params.id}`);
        
        if (response.data.success) {
          const fetchedProduct = response.data.data;
          setProduct(fetchedProduct);
          
          // 🌟 Set default variant
          const defaultVar = fetchedProduct.variants?.find((v: ProductVariant) => v.isDefault) || fetchedProduct.variants?.[0];
          setSelectedVariant(defaultVar || null);
          
          // Check wishlist status
          const { isInWishlist } = useCartStore.getState();
          setWishlist(isInWishlist(fetchedProduct._id));
        } else {
          setError('Product not found');
        }
      } catch (error: any) {
        console.error('❌ Error fetching product:', error);
        setError(error.response?.data?.message || 'Failed to load product');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [params.id]);

  // 🌟 Dynamic Images: Variant images first, then product gallery
  const allImages = selectedVariant?.images && selectedVariant.images.length > 0 
    ? [...selectedVariant.images, ...(product?.images || [])] 
    : (product?.images || []);
  const uniqueImages = Array.from(new Set(allImages));

  const handleAddToCart = () => {
    if (!product) return;
    
    const finalPrice = selectedVariant ? Number(selectedVariant.price) : Number(product.price);
    const finalImage = uniqueImages[0] || '';
    const variantName = selectedVariant ? selectedVariant.attributes.map(a => `${a.name}: ${a.value}`).join(', ') : undefined;
    const finalSku = selectedVariant?.sku || product.sku;
    const finalStock = selectedVariant ? selectedVariant.stock : product.stock;

    for (let i = 0; i < quantity; i++) {
      addToCart({
        id: product._id,
        name: product.name,
        price: finalPrice,
        image: finalImage,
        stock: finalStock ?? 0,
        variant: variantName,
        sku: finalSku
      });
    }
    setToast({ message: `✅ Added ${quantity} item(s) to cart successfully!`, type: 'success' });
  };

  const handleBuyNow = () => {
    handleAddToCart();
    setToast({ message: '🛒 Proceeding to checkout...', type: 'info' });
    setTimeout(() => router.push('/checkout'), 1000);
  };

  const imageUrl = product?.primaryImage || product?.image || product?.images?.[0] || "/placeholder.png";

  const handleWishlist = () => {
    const { addToWishlist, removeFromWishlist, isInWishlist } = useCartStore.getState();
    if (!product) return;
    
    if (isInWishlist(product._id)) {
      removeFromWishlist(product._id);
      setWishlist(false);
      setToast({ message: '❌ Removed from wishlist', type: 'info' });
    } else {
      addToWishlist({
        _id: product._id,
        id: product._id,
        name: product.name,
        price: Number(product.price),
        image: imageUrl,
        slug: product.slug,
    });
      setWishlist(true);
      setToast({ message: '❤️ Added to wishlist', type: 'success' });
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
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', border: '5px solid #0F766E', borderTop: '5px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
          <p style={{ color: '#6B7280', fontSize: '16px' }}>Loading product details...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <div>
          <div style={{ fontSize: '80px', marginBottom: '20px' }}>😕</div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>Product Not Found</h2>
          <p style={{ color: '#6B7280', marginBottom: '24px' }}>{error || 'The product you are looking for does not exist.'}</p>
          <Link href="/" style={{ color: '#0F766E', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#F0FDFA', borderRadius: '8px' }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const currentPrice = selectedVariant ? Number(selectedVariant.price) : Number(product.price);
  const currentOriginalPrice = selectedVariant 
    ? (selectedVariant.salePrice && selectedVariant.salePrice > 0 ? selectedVariant.salePrice : null) 
    : (product.originalPrice ? parseFloat(String(product.originalPrice)) : null);
    
  const discount = currentOriginalPrice && currentOriginalPrice > currentPrice
    ? Math.round(((currentOriginalPrice - currentPrice) / currentOriginalPrice) * 100)
    : (product.discount || 0);

  const brandName = typeof product.brand === 'object' ? product.brand?.name : product.brand;
  const categoryName = typeof product.category === "object" ? product.category?.name : product.category;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      
      {/* 1. BREADCRUMB */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '16px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#6B7280', flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '600' }}>Home</Link>
            <ChevronRight size={16} />
            <Link href="/products" style={{ color: '#6B7280', textDecoration: 'none' }}>Shop</Link>
            <ChevronRight size={16} />
            <span style={{ color: '#111827', fontWeight: '600' }}>{product.name}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* 2. PRODUCT MAIN SECTION */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '60px', marginBottom: '60px' }}>
          
          {/* LEFT: IMAGE GALLERY */}
          <div style={{ position: 'sticky', top: '100px', height: 'fit-content' }}>
            <div 
              style={{ backgroundColor: 'white', borderRadius: '16px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', position: 'relative', cursor: 'zoom-in' }}
              onClick={() => setShowFullscreen(true)}
            >
              <img 
                src={uniqueImages[selectedImage] || 'https://via.placeholder.com/600'} 
                alt={product.name}
                style={{ width: '100%', height: '600px', objectFit: 'cover' }}
              />
              
              {uniqueImages.length > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); prevImage(); }} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <ChevronLeft size={20} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); nextImage(); }} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {discount > 0 && (
                <div style={{ position: 'absolute', top: '20px', left: '20px', backgroundColor: '#EF4444', color: 'white', padding: '8px 16px', borderRadius: '8px', fontWeight: '800', fontSize: '16px' }}>
                  {discount}% OFF
                </div>
              )}
            </div>

            {uniqueImages.length > 1 && (
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto' }}>
                {uniqueImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    style={{
                      flexShrink: 0, width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden',
                      border: selectedImage === index ? '3px solid #0F766E' : '2px solid #E5E7EB',
                      cursor: 'pointer', transition: 'all 0.2s', opacity: selectedImage === index ? 1 : 0.7,
                      padding: 0, backgroundColor: 'white'
                    }}
                  >
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: PRODUCT INFO */}
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#0F766E', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                {brandName && `${brandName} • `} {categoryName}
              </div>
            </div>

            <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '16px', lineHeight: '1.3' }}>
              {product.name}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={20} fill={i < (product.rating || 5) ? '#F59E0B' : 'none'} color="#F59E0B" />
                ))}
                <span style={{ fontWeight: '700', color: '#111827', marginLeft: '4px' }}>{product.rating || 5}</span>
              </div>
              <span style={{ color: '#6B7280' }}>|</span>
              <span style={{ color: '#6B7280', fontSize: '14px' }}>({product.reviewCount || 128} reviews)</span>
              <span style={{ color: '#6B7280' }}>|</span>
              <span style={{ color: '#10B981', fontSize: '14px', fontWeight: '600' }}>{product.soldCount || 0} sold</span>
            </div>

            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
              SKU: <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{selectedVariant?.sku || product.sku}</span>
            </div>

            {/* Price */}
            <div style={{ backgroundColor: '#F8FAFC', padding: '24px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '8px' }}>
                <span style={{ fontSize: '36px', fontWeight: '800', color: '#0F766E' }}>
                  Rs. {currentPrice.toLocaleString()}
                </span>
                {currentOriginalPrice && currentOriginalPrice > currentPrice && (
                  <span style={{ fontSize: '20px', color: '#9CA3AF', textDecoration: 'line-through' }}>
                    Rs. {currentOriginalPrice.toLocaleString()}
                  </span>
                )}
              </div>
              {discount > 0 && currentOriginalPrice && (
              <div style={{ color: '#0F766E', fontSize: '14px', fontWeight: '700' }}>
                You Save: Rs. {(currentOriginalPrice - currentPrice).toLocaleString()} ({discount}%)
              </div>
            )}
            </div>

            {/* 🌟 VARIANT SELECTOR */}
            {product.variants && product.variants.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
                  Select Options:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {product.variants.map((variant: ProductVariant, idx: number) => {
                    const isSelected = selectedVariant?.sku === variant.sku;
                    const variantLabel = variant.attributes.map(a => a.value).join(' / ');
                    const isOutOfStock = (variant.stock ?? 0) <= 0;

                    return (
                      <button
                        key={idx}
                        disabled={isOutOfStock}
                        onClick={() => {
                          setSelectedVariant(variant);
                          setSelectedImage(0); // Reset image to variant's first image
                        }}
                        style={{
                          padding: '10px 20px', borderRadius: '8px',
                          border: isSelected ? '2px solid #0F766E' : '2px solid #E5E7EB',
                          backgroundColor: isSelected ? '#F0FDFA' : 'white',
                          color: isOutOfStock ? '#9CA3AF' : (isSelected ? '#0F766E' : '#374151'),
                          fontWeight: '600', fontSize: '14px',
                          cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                          textDecoration: isOutOfStock ? 'line-through' : 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        {variantLabel} {isOutOfStock && '(Out of Stock)'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock Status */}
            <div style={{ marginBottom: '24px' }}>
              {(selectedVariant?.stock ?? product.stock ?? 0) > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#D1FAE5', borderRadius: '8px' }}>
                  <CheckCircle size={18} color="#0F766E" />
                  <span style={{ color: '#0F766E', fontWeight: '600' }}>
                    In Stock - {selectedVariant?.stock ?? product.stock ?? 0} units available
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#FEE2E2', borderRadius: '8px' }}>
                  <X size={18} color="#DC2626" />
                  <span style={{ color: '#DC2626', fontWeight: '600' }}>Out of Stock</span>
                </div>
              )}
            </div>

            <p style={{ color: '#374151', fontSize: '16px', lineHeight: '1.7', marginBottom: '24px' }}>
              {product.description || "No description available."}
            </p>

            {product.highlights && product.highlights.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>Highlights:</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {product.highlights.map((highlight, index) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#374151' }}>
                      <span style={{ color: '#0F766E', fontWeight: '700' }}>✓</span> {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quantity & Action Buttons */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>Quantity</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden' }}>
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{ padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: '700' }}>
                    <Minus size={18} />
                  </button>
                  <div style={{ padding: '12px 32px', fontSize: '18px', fontWeight: '700', minWidth: '80px', textAlign: 'center', borderLeft: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB' }}>
                    {quantity}
                  </div>
                  <button onClick={() => setQuantity(Math.min(selectedVariant ? selectedVariant.stock ?? 0 : product.stock ?? 0, quantity + 1))} style={{ padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: '700' }}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={handleAddToCart} disabled={(selectedVariant?.stock ?? product.stock ?? 0)===0}
                  style={{
                    flex: 1, padding: '16px',
                    backgroundColor: (selectedVariant?.stock ?? product.stock ?? 0) > 0 ? '#0F766E' : '#9CA3AF',
                    color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '700',
                    cursor: (selectedVariant?.stock ?? product.stock ?? 0) > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'all 0.3s'
                  }}
                >
                  <ShoppingCart size={20} /> Add to Cart
                </button>
                
                <button 
                  onClick={handleBuyNow}
                  disabled={(selectedVariant ? selectedVariant.stock : product.stock) === 0}
                  style={{
                    flex: 1, padding: '16px',
                    backgroundColor: (selectedVariant?.stock ?? product.stock ?? 0) > 0 ? '#F59E0B' : '#9CA3AF',
                    color: (selectedVariant?.stock ?? product.stock ?? 0) > 0 ? '#0F766E' : 'white',
                    border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '700',
                    cursor: (selectedVariant?.stock ?? product.stock ?? 0) > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'all 0.3s'
                  }}
                >
                  <CreditCard size={20} /> Buy Now
                </button>

                <button 
                  onClick={handleWishlist}
                  style={{
                    padding: '16px', backgroundColor: wishlist ? '#FEE2E2' : 'white',
                    color: wishlist ? '#EF4444' : '#6B7280', border: '2px solid #E5E7EB', borderRadius: '12px',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  <Heart size={20} fill={wishlist ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>

            {/* Trust Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#F0FDFA', borderRadius: '8px' }}>
                <Truck size={20} color="#0F766E" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0F766E' }}>Free Delivery</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#F0FDFA', borderRadius: '8px' }}>
                <Shield size={20} color="#0F766E" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0F766E' }}>Secure Payment</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#F0FDFA', borderRadius: '8px' }}>
                <RotateCcw size={20} color="#0F766E" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0F766E' }}>Easy Returns</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. TABS SECTION */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: '60px' }}>
          <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #E5E7EB', marginBottom: '32px' }}>
            {(['description', 'specs', 'reviews'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '12px 24px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                  fontSize: '16px', fontWeight: '600', color: activeTab === tab ? '#0F766E' : '#6B7280',
                  borderBottom: activeTab === tab ? '2px solid #0F766E' : '2px solid transparent',
                  marginBottom: '-2px', transition: 'all 0.2s'
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'description' && (
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>Product Description</h3>
              <p style={{ color: '#374151', lineHeight: '1.8', fontSize: '16px' }}>{product.description || "No description available."}</p>
            </div>
          )}

          {activeTab === 'specs' && (
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>Specifications & Details</h3>
              
              {/* 🌟 Dynamic Attributes */}
              {product.attributes && product.attributes.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#0F766E', marginBottom: '12px' }}>Product Attributes</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                    {product.attributes.map((attr: ProductAttribute, idx: number) => (
                      <div key={idx} style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>{attr.name}</div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>{attr.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Traditional Specifications */}
              {product.specifications && Object.keys(product.specifications).length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {Object.entries(product.specifications).map(([key, value], index) => (
                      <tr key={key} style={{ backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'white' }}>
                        <td style={{ padding: '16px', fontWeight: '600', color: '#111827', width: '40%', borderBottom: '1px solid #E5E7EB' }}>{key}</td>
                        <td style={{ padding: '16px', color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                !product.attributes && <p style={{ color: '#6B7280' }}>No specifications available</p>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>Customer Reviews</h3>
              <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#F8FAFC', borderRadius: '12px' }}>
                <Star size={48} fill="#F59E0B" color="#F59E0B" style={{ marginBottom: '16px' }} />
                <p style={{ color: '#6B7280', fontSize: '16px' }}>Reviews coming soon!</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Fullscreen Image Viewer */}
      {showFullscreen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowFullscreen(false)}>
          <button onClick={() => setShowFullscreen(false)} style={{ position: 'absolute', top: '20px', right: '20px', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '48px', height: '48px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={24} />
          </button>
          <img src={uniqueImages[selectedImage] || "/placeholder.png"} alt={product.name} style={{ maxWidth: '90%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Floating WhatsApp Button */}
      <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 1000 }}>
        <button style={{ backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '50%', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 20px rgba(37,211,102,0.4)', transition: 'all 0.3s' }}>
          <MessageCircle size={32} />
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}