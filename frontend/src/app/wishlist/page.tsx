'use client';

import { useCartStore } from '@/store/cartStore';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, Trash2, Heart, ShoppingBag } from 'lucide-react';

export default function WishlistPage() {
  const { wishlist, removeFromWishlist, moveWishlistToCart, clearCart } = useCartStore();

  if (wishlist.length === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '120px', marginBottom: '24px' }}>💝</div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>Your Wishlist is Empty</h1>
          <p style={{ fontSize: '16px', color: '#6B7280', marginBottom: '32px' }}>Save your favorite items here for later!</p>
          <Link href="/" style={{
            backgroundColor: '#0F766E', color: 'white', padding: '16px 32px',
            borderRadius: '50px', fontWeight: '700', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(15,118,110,0.3)',
            transition: 'all 0.3s'
          }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <ArrowLeft size={18} /> Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: '40px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <Link href="/" style={{ color: '#0F766E', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
            <ArrowLeft size={16} /> Continue Shopping
          </Link>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>My Wishlist</h1>
          <p style={{ color: '#6B7280' }}>{wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} saved</p>
        </div>

        {/* Wishlist Items */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {wishlist.map(item => (
            <div key={item.id} style={{
              backgroundColor: 'white', borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB',
              transition: 'all 0.3s'
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; }}
            >
              <Link href={`/products/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ position: 'relative', height: '240px', backgroundColor: '#F3F4F6' }}>
                  <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </Link>
              
              <div style={{ padding: '20px' }}>
                <Link href={`/products/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#111827', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </h3>
                </Link>
                
                {item.variant && (
                  <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px' }}>
                    Variant: {item.variant}
                  </div>
                )}
                
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F766E', marginBottom: '16px' }}>
                  Rs. {parseFloat(item.price).toLocaleString()}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => moveWishlistToCart(item.id)}
                    style={{
                      flex: 1, padding: '12px', backgroundColor: '#0F766E', color: 'white',
                      border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#115E59'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0F766E'; }}
                  >
                    <ShoppingCart size={16} /> Add to Cart
                  </button>
                  <button onClick={() => removeFromWishlist(item.id)}
                    style={{
                      padding: '12px', backgroundColor: '#FEE2E2', color: '#DC2626',
                      border: 'none', borderRadius: '10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FECACA'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Actions */}
        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            backgroundColor: '#0F766E', color: 'white',
            padding: '16px 32px', borderRadius: '50px',
            fontWeight: '700', fontSize: '16px',
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(15,118,110,0.3)',
            transition: 'all 0.3s'
          }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <ArrowLeft size={18} /> Continue Shopping
          </Link>
        </div>

      </div>
    </div>
  );
}