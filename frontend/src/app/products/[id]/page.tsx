'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { 
  ShoppingCart, Heart, Star, Truck, Shield, RotateCcw, 
  Minus, Plus, Share2, MessageCircle, ChevronRight, 
  ChevronLeft, X, CheckCircle, CreditCard
} from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import Link from 'next/link';
import Toast from '@/components/Toast';

interface Product {
  _id: string;
  name: string;
  description: string;
  price: string;
  originalPrice?: string;
  discount?: number;
  category: string;
  subcategory?: string;
  brand?: string;
  sku: string;
  stock: number;
  images: string[];
  rating?: number;
  reviewCount?: number;
  soldCount?: number;
  highlights?: string[];
  specifications?: Record<string, string>;
}

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

  useEffect(() => {
    const fetchProduct = async () => {
      // ✅ Check if ID exists
      if (!params.id || params.id === 'undefined') {
        setError('Invalid product ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        console.log('🔍 Fetching product:', params.id);
        
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/products/${params.id}`);
        
        console.log('✅ Response:', response.data);
        
        if (response.data.success) {
          setProduct(response.data.data);
        } else {
          setError('Product not found');
        }
      } catch (error: any) {
        console.error('❌ Error fetching product:', error);
        
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
          setError(error.response.data?.message || 'Product not found');
        } else if (error.request) {
          console.error('No response received from server');
          setError('Cannot connect to server. Please make sure backend is running.');
        } else {
          setError('Failed to load product');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [params.id]);

  const handleAddToCart = () => {
    if (product) {
      for (let i = 0; i < quantity; i++) {
        addToCart({
          id: product._id,
          name: product.name,
          price: product.price,
          image: product.images[0] || '',
          stock: product.stock
        });
      }
      setToast({ message: `✅ Added ${quantity} item(s) to cart successfully!`, type: 'success' });
    }
  };

  const handleBuyNow = () => {
    if (product) {
      for (let i = 0; i < quantity; i++) {
        addToCart({
          id: product._id,
          name: product.name,
          price: product.price,
          image: product.images[0] || '',
          stock: product.stock
        });
      }
      setToast({ message: '🛒 Proceeding to checkout...', type: 'info' });
      setTimeout(() => router.push('/checkout'), 1000);
    }
  };

  const handleWishlist = () => {
    const { addToWishlist, removeFromWishlist, isInWishlist } = useCartStore.getState();
    
    if (!product) return;
    
    if (isInWishlist(product._id)) {
      removeFromWishlist(product._id);
      setWishlist(false);
      setToast({ message: '❌ Removed from wishlist', type: 'info' });
    } else {
      addToWishlist({
        id: product._id,
        name: product.name,
        price: product.price,
        image: product.images[0] || ''
      });
      setWishlist(true);
      setToast({ message: '❤️ Added to wishlist', type: 'success' });
    }
  };

  const nextImage = () => {
    if (product) {
      setSelectedImage((prev) => (prev + 1) % product.images.length);
    }
  };

  const prevImage = () => {
    if (product) {
      setSelectedImage((prev) => (prev - 1 + product.images.length) % product.images.length);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '60px', 
            height: '60px', 
            border: '5px solid #0F766E', 
            borderTop: '5px solid transparent', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite', 
            margin: '0 auto 20px' 
          }}></div>
          <p style={{ color: '#6B7280', fontSize: '16px' }}>Loading product details...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !product) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <div>
          <div style={{ fontSize: '80px', marginBottom: '20px' }}>😕</div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
            Product Not Found
          </h2>
          <p style={{ color: '#6B7280', marginBottom: '24px' }}>{error || 'The product you are looking for does not exist.'}</p>
          <Link href="/" style={{ 
            color: '#0F766E', 
            fontWeight: '600', 
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: '#F0FDFA',
            borderRadius: '8px'
          }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Calculate discount
  const discount = product.originalPrice && product.originalPrice !== '0' 
    ? Math.round(((parseFloat(product.originalPrice) - parseFloat(product.price)) / parseFloat(product.originalPrice)) * 100)
    : (product.discount || 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      
      {/* 1. BREADCRUMB */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '16px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#6B7280' }}>
            <Link href="/" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '600' }}>Home</Link>
            <ChevronRight size={16} />
            <Link href="/" style={{ color: '#6B7280', textDecoration: 'none' }}>Shop</Link>
            <ChevronRight size={16} />
            <Link href={`/?category=${product.category}`} style={{ color: '#6B7280', textDecoration: 'none' }}>{product.category}</Link>
            <ChevronRight size={16} />
            <span style={{ color: '#111827', fontWeight: '600' }}>{product.name}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* 2. PRODUCT MAIN SECTION */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', marginBottom: '60px' }}>
          
          {/* LEFT: IMAGE GALLERY */}
          <div style={{ position: 'sticky', top: '100px', height: 'fit-content' }}>
            {/* Main Image */}
            <div 
              style={{ 
                backgroundColor: 'white', 
                borderRadius: '16px', 
                overflow: 'hidden', 
                marginBottom: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                position: 'relative',
                cursor: 'zoom-in'
              }}
              onClick={() => setShowFullscreen(true)}
            >
              <img 
                src={product.images[selectedImage] || 'https://via.placeholder.com/600'} 
                alt={product.name}
                style={{ width: '100%', height: '600px', objectFit: 'cover' }}
              />
              
              {/* Navigation Arrows */}
              {product.images.length > 1 && (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    style={{
                      position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                      backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%',
                      width: '40px', height: '40px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    style={{
                      position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                      backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%',
                      width: '40px', height: '40px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {discount > 0 && (
                <div style={{ 
                  position: 'absolute', 
                  top: '20px', 
                  left: '20px', 
                  backgroundColor: '#EF4444', 
                  color: 'white', 
                  padding: '8px 16px', 
                  borderRadius: '8px', 
                  fontWeight: '800',
                  fontSize: '16px'
                }}>
                  {discount}% OFF
                </div>
              )}
            </div>

            {/* Thumbnail Images */}
            {product.images.length > 1 && (
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto' }}>
                {product.images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    style={{
                      flexShrink: 0,
                      width: '100px',
                      height: '100px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: selectedImage === index ? '3px solid #0F766E' : '2px solid #E5E7EB',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      opacity: selectedImage === index ? 1 : 0.7,
                      padding: 0,
                      backgroundColor: 'white'
                    }}
                    onMouseEnter={e => {
                      if (selectedImage !== index) {
                        e.currentTarget.style.borderColor = '#0F766E';
                        e.currentTarget.style.opacity = '1';
                      }
                    }}
                    onMouseLeave={e => {
                      if (selectedImage !== index) {
                        e.currentTarget.style.borderColor = '#E5E7EB';
                        e.currentTarget.style.opacity = '0.7';
                      }
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
            {/* Category & Brand */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#0F766E', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                {product.brand && `${product.brand} • `}{product.category}
              </div>
            </div>

            {/* Product Name */}
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '16px', lineHeight: '1.3' }}>
              {product.name}
            </h1>

            {/* Rating & Stock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    size={20} 
                    fill={i < (product.rating || 5) ? '#F59E0B' : 'none'} 
                    color="#F59E0B" 
                  />
                ))}
                <span style={{ fontWeight: '700', color: '#111827', marginLeft: '4px' }}>
                  {product.rating || 5}
                </span>
              </div>
              <span style={{ color: '#6B7280' }}>|</span>
              <span style={{ color: '#6B7280', fontSize: '14px' }}>
                ({product.reviewCount || 128} reviews)
              </span>
              <span style={{ color: '#6B7280' }}>|</span>
              <span style={{ color: '#10B981', fontSize: '14px', fontWeight: '600' }}>
                {product.soldCount || 0} sold
              </span>
            </div>

            {/* SKU */}
            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
              SKU: <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{product.sku}</span>
            </div>

            {/* Price */}
            <div style={{ backgroundColor: '#F8FAFC', padding: '24px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '8px' }}>
                <span style={{ fontSize: '36px', fontWeight: '800', color: '#0F766E' }}>
                  Rs. {parseFloat(product.price).toLocaleString()}
                </span>
                {product.originalPrice && parseFloat(product.originalPrice) > parseFloat(product.price) && (
                  <span style={{ fontSize: '20px', color: '#9CA3AF', textDecoration: 'line-through' }}>
                    Rs. {parseFloat(product.originalPrice).toLocaleString()}
                  </span>
                )}
              </div>
              {discount > 0 && (
                <div style={{ color: '#0F766E', fontSize: '14px', fontWeight: '700' }}>
                  You Save: Rs. {(parseFloat(product.originalPrice || '0') - parseFloat(product.price)).toLocaleString()} ({discount}%)
                </div>
              )}
            </div>

            {/* Stock Status */}
            <div style={{ marginBottom: '24px' }}>
              {product.stock > 0 ? (
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '12px', backgroundColor: '#D1FAE5', borderRadius: '8px'
                }}>
                  <CheckCircle size={18} color="#0F766E" />
                  <span style={{ color: '#0F766E', fontWeight: '600' }}>
                    In Stock - {product.stock} units available
                  </span>
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '12px', backgroundColor: '#FEE2E2', borderRadius: '8px'
                }}>
                  <X size={18} color="#DC2626" />
                  <span style={{ color: '#DC2626', fontWeight: '600' }}>Out of Stock</span>
                </div>
              )}
            </div>

            {/* Description */}
            <p style={{ color: '#374151', fontSize: '16px', lineHeight: '1.7', marginBottom: '24px' }}>
              {product.description}
            </p>

            {/* Highlights */}
            {product.highlights && product.highlights.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>Highlights:</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {product.highlights.map((highlight, index) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#374151' }}>
                      <span style={{ color: '#0F766E', fontWeight: '700' }}>✓</span>
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quantity & Action Buttons */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
                Quantity
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden' }}>
                  <button 
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    style={{ 
                      padding: '12px 20px', 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      fontSize: '18px', 
                      fontWeight: '700'
                    }}
                  >
                    <Minus size={18} />
                  </button>
                  <div style={{ 
                    padding: '12px 32px', 
                    fontSize: '18px', 
                    fontWeight: '700', 
                    minWidth: '80px', 
                    textAlign: 'center',
                    borderLeft: '1px solid #E5E7EB',
                    borderRight: '1px solid #E5E7EB'
                  }}>
                    {quantity}
                  </div>
                  <button 
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    style={{ 
                      padding: '12px 20px', 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      fontSize: '18px', 
                      fontWeight: '700'
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={handleAddToCart}
                  disabled={product.stock === 0}
                  style={{
                    flex: 1, 
                    padding: '16px',
                    backgroundColor: product.stock > 0 ? '#0F766E' : '#9CA3AF',
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '12px',
                    fontSize: '16px', 
                    fontWeight: '700',
                    cursor: product.stock > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '10px',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={e => {
                    if (product.stock > 0) {
                      e.currentTarget.style.backgroundColor = '#115E59';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (product.stock > 0) {
                      e.currentTarget.style.backgroundColor = '#0F766E';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <ShoppingCart size={20} />
                  Add to Cart
                </button>
                
                <button 
                  onClick={handleBuyNow}
                  disabled={product.stock === 0}
                  style={{
                    flex: 1, 
                    padding: '16px',
                    backgroundColor: product.stock > 0 ? '#F59E0B' : '#9CA3AF',
                    color: product.stock > 0 ? '#0F766E' : 'white',
                    border: 'none', 
                    borderRadius: '12px',
                    fontSize: '16px', 
                    fontWeight: '700',
                    cursor: product.stock > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '10px',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={e => {
                    if (product.stock > 0) {
                      e.currentTarget.style.backgroundColor = '#D97706';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (product.stock > 0) {
                      e.currentTarget.style.backgroundColor = '#F59E0B';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <CreditCard size={20} />
                  Buy Now
                </button>

                <button 
                  onClick={handleWishlist}
                  style={{
                    padding: '16px',
                    backgroundColor: wishlist ? '#FEE2E2' : 'white',
                    color: wishlist ? '#EF4444' : '#6B7280',
                    border: '2px solid #E5E7EB', 
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#EF4444';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#E5E7EB';
                    e.currentTarget.style.transform = 'scale(1)';
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
          {/* Tab Headers */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #E5E7EB', marginBottom: '32px' }}>
            {(['description', 'specs', 'reviews'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: activeTab === tab ? '#0F766E' : '#6B7280',
                  borderBottom: activeTab === tab ? '2px solid #0F766E' : '2px solid transparent',
                  marginBottom: '-2px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  if (activeTab !== tab) {
                    e.currentTarget.style.color = '#0F766E';
                  }
                }}
                onMouseLeave={e => {
                  if (activeTab !== tab) {
                    e.currentTarget.style.color = '#6B7280';
                  }
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'description' && (
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>Product Description</h3>
              <p style={{ color: '#374151', lineHeight: '1.8', fontSize: '16px' }}>{product.description}</p>
            </div>
          )}

          {activeTab === 'specs' && (
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>Specifications</h3>
              {product.specifications && Object.keys(product.specifications).length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {Object.entries(product.specifications).map(([key, value], index) => (
                      <tr key={key} style={{ backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'white' }}>
                        <td style={{ padding: '16px', fontWeight: '600', color: '#111827', width: '40%', borderBottom: '1px solid #E5E7EB' }}>
                          {key}
                        </td>
                        <td style={{ padding: '16px', color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>
                          {value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#6B7280' }}>No specifications available</p>
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

        {/* 4. RELATED PRODUCTS */}
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '24px' }}>Related Products</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer', transition: 'all 0.3s' }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                }}
              >
                <div style={{ height: '240px', backgroundColor: '#F8FAFC', position: 'relative' }}>
                  <img src={`https://images.unsplash.com/photo-${i === 1 ? '1615485290382-441e4d049cb5' : i === 2 ? '1587049352846-4a222e773a0e' : i === 3 ? '1599599810769-bcde5a160d32' : '1601379766822-1c8b2879074f'}?w=400&h=400&fit=crop`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '16px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>Related Product {i}</h4>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F766E' }}>Rs. {(Math.random() * 1000 + 200).toFixed(0)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Fullscreen Image Viewer */}
      {showFullscreen && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            backgroundColor: 'rgba(0,0,0,0.95)', 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '20px' 
          }} 
          onClick={() => setShowFullscreen(false)}
        >
          <button 
            onClick={() => setShowFullscreen(false)} 
            style={{ 
              position: 'absolute', 
              top: '20px', 
              right: '20px', 
              backgroundColor: 'rgba(255,255,255,0.1)', 
              border: 'none', 
              borderRadius: '50%', 
              width: '48px', 
              height: '48px', 
              cursor: 'pointer', 
              color: 'white', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
          >
            <X size={24} />
          </button>
          <img 
            src={product.images[selectedImage]} 
            alt={product.name} 
            style={{ 
              maxWidth: '90%', 
              maxHeight: '90vh', 
              objectFit: 'contain', 
              borderRadius: '8px' 
            }} 
            onClick={e => e.stopPropagation()} 
          />
        </div>
      )}

      {/* Floating WhatsApp Button */}
      <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 1000 }}>
        <button style={{ 
          backgroundColor: '#25D366', 
          color: 'white', 
          border: 'none', 
          borderRadius: '50%', 
          width: '64px', 
          height: '64px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          cursor: 'pointer', 
          boxShadow: '0 4px 20px rgba(37,211,102,0.4)', 
          transition: 'all 0.3s' 
        }}>
          <MessageCircle size={32} />
        </button>
      </div>

      {/* Toast Notification */}
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