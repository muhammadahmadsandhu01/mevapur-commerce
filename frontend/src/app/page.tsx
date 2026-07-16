'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import ProductCard from '@/components/products/ProductCard';
import PromotionalBanner from '@/components/products/PromotionalBanner';
import RecentlyViewed from '@/components/products/RecentlyViewed';
import RecommendedProducts from '@/components/products/RecommendedProducts';
import { Product } from '@/types/product';  // ✅ Sirf import rahega

interface Category {
  name: string;
  image: string;
  products: number;
  startingPrice: string;
  discount?: string;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroSlide, setHeroSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ hours: 5, minutes: 30, seconds: 0 });

  const categories: Category[] = [
    { name: 'Almonds', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&h=500&fit=crop', products: 24, startingPrice: 'Rs. 299', discount: 'Flat 20% OFF' },
    { name: 'Walnuts', image: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=400&h=500&fit=crop', products: 18, startingPrice: 'Rs. 450', discount: 'Flat 15% OFF' },
    { name: 'Premium Rice', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=500&fit=crop', products: 35, startingPrice: 'Rs. 180' },
    { name: 'Organic Spices', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&h=500&fit=crop', products: 42, startingPrice: 'Rs. 120', discount: 'Buy 2 Get 1' },
    { name: 'Dates', image: 'https://images.unsplash.com/photo-1601379766822-1c8b2879074f?w=400&h=500&fit=crop', products: 32, startingPrice: 'Rs. 350', discount: 'Flat 25% OFF' },
    { name: 'Raisins', image: 'https://images.unsplash.com/photo-1606923829579-0cb981a86e0f?w=400&h=500&fit=crop', products: 15, startingPrice: 'Rs. 220' },
    { name: 'Cooking Oil', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=500&fit=crop', products: 28, startingPrice: 'Rs. 280' },
    { name: 'Honey', image: 'https://images.unsplash.com/photo-1587049352846-4a222e773a0e?w=400&h=500&fit=crop', products: 16, startingPrice: 'Rs. 450', discount: 'Premium Quality' },
    { name: 'Tea & Coffee', image: 'https://images.unsplash.com/photo-1563911302283-d2bc129e7c1f?w=400&h=500&fit=crop', products: 38, startingPrice: 'Rs. 150' },
    { name: 'Pulses', image: 'https://images.unsplash.com/photo-1587411768628-0a47e0a8f952?w=400&h=500&fit=crop', products: 45, startingPrice: 'Rs. 140' },
    { name: 'Dairy Products', image: 'https://images.unsplash.com/photo-1628088062854-d18758511a6b?w=400&h=500&fit=crop', products: 52, startingPrice: 'Rs. 99' },
    { name: 'Flour & Grains', image: 'https://images.unsplash.com/photo-1627485937980-221c88ac04f9?w=400&h=500&fit=crop', products: 30, startingPrice: 'Rs. 110' },
  ];

  // Fetch products from backend
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/products`);
        
        if (response.data.success) {
          const productsData = (response.data.data || []).map((p: any) => ({
            ...p,
            id: p._id || p.id,
            price: parseFloat(p.price) || 0,  
            originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
            discount: Number(p.discount) || 0,
            rating: Number(p.rating) || 4.5,
            reviewCount: Number(p.reviewCount) || 128,
            numReviews: Number(p.numReviews) || Number(p.reviewCount) || 128,
            brand: p.brand || 'MevaPur',
            image: p.images && p.images.length > 0 ? p.images[0] : p.image || 'https://via.placeholder.com/400'
          }));
          setProducts(productsData);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();

    const slideInterval = setInterval(() => setHeroSlide((prev) => (prev + 1) % 3), 5000);
    setIsVisible(true);
    return () => clearInterval(slideInterval);
  }, []);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 0, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const heroSlides = [
    { title: 'Premium Organic Dry Fruits', subtitle: '100% Natural | Direct from Farms | Pakistan Wide Delivery', cta: 'Shop Collection' },
    { title: 'Flash Sale: Up to 40% OFF', subtitle: 'Limited Time Offer on Almonds, Walnuts & Dates', cta: 'Grab Deals' },
    { title: 'Gift Boxes Ready for Eid', subtitle: 'Luxury Packaging | Free Customization | Fast Shipping', cta: 'Order Now' }
  ];

  const reviews = [
    { name: 'Ahmed K.', city: 'Lahore', text: 'Best quality almonds I have ever ordered. Fresh and crunchy!', rating: 5 },
    { name: 'Sara M.', city: 'Karachi', text: 'Packaging was excellent. Dates were super soft and sweet.', rating: 5 },
    { name: 'Ali R.', city: 'Islamabad', text: 'Fast delivery and great prices. Will order again!', rating: 4 }
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, Manrope, Poppins, sans-serif', color: '#111827' }}>
      
      {/* 1. HERO SECTION (Slider) */}
      <section style={{ position: 'relative', height: '450px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'white', padding: '20px' }}>
          <div style={{ maxWidth: '800px' }}>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: '800', marginBottom: '16px', lineHeight: '1.2', opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s ease-out' }}>{heroSlides[heroSlide].title}</h1>
            <p style={{ fontSize: '18px', opacity: '0.95', marginBottom: '28px' }}>{heroSlides[heroSlide].subtitle}</p>
            <Link href="/products" style={{ display: 'inline-block', backgroundColor: '#F59E0B', color: '#0F766E', border: 'none', padding: '16px 36px', borderRadius: '50px', fontSize: '16px', fontWeight: '700', textDecoration: 'none', boxShadow: '0 4px 16px rgba(245,158,11,0.4)', transition: 'all 0.3s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(245,158,11,0.5)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(245,158,11,0.4)'; }}>{heroSlides[heroSlide].cta}</Link>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '10px' }}>
          {[0,1,2].map(i => <div key={i} onClick={() => setHeroSlide(i)} style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: heroSlide === i ? '#F59E0B' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.3s' }} />)}
        </div>
      </section>

      {/* 2. PREMIUM CATEGORIES */}
      <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '80px 20px' }}>
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>Shop by Categories</h2>
          <p style={{ fontSize: '16px', color: '#6B7280', marginBottom: '16px' }}>Explore Premium Dry Fruits & Everyday Groceries<br/>Fresh, Organic & Delivered Across Pakistan.</p>
          <Link href="/products" style={{ color: '#0F766E', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>View All Products →</Link>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
          {categories.map((cat, index) => (
            <Link key={index} href="/products" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ 
                position: 'relative',
                height: '420px',
                borderRadius: '22px',
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow: '0 15px 40px rgba(0,0,0,0.12)',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
                animationDelay: `${index * 100}ms`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-8px) scale(1.03)';
                e.currentTarget.style.boxShadow = '0 24px 60px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 15px 40px rgba(0,0,0,0.12)';
              }}>
                
                <img 
                  src={cat.image} 
                  alt={cat.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLImageElement).style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLImageElement).style.transform = 'scale(1)';
                  }}
                />
                
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
                  transition: 'background 0.4s ease'
                }} />
                
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '28px',
                  color: 'white'
                }}>
                  {cat.discount && (
                    <div style={{
                      display: 'inline-block',
                      backgroundColor: '#F59E0B',
                      color: '#0F766E',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '700',
                      marginBottom: '12px'
                    }}>
                      {cat.discount}
                    </div>
                  )}
                  
                  <h3 style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    marginBottom: '8px',
                    letterSpacing: '-0.5px'
                  }}>
                    {cat.name}
                  </h3>
                  
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <span style={{ fontSize: '14px', opacity: '0.9' }}>{cat.products} Products</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#F59E0B' }}>From {cat.startingPrice}</span>
                  </div>
                  
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(10px)',
                    padding: '10px 20px',
                    borderRadius: '25px',
                    fontWeight: '600',
                    fontSize: '14px',
                    transition: 'all 0.3s ease',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F59E0B';
                    e.currentTarget.style.color = '#0F766E';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}>
                    Shop Now →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. PROMOTIONAL BANNER */}
      <PromotionalBanner />

      {/* 4. FLASH SALE + COUNTDOWN */}
      <section style={{ backgroundColor: '#FEF3C7', padding: '40px 20px', margin: '40px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#0F766E', marginBottom: '8px' }}> Flash Sale</h2>
            <p style={{ color: '#6B7280', fontSize: '16px' }}>Offer ends soon! Grab premium dry fruits at unbeatable prices.</p>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { label: 'Hours', value: timeLeft.hours },
              { label: 'Minutes', value: timeLeft.minutes },
              { label: 'Seconds', value: timeLeft.seconds }
            ].map((t, i) => (
              <div key={i} style={{ backgroundColor: '#0F766E', color: 'white', padding: '16px 20px', borderRadius: '12px', textAlign: 'center', minWidth: '80px', boxShadow: '0 4px 12px rgba(15,118,110,0.3)' }}>
                <div style={{ fontSize: '28px', fontWeight: '800' }}>{String(t.value).padStart(2, '0')}</div>
                <div style={{ fontSize: '12px', opacity: '0.9', fontWeight: '500' }}>{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. FEATURED PRODUCTS */}
      <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px 80px' }}>
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>Featured Products</h2>
          <p style={{ fontSize: '16px', color: '#6B7280' }}>Discover our handpicked selection of premium quality products</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ width: '60px', height: '60px', border: '5px solid #0F766E', borderTop: '5px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
            <p style={{ color: '#6B7280', fontSize: '16px' }}>Loading premium products...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '28px' }}>
            {products.slice(0, 8).map(product => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '48px' }}>
          <Link href="/products" style={{ 
            display: 'inline-block',
            backgroundColor: '#0F766E', 
            color: 'white', 
            border: 'none', 
            padding: '16px 40px', 
            borderRadius: '50px', 
            fontSize: '16px', 
            fontWeight: '700', 
            textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(15,118,110,0.4)', 
            transition: 'all 0.3s'
          }} 
          onMouseEnter={e => { 
            e.currentTarget.style.transform = 'translateY(-2px)'; 
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,118,110,0.5)'; 
          }} 
          onMouseLeave={e => { 
            e.currentTarget.style.transform = 'translateY(0)'; 
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,118,110,0.4)'; 
          }}>
            View All Products →
          </Link>
        </div>
      </section>

      {/* 6. RECENTLY VIEWED */}
      <RecentlyViewed />

      {/* 7. WHY CHOOSE US */}
      <section style={{ backgroundColor: '#F0FDFA', padding: '80px 20px', margin: '40px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#0F766E', marginBottom: '16px' }}>Why Choose MevaPur?</h2>
          <p style={{ fontSize: '16px', color: '#6B7280', marginBottom: '48px' }}>Premium quality, trusted by thousands of customers across Pakistan</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '32px' }}>
            {[
              { icon: '', title: '100% Organic', desc: 'Sourced directly from trusted farms' },
              { icon: '🚚', title: 'Fast Delivery', desc: '2-3 days across Pakistan' },
              { icon: '💳', title: 'Secure Payment', desc: 'COD, Cards & Bank Transfer' },
              { icon: '️', title: 'Easy Returns', desc: '7-day no questions asked policy' }
            ].map((item, i) => (
              <div key={i} style={{ backgroundColor: 'white', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', transition: 'all 0.3s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(15,118,110,0.12)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>{item.icon}</div>
                <h3 style={{ fontWeight: '700', marginBottom: '10px', fontSize: '18px' }}>{item.title}</h3>
                <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. RECOMMENDED PRODUCTS */}
      <RecommendedProducts />

      {/* 9. CUSTOMER REVIEWS */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 20px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '32px', color: '#111827' }}>What Our Customers Say</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {reviews.map((rev, i) => (
            <div key={i} style={{ backgroundColor: 'white', padding: '28px', borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', transition: 'all 0.3s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; }}>
              <div style={{ color: '#F59E0B', marginBottom: '12px', fontSize: '18px' }}>{'★'.repeat(rev.rating)}</div>
              <p style={{ fontStyle: 'italic', marginBottom: '16px', color: '#374151', lineHeight: '1.6', fontSize: '15px' }}>"{rev.text}"</p>
              <div style={{ fontWeight: '700', color: '#111827' }}>{rev.name}</div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>{rev.city}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 10. PROMO BANNER */}
      <section style={{ background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)', padding: '60px 20px', textAlign: 'center', color: 'white', margin: '60px 0', borderRadius: '20px' }}>
        <h2 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '16px' }}>🎉 Weekend Special: Buy 2 Get 1 Free!</h2>
        <p style={{ fontSize: '18px', marginBottom: '28px', opacity: '0.95' }}>On selected premium dry fruits. Use code: <strong style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '6px' }}>MEVA21</strong></p>
        <Link href="/products" style={{ display: 'inline-block', backgroundColor: 'white', color: '#D97706', border: 'none', padding: '16px 36px', borderRadius: '50px', fontWeight: '700', fontSize: '16px', textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', transition: 'all 0.3s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; }}>Shop Now</Link>
      </section>

      {/* 11. NEWSLETTER */}
      <section style={{ backgroundColor: '#0F766E', padding: '60px 20px', textAlign: 'center', color: 'white', borderRadius: '20px', margin: '60px 20px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Stay Updated with Latest Offers</h2>
        <p style={{ opacity: '0.9', marginBottom: '28px', fontSize: '16px' }}>Subscribe to get exclusive discounts and new arrivals.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', maxWidth: '500px', margin: '0 auto', flexWrap: 'wrap' }}>
          <input placeholder="Your email address" style={{ flex: 1, minWidth: '250px', padding: '14px 20px', borderRadius: '10px', border: 'none', outline: 'none', fontSize: '15px' }} />
          <button style={{ backgroundColor: '#F59E0B', color: '#0F766E', border: 'none', padding: '14px 32px', borderRadius: '10px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FBBF24'; e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#F59E0B'; e.currentTarget.style.transform = 'translateY(0)'; }}>Subscribe</button>
        </div>
      </section>

      {/* 12. FOOTER */}
      <footer style={{ backgroundColor: '#1F2937', color: '#9CA3AF', padding: '60px 20px 30px', marginTop: '80px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '40px', marginBottom: '40px' }}>
          <div>
            <h3 style={{ color: 'white', fontSize: '22px', marginBottom: '20px' }}> MevaPur</h3>
            <p style={{ fontSize: '14px', lineHeight: '1.8', color: '#D1D5DB' }}>Premium dry fruits & groceries delivered fresh to your doorstep across Pakistan.</p>
          </div>
          <div>
            <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '16px' }}>Quick Links</h4>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '14px', lineHeight: '2.2' }}>
              <li><Link href="/products" style={{ color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#F59E0B'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>All Products</Link></li>
              <li><a href="#" style={{ color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#F59E0B'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>About Us</a></li>
              <li><a href="#" style={{ color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#F59E0B'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '16px' }}>Customer Service</h4>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '14px', lineHeight: '2.2' }}>
              <li><Link href="/orders" style={{ color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#F59E0B'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>My Orders</Link></li>
              <li><a href="#" style={{ color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#F59E0B'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>Returns & Refunds</a></li>
              <li><a href="#" style={{ color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#F59E0B'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>Privacy Policy</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '16px' }}>Contact Us</h4>
            <p style={{ fontSize: '14px', lineHeight: '2', color: '#D1D5DB' }}> +92 300 1234567<br/>📧 support@mevapur.com<br/> Lahore, Pakistan</p>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #374151', paddingTop: '24px', textAlign: 'center', fontSize: '14px', color: '#6B7280' }}>
          © {new Date().getFullYear()} MevaPur Commerce. All rights reserved.
        </div>
      </footer>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}