'use client';

import { useCartStore } from '@/store/cartStore';
import { 
  Trash2, Plus, Minus, ArrowLeft, ShoppingBag, CheckCircle, Truck, Shield, 
  Heart, Tag, Clock, Star, CreditCard, Gift, X, Package, Smartphone, MessageCircle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CartPage() {
  const { items, removeFromCart, updateQuantity, totalPrice, totalItems, clearCart, placeOrder } = useCartStore();
  const router = useRouter();
  const [selectedCity, setSelectedCity] = useState('Lahore');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [generatedOrderId, setGeneratedOrderId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [saveForLater, setSaveForLater] = useState<string[]>([]); // ✅ FIXED: string[]
  const [isGift, setIsGift] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null); // ✅ FIXED: string | null

  const PAKISTAN_CITIES = [
    "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", 
    "Multan", "Gujranwala", "Sialkot", "Bahawalpur", "Peshawar", "Quetta"
  ];

  const FREE_DELIVERY_THRESHOLD = 1500;
  const currentTotal = totalPrice();
  const amountForFreeDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - currentTotal);
  const deliveryProgress = Math.min(100, (currentTotal / FREE_DELIVERY_THRESHOLD) * 100);

  // Coupon Codes
  const COUPONS: Record<string, number> = {
    'MEVA20': 20,
    'FIRSTORDER': 15,
    'RAMADAN': 25,
    'WELCOME': 10
  };

  const applyCoupon = () => {
    const upperCode = couponCode.toUpperCase();
    if (COUPONS[upperCode]) {
      setDiscount(COUPONS[upperCode]);
      setAppliedCoupon(upperCode);
    } else {
      alert('Invalid coupon code. Try: MEVA20, FIRSTORDER, RAMADAN');
    }
  };

  const handleCheckout = () => {
    router.push('/checkout');
  };

  const toggleSaveForLater = (id: string) => { // ✅ FIXED: string parameter
    setSaveForLater(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleRemove = (id: string) => { // ✅ FIXED: string parameter
    setRemovingId(id);
    setTimeout(() => {
      removeFromCart(id);
      setRemovingId(null);
    }, 300);
  };

  // Recommended Products
  const recommendedProducts = [
    { id: '101', name: 'Premium Honey', price: '450', image: 'https://images.unsplash.com/photo-1587049352846-4a222e773a0e?w=300&h=300&fit=crop', rating: 5, badge: 'Best Seller' },
    { id: '102', name: 'Organic Dates', price: '350', image: 'https://images.unsplash.com/photo-1601379766822-1c8b2879074f?w=300&h=300&fit=crop', rating: 5, badge: '20% OFF' },
    { id: '103', name: 'Walnuts', price: '600', image: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=300&h=300&fit=crop', rating: 4, badge: 'Premium' },
    { id: '104', name: 'Almonds', price: '550', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=300&h=300&fit=crop', rating: 5, badge: 'Organic' },
  ];

  // Frequently Bought Together
  const frequentlyBought = [
    { id: '201', name: 'Almonds 500g', price: '550', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=200&h=200&fit=crop' },
    { id: '202', name: 'Honey 250g', price: '450', image: 'https://images.unsplash.com/photo-1587049352846-4a222e773a0e?w=200&h=200&fit=crop' },
    { id: '203', name: 'Walnuts 500g', price: '600', image: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=200&h=200&fit=crop' },
  ];

  // ✅ ORDER CONFIRMATION
  if (orderPlaced && generatedOrderId) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px', backgroundColor: '#F0FDFA' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '48px', maxWidth: '600px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
          <div style={{ width: '100px', height: '100px', backgroundColor: '#0F766E', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', animation: 'scaleIn 0.5s ease' }}>
            <CheckCircle size={50} color="white" />
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>Order Confirmed! 🎉</h2>
          <p style={{ color: '#6B7280', marginBottom: '32px' }}>Thank you for shopping with MevaPur</p>
          
          <div style={{ backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '28px', marginBottom: '32px', border: '3px dashed #0F766E' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', justifyContent: 'center' }}>
              <Package size={24} color="#0F766E" />
              <span style={{ fontWeight: '700', color: '#111827', fontSize: '16px' }}>Your Order ID</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#0F766E', fontFamily: 'monospace', letterSpacing: '2px', marginBottom: '12px', padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '2px solid #E5E7EB' }}>
              {generatedOrderId}
            </div>
            <p style={{ fontSize: '13px', color: '#6B7280' }}>Save this ID to track your order</p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/" style={{ flex: 1, minWidth: '140px', backgroundColor: '#F3F4F6', color: '#111827', padding: '14px 24px', borderRadius: '12px', fontWeight: '600', textDecoration: 'none', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <ArrowLeft size={18} /> Continue Shopping
            </Link>
            <button onClick={() => router.push('/orders')} style={{ flex: 1, minWidth: '140px', backgroundColor: '#0F766E', color: 'white', border: 'none', padding: '14px 24px', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Package size={18} /> Track Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ EMPTY CART
  if (items.length === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: '120px', marginBottom: '24px' }}></div>
        <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>Your Cart is Empty</h2>
        <p style={{ color: '#6B7280', marginBottom: '32px', fontSize: '16px' }}>Add some premium dry fruits to get started!</p>
        <Link href="/" style={{ backgroundColor: '#0F766E', color: 'white', padding: '16px 40px', borderRadius: '50px', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(15,118,110,0.3)', transition: 'all 0.3s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,118,110,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,118,110,0.3)'; }}
        >
          <ArrowLeft size={20} /> Continue Shopping
        </Link>
      </div>
    );
  }

  const finalTotal = currentTotal - (currentTotal * discount / 100);
  const shippingCost = finalTotal >= FREE_DELIVERY_THRESHOLD ? 0 : 150;
  const grandTotal = finalTotal + shippingCost;
  const totalSavings = (currentTotal * discount / 100) + (shippingCost === 0 ? 150 : 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', paddingBottom: '100px' }}>
      
      {/* 1. BREADCRUMB NAVIGATION */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '16px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#6B7280' }}>
            <Link href="/" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '600' }}>Home</Link>
            <span>/</span>
            <Link href="/" style={{ color: '#6B7280', textDecoration: 'none' }}>Shop</Link>
            <span>/</span>
            <span style={{ color: '#111827', fontWeight: '600' }}>Shopping Cart</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* 2. DELIVERY PROGRESS BAR */}
        <div style={{ backgroundColor: amountForFreeDelivery === 0 ? '#D1FAE5' : '#FEF3C7', borderRadius: '16px', padding: '28px', marginBottom: '32px', border: amountForFreeDelivery === 0 ? '2px solid #0F766E' : '2px solid #F59E0B' }}>
          {amountForFreeDelivery === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ fontSize: '50px' }}>🎉</div>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0F766E', marginBottom: '6px' }}>
                  Congratulations! You unlocked FREE Delivery
                </h3>
                <p style={{ color: '#6B7280', fontSize: '14px' }}>Your order qualifies for free shipping across Pakistan</p>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <Truck size={28} color="#F59E0B" />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#92400E', marginBottom: '6px' }}>
                    You're Rs. {amountForFreeDelivery.toLocaleString()} away from FREE Delivery
                  </h3>
                  <p style={{ color: '#6B7280', fontSize: '14px' }}>Add more items to unlock free shipping</p>
                </div>
              </div>
              <div style={{ backgroundColor: 'white', borderRadius: '12px', height: '14px', overflow: 'hidden', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}>
                <div style={{ width: `${deliveryProgress}%`, height: '100%', backgroundColor: '#F59E0B', borderRadius: '12px', transition: 'width 0.5s ease', boxShadow: '0 2px 8px rgba(245,158,11,0.4)' }} />
              </div>
              <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '10px', textAlign: 'right', fontWeight: '600' }}>
                {Math.round(deliveryProgress)}% towards free delivery
              </p>
            </div>
          )}
        </div>

        {/* 29. IMPROVED CART TITLE */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>
            Shopping Cart
          </h1>
          <p style={{ fontSize: '16px', color: '#6B7280' }}>
            {items.reduce((sum, item) => sum + item.quantity, 0)} {items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'Premium Item' : 'Premium Items'} Ready to Checkout
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: '40px', alignItems: 'start' }}>
          
          {/* LEFT: CART ITEMS */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShoppingBag size={24} color="#0F766E" />
                <span style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>Cart Items</span>
              </div>
              <button onClick={clearCart} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', padding: '8px 16px', borderRadius: '8px', transition: 'all 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Clear Cart
              </button>
            </div>

            {/* CART ITEMS LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
              {items.map((item) => (
                <div key={item.id} style={{ 
                  backgroundColor: 'white', 
                  borderRadius: '16px', 
                  padding: '28px', 
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)', 
                  display: 'flex', 
                  gap: '24px', 
                  alignItems: 'flex-start',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  opacity: removingId === item.id ? 0 : 1,
                  transform: removingId === item.id ? 'translateX(20px)' : 'translateX(0)',
                  maxHeight: removingId === item.id ? 0 : '500px',
                  overflow: 'hidden'
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(15,118,110,0.15)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={e => {
                    if (removingId !== item.id) {
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {/* 24. BETTER IMAGES + 12. PRODUCT BADGES */}
                  <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <img src={item.image} alt={item.name} style={{ width: '160px', height: '160px', objectFit: 'cover', transition: 'transform 0.3s' }} 
                      onMouseEnter={e => (e.target as HTMLImageElement).style.transform = 'scale(1.1)'}
                      onMouseLeave={e => (e.target as HTMLImageElement).style.transform = 'scale(1)'}
                    />
                    <div style={{ position: 'absolute', top: '10px', left: '10px', backgroundColor: '#0F766E', color: 'white', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                      20% OFF
                    </div>
                    <div style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', color: '#0F766E' }}>
                      Organic
                    </div>
                  </div>

                  {/* Product Details */}
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '10px' }}>{item.name}</h3>
                    
                    {/* Rating */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={16} fill="#F59E0B" color="#F59E0B" />
                        ))}
                      </div>
                      <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '500' }}>(128 reviews)</span>
                    </div>
                    
                    {/* 13. PRODUCT INFORMATION */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '10px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Weight</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>1kg</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Origin</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>Gilgit</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Organic</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F766E' }}>Yes ✓</div>
                      </div>
                    </div>

                    {/* 4. PRODUCT STOCK + 3. ESTIMATED DELIVERY */}
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0F766E', fontWeight: '700', backgroundColor: '#D1FAE5', padding: '6px 12px', borderRadius: '8px' }}>
                        <div style={{ width: '10px', height: '10px', backgroundColor: '#0F766E', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                        In Stock ({item.stock || 100} left)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0F766E', fontWeight: '600', backgroundColor: '#F0FDFA', padding: '6px 12px', borderRadius: '8px' }}>
                        <Clock size={16} />
                        Delivery by Tuesday
                      </div>
                      {(item.stock || 100) < 10 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#DC2626', fontWeight: '700', backgroundColor: '#FEE2E2', padding: '6px 12px', borderRadius: '8px' }}>
                          🔥 Fast Selling
                        </div>
                      )}
                    </div>

                    {/* Price */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '20px' }}>
                      <span style={{ fontSize: '28px', fontWeight: '800', color: '#0F766E' }}>Rs. {item.price}</span>
                      <span style={{ fontSize: '16px', color: '#9CA3AF', textDecoration: 'line-through' }}>Rs. {(parseFloat(item.price) * 1.25).toFixed(0)}</span>
                    </div>

                    {/* 5. SAVE FOR LATER + Remove */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={() => toggleSaveForLater(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: '2px solid #E5E7EB', color: saveForLater.includes(item.id) ? '#EF4444' : '#6B7280', cursor: 'pointer', fontSize: '14px', fontWeight: '700', padding: '10px 16px', borderRadius: '10px', transition: 'all 0.2s' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#EF4444';
                          e.currentTarget.style.color = '#EF4444';
                        }}
                        onMouseLeave={e => {
                          if (!saveForLater.includes(item.id)) {
                            e.currentTarget.style.borderColor = '#E5E7EB';
                            e.currentTarget.style.color = '#6B7280';
                          }
                        }}
                      >
                        <Heart size={18} fill={saveForLater.includes(item.id) ? 'currentColor' : 'none'} /> 
                        {saveForLater.includes(item.id) ? 'Saved' : 'Save for Later'}
                      </button>
                      <button onClick={() => handleRemove(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: '2px solid #E5E7EB', color: '#EF4444', cursor: 'pointer', fontSize: '14px', fontWeight: '700', padding: '10px 16px', borderRadius: '10px', transition: 'all 0.2s' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = '#FEE2E2';
                          e.currentTarget.style.borderColor = '#EF4444';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.borderColor = '#E5E7EB';
                        }}
                      >
                        <Trash2 size={18} /> Remove
                      </button>
                    </div>
                  </div>

                  {/* 10. BETTER QUANTITY SELECTOR */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '6px', border: '2px solid #E5E7EB', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                      <button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '800', color: '#111827', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.color = 'white'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#111827'; e.currentTarget.style.transform = 'scale(1)'; }}
                      >−</button>
                      <span style={{ fontWeight: '800', minWidth: '48px', textAlign: 'center', fontSize: '18px', color: '#111827' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '800', color: '#111827', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.color = 'white'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#111827'; e.currentTarget.style.transform = 'scale(1)'; }}
                      >+</button>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F766E' }}>
                      Rs. {(parseFloat(item.price) * item.quantity).toFixed(0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 15. FREQUENTLY BOUGHT TOGETHER */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', marginBottom: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>Frequently Bought Together</h3>
              <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>Complete your order with these popular items</p>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                {frequentlyBought.map((product, index) => (
                  <div key={product.id} style={{ textAlign: 'center', cursor: 'pointer', flex: 1, minWidth: '120px' }}>
                    <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '12px', position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      <img src={product.image} alt={product.name} style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                      {index === 0 && <div style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: '#F59E0B', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800' }}>POPULAR</div>}
                    </div>
                    <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>{product.name}</h4>
                    <p style={{ fontSize: '15px', fontWeight: '800', color: '#0F766E' }}>Rs. {product.price}</p>
                  </div>
                ))}
                <div style={{ fontSize: '24px', color: '#0F766E', fontWeight: '800' }}>+</div>
                <button style={{ backgroundColor: '#0F766E', color: 'white', border: 'none', padding: '16px 32px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 12px rgba(15,118,110,0.3)', transition: 'all 0.3s' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  Add Bundle
                </button>
              </div>
            </div>

            {/* 14. YOU MAY ALSO LIKE */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', marginBottom: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>You May Also Like</h3>
              <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>Based on your cart</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                {recommendedProducts.map(product => (
                  <div key={product.id} style={{ textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}
                  >
                    <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '12px', position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      <img src={product.image} alt={product.name} style={{ width: '100%', height: '160px', objectFit: 'cover', transition: 'transform 0.3s' }} 
                        onMouseEnter={e => (e.target as HTMLImageElement).style.transform = 'scale(1.1)'}
                        onMouseLeave={e => (e.target as HTMLImageElement).style.transform = 'scale(1)'}
                      />
                      <div style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: '#0F766E', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '800' }}>{product.badge}</div>
                      <button style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'white', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'white'; }}
                      >
                        <Heart size={18} color="#EF4444" />
                      </button>
                    </div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '6px' }}>{product.name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}>
                      <Star size={14} fill="#F59E0B" color="#F59E0B" />
                      <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: '600' }}>{product.rating}</span>
                    </div>
                    <p style={{ fontSize: '17px', fontWeight: '800', color: '#0F766E' }}>Rs. {product.price}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 22. CONTINUE SHOPPING */}
            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: '#0F766E', fontWeight: '700', textDecoration: 'none', fontSize: '16px', padding: '12px 20px', borderRadius: '10px', transition: 'all 0.2s', backgroundColor: '#F0FDFA' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#D1FAE5'; e.currentTarget.style.transform = 'translateX(-4px)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#F0FDFA'; e.currentTarget.style.transform = 'translateX(0)'; }}
            >
              <ArrowLeft size={20} /> Continue Shopping
            </Link>
          </div>

          {/* RIGHT: 17. STICKY ORDER SUMMARY */}
          <div style={{ position: 'sticky', top: '100px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', border: '2px solid #E5E7EB' }}>
              <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#111827', marginBottom: '28px', paddingBottom: '20px', borderBottom: '2px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingBag size={24} color="#0F766E" />
                Order Summary
              </h3>

              {/* 7. COUPON SECTION */}
              {!appliedCoupon ? (
                <div style={{ marginBottom: '28px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag size={18} color="#0F766E" />
                    Have a Coupon?
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                      type="text" 
                      placeholder="MEVA20, FIRSTORDER..." 
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      style={{ flex: 1, padding: '14px 16px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', fontWeight: '600', transition: 'all 0.2s' }}
                      onFocus={e => e.currentTarget.style.borderColor = '#0F766E'}
                      onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'}
                    />
                    <button onClick={applyCoupon} style={{ backgroundColor: '#F59E0B', color: 'white', border: 'none', padding: '14px 24px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#D97706'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#F59E0B'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#D1FAE5', borderRadius: '10px', padding: '16px', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '2px solid #0F766E' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Tag size={20} color="#0F766E" />
                    <span style={{ fontWeight: '700', color: '#0F766E', fontSize: '14px' }}>Coupon {appliedCoupon} Applied ({discount}% OFF)</span>
                  </div>
                  <button onClick={() => { setAppliedCoupon(null); setDiscount(0); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#A7F3D0'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <X size={20} color="#0F766E" />
                  </button>
                </div>
              )}

              {/* 20. GIFT OPTION */}
              <div style={{ marginBottom: '28px', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '2px solid #E5E7EB', cursor: 'pointer', transition: 'all 0.2s' }}
                onClick={() => setIsGift(!isGift)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.backgroundColor = '#F0FDFA'; }}
                onMouseLeave={e => { if (!isGift) { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.backgroundColor = '#F8FAFC'; } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: `2px solid ${isGift ? '#0F766E' : '#E5E7EB'}`, backgroundColor: isGift ? '#0F766E' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                    {isGift && <CheckCircle size={16} color="white" />}
                  </div>
                  <Gift size={20} color={isGift ? '#0F766E' : '#6B7280'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', color: '#111827', fontSize: '14px' }}>This order is a gift</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>Add gift wrapping and message</div>
                  </div>
                </div>
              </div>

              {/* 26. ORDER SUMMARY BREAKDOWN */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '15px' }}>
                  <span style={{ color: '#6B7280', fontWeight: '500' }}>Subtotal ({items.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
                  <span style={{ fontWeight: '700', color: '#111827' }}>Rs. {currentTotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '15px', color: '#0F766E' }}>
                    <span>Discount ({discount}%)</span>
                    <span style={{ fontWeight: '700' }}>-Rs. {(currentTotal * discount / 100).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '15px' }}>
                  <span style={{ color: '#6B7280', fontWeight: '500' }}>Shipping</span>
                  <span style={{ fontWeight: '700', color: shippingCost === 0 ? '#0F766E' : '#111827' }}>
                    {shippingCost === 0 ? 'FREE ✓' : `Rs. ${shippingCost.toFixed(2)}`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '15px', color: '#6B7280' }}>
                  <span>Estimated Delivery</span>
                  <span style={{ fontWeight: '600', color: '#0F766E' }}>Tuesday</span>
                </div>
              </div>

              {/* 18. SAVINGS */}
              {totalSavings > 0 && (
                <div style={{ backgroundColor: '#FEF3C7', borderRadius: '12px', padding: '16px', marginBottom: '24px', textAlign: 'center', border: '2px solid #F59E0B' }}>
                  <p style={{ fontSize: '15px', color: '#92400E', fontWeight: '800' }}>
                    🎉 You Saved Rs. {totalSavings.toFixed(2)}
                  </p>
                </div>
              )}

              {/* 19. ESTIMATED TAX */}
              <div style={{ marginBottom: '24px', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '10px', fontSize: '13px', color: '#6B7280' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Estimated Tax</span>
                  <span style={{ fontWeight: '600' }}>Rs. 0.00 (Included)</span>
                </div>
              </div>

              {/* GRAND TOTAL */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px', fontSize: '26px', fontWeight: '800', color: '#0F766E', paddingTop: '24px', borderTop: '3px solid #E5E7EB' }}>
                <span>Total</span>
                <span>Rs. {grandTotal.toFixed(2)}</span>
              </div>

              {/* 27. CHECKOUT BUTTON */}
              <button onClick={handleCheckout} style={{ width: '100%', backgroundColor: '#0F766E', color: 'white', border: 'none', padding: '20px', borderRadius: '12px', fontSize: '17px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px', transition: 'all 0.3s' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,118,110,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,118,110,0.4)'; }}
              >
                <ShoppingBag size={22} /> Proceed to Checkout
              </button>

              {/* 8. TRUST BADGES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6B7280', justifyContent: 'center', padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                  <Shield size={16} color="#0F766E" />
                  <span>Secure Checkout</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6B7280', justifyContent: 'center', padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                  <CreditCard size={16} color="#0F766E" />
                  <span>COD Available</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6B7280', justifyContent: 'center', padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                  <Truck size={16} color="#0F766E" />
                  <span>Fast Delivery</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6B7280', justifyContent: 'center', padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                  <CheckCircle size={16} color="#0F766E" />
                  <span>Easy Returns</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 28. FLOATING HELP (WhatsApp) */}
      <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 1000 }}>
        <button style={{ backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '50%', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 20px rgba(37,211,102,0.4)', transition: 'all 0.3s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(37,211,102,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(37,211,102,0.4)'; }}
        >
          <MessageCircle size={32} />
        </button>
        <div style={{ position: 'absolute', bottom: '70px', right: '0', backgroundColor: 'white', padding: '12px 20px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
          Need Help? Chat with us
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}