'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import { Search, X, Filter } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';

interface Product {
  _id: string;
  id?: string;
  name: string;
  description: string;
  price: string;
  originalPrice?: string;
  discount?: number;
  stock: number;
  category?: string;
  image?: string;
  images?: string[];
  rating?: number;
  reviewCount?: number;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const { addToWishlist, removeFromWishlist } = useCartStore();

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!query) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
          params: { search: query }
        });
        
        if (response.data.success) {
          const productsData = (response.data.data || []).map((p: any) => ({
            ...p,
            id: p._id || p.id,
            originalPrice: (p.originalPrice && p.originalPrice !== '0' && parseFloat(p.originalPrice) > parseFloat(p.price)) ? p.originalPrice : null,
            discount: Number(p.discount) || 0,
            rating: Number(p.rating) || 4.5,
            reviewCount: Number(p.reviewCount) || 128,
            image: p.images && p.images.length > 0 ? p.images[0] : p.image || 'https://via.placeholder.com/400'
          }));
          setProducts(productsData);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
  }, [query]);

  const toggleWishlist = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    
    const productId = product._id || product.id || '';
    
    if (wishlist.includes(productId)) {
      setWishlist((prev) => prev.filter(i => i !== productId));
      removeFromWishlist(productId);
    } else {
      setWishlist((prev) => [...prev, productId]);
      addToWishlist({
        id: productId,
        name: product.name,
        price: product.price,
        image: product.image || ''
      });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <Link href="/" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '600' }}>
              ← Back to Home
            </Link>
          </div>
          
          {/* Search Bar */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#6B7280' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  if (e.target.value) {
                    router.push(`/search?q=${encodeURIComponent(e.target.value)}`);
                  } else {
                    router.push('/search');
                  }
                }}
                placeholder="Search products..."
                style={{
                  width: '100%',
                  padding: '16px 16px 16px 52px',
                  border: '2px solid #E5E7EB',
                  borderRadius: '12px',
                  fontSize: '16px',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#0F766E'}
                onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* Results Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>
            Search Results for "{query}"
          </h1>
          <p style={{ color: '#6B7280', fontSize: '16px' }}>
            {loading ? 'Searching...' : `${products.length} product${products.length !== 1 ? 's' : ''} found`}
          </p>
        </div>

        {/* Loading State */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ width: '60px', height: '60px', border: '5px solid #0F766E', borderTop: '5px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
            <p style={{ color: '#6B7280', fontSize: '16px' }}>Searching products...</p>
          </div>
        ) : products.length === 0 ? (
          /* No Results */
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '80px', marginBottom: '20px' }}>🔍</div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '12px' }}>
              No products found
            </h2>
            <p style={{ color: '#6B7280', fontSize: '16px', marginBottom: '24px' }}>
              Try searching with different keywords or browse our categories
            </p>
            <Link 
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                backgroundColor: '#0F766E',
                color: 'white',
                borderRadius: '10px',
                fontWeight: '600',
                textDecoration: 'none',
                transition: 'all 0.3s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#115E59';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#0F766E';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Browse All Products
            </Link>
          </div>
        ) : (
          /* Products Grid */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '28px' }}>
            {products.map(product => {
              const productId = product._id || product.id || '';
              return (
                <Link 
                  key={productId} 
                  href={`/products/${productId}`}
                  style={{ 
                    textDecoration: 'none', 
                    color: 'inherit',
                    display: 'block'
                  }}
                >
                  <div style={{ 
                    backgroundColor: 'white', 
                    borderRadius: '16px', 
                    overflow: 'hidden', 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', 
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  onMouseEnter={e => { 
                    e.currentTarget.style.transform = 'translateY(-6px)'; 
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(15,118,110,0.12)'; 
                  }}
                  onMouseLeave={e => { 
                    e.currentTarget.style.transform = 'translateY(0)'; 
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; 
                  }}>
                    
                    {/* Product Image */}
                    <div style={{ position: 'relative', height: '240px', backgroundColor: '#F8FAFC', overflow: 'hidden' }}>
                      <img 
                        src={product.image || 'https://via.placeholder.com/400'} 
                        alt={product.name} 
                        loading="lazy"
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          objectFit: 'cover',
                          transition: 'transform 0.4s ease'
                        }}
                        onMouseEnter={e => (e.target as HTMLImageElement).style.transform = 'scale(1.05)'}
                        onMouseLeave={e => (e.target as HTMLImageElement).style.transform = 'scale(1)'}
                      />
                      
                      {/* Discount Badge */}
                      {product.discount && product.discount > 0 && (
                        <div style={{ 
                          position: 'absolute', 
                          top: '12px', 
                          left: '12px', 
                          backgroundColor: '#EF4444', 
                          color: 'white', 
                          padding: '6px 12px', 
                          borderRadius: '8px', 
                          fontSize: '12px', 
                          fontWeight: '700',
                          boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
                        }}>
                          {product.discount}% OFF
                        </div>
                      )}
                      
                      {/* Wishlist Button */}
                      <button 
                        onClick={(e) => toggleWishlist(e, product)} 
                        aria-label={wishlist.includes(productId) ? 'Remove from wishlist' : 'Add to wishlist'}
                        style={{ 
                          position: 'absolute', 
                          top: '12px', 
                          right: '12px', 
                          backgroundColor: 'white', 
                          border: 'none', 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '50%', 
                          cursor: 'pointer', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          transition: 'all 0.2s',
                          zIndex: 10
                        }} 
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'scale(1.1)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                        }} 
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                        }}
                      >
                        <span style={{ fontSize: '20px' }}>
                          {wishlist.includes(productId) ? '❤️' : '🤍'}
                        </span>
                      </button>
                    </div>

                    {/* Product Info */}
                    <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: '600', 
                        marginBottom: '12px', 
                        lineHeight: '1.5', 
                        height: '48px', 
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        color: '#111827'
                      }}>
                        {product.name}
                      </h3>

                      {/* Rating */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '16px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          {[...Array(5)].map((_, i) => (
                            <span 
                              key={i} 
                              style={{ 
                                color: i < (product.rating || 5) ? '#F59E0B' : '#E5E7EB',
                                fontSize: '16px'
                              }}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                        <span style={{ 
                          color: '#6B7280', 
                          fontSize: '13px',
                          fontWeight: '500'
                        }}>
                          {product.reviewCount || 128}
                        </span>
                      </div>

                      {/* Price */}
                      <div style={{ marginTop: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                          <span style={{ 
                            fontSize: '22px', 
                            fontWeight: '800', 
                            color: '#0F766E' 
                          }}>
                            Rs. {Math.floor(parseFloat(product.price)).toLocaleString()}
                          </span>
                          
                          {product.originalPrice && 
                           parseFloat(product.originalPrice) > parseFloat(product.price) &&
                           product.discount && 
                           product.discount > 0 && (
                            <span style={{ 
                              fontSize: '14px', 
                              color: '#9CA3AF', 
                              textDecoration: 'line-through',
                              fontWeight: '500'
                            }}>
                              Rs. {Math.floor(parseFloat(product.originalPrice)).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}