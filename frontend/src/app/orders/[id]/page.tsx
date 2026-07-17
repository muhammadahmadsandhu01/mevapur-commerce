'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, Truck, CreditCard, MapPin, Download, RotateCcw, ShoppingCart, Star, MessageCircle, Loader } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import axios from 'axios';
import Toast from '@/components/Toast';

interface OrderItem {
  product?: any;
  name: string;
  price: number | string;
  quantity: number;
  image?: string;
}

interface TimelineStep {
  status: string;
  timestamp: string;
  note?: string;
}

interface Order {
  _id: string;
  orderId: string;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number | string;
  shippingCost: number | string;
  discount: number | string;
  totalAmount: number | string;
  createdAt: string;
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode?: string;
  };
  statusTimeline?: TimelineStep[];
  timeline?: TimelineStep[];
  trackingNumber?: string;
}

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuthStore();
  
  // ✅ FIXED: params.id instead of params.orderid
  const orderId = params.id as string; 
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!token) {
        router.push('/login?redirect=/orders/' + orderId);
        return;
      }

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        if (data.success) {
          setOrder(data.data);
        }
      } catch (error) {
        console.error('Error fetching order:', error);
        setToast({ message: 'Failed to load order details', type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId, token, router]);

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#0F766E' }} />
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: '100px', marginBottom: '24px' }}>❌</div>
        <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>Order Not Found</h2>
        <Link href="/orders" style={{ backgroundColor: '#0F766E', color: 'white', padding: '14px 32px', borderRadius: '50px', fontWeight: '700', textDecoration: 'none' }}>
          Back to Orders
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    'Pending': { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
    'Processing': { bg: '#E0E7FF', text: '#4338CA', border: '#6366F1' },
    'Shipped': { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
    'Delivered': { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
    'Cancelled': { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' }
  };

  const statusColor = statusColors[order.orderStatus] || statusColors.Pending;

  const renderTimeline = () => {
    const timelineData = order.statusTimeline || order.timeline || [];
    if (timelineData.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {timelineData.map((step, index) => (
          <div key={index} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%', 
              backgroundColor: '#0F766E', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Truck size={20} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', color: '#111827', marginBottom: '4px' }}>{step.status}</div>
              <div style={{ fontSize: '14px', color: '#6B7280' }}>
                {new Date(step.timestamp).toLocaleString('en-PK')}
              </div>
              {step.note && (
                <div style={{ fontSize: '13px', color: '#0F766E', marginTop: '4px' }}>{step.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const subtotal = Number(order.subtotal) || 0;
  const shippingCost = Number(order.shippingCost) || 0;
  const discount = Number(order.discount) || 0;
  const totalAmount = Number(order.totalAmount) || 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F8FA', paddingBottom: '60px' }}>
      
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Link href="/orders" style={{ color: '#6B7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px' }}>
              <ArrowLeft size={18} /> Back to Orders
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Package size={28} color="#0F766E" />
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', margin: 0 }}>Order #{order.orderId}</h1>
                <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0 0' }}>
                  Placed on {new Date(order.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            <div style={{
              backgroundColor: statusColor.bg, color: statusColor.text,
              padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '700',
              border: `1px solid ${statusColor.border}`, textTransform: 'capitalize'
            }}>
              {order.orderStatus}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
          
          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Order Timeline */}
            {(order.statusTimeline || order.timeline) && (order.statusTimeline || order.timeline)!.length > 0 && (
              <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={20} color="#0F766E" /> Order Timeline
                </h3>
                {renderTimeline()}
              </div>
            )}

            {/* Products */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={20} color="#0F766E" /> Products ({order.items.length})
              </h3>
              {order.items.map((item, index) => {
                const productName = typeof item.product === 'object' ? item.product.name : item.name;
                const productImage = item.image || (typeof item.product === 'object' ? item.product.images?.[0] : null) || '/placeholder.png';
                
                return (
                  <div key={index} style={{ display: 'flex', gap: '16px', padding: '16px', marginBottom: '12px', backgroundColor: '#F8FAFC', borderRadius: '12px' }}>
                    <img src={productImage} alt={productName} style={{ width: '100px', height: '100px', borderRadius: '10px', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>{productName}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', color: '#6B7280' }}>Qty: {item.quantity}</div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F766E' }}>Rs. {(Number(item.price) * item.quantity).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shipping Address */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={20} color="#0F766E" /> Shipping Address
              </h3>
              <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.8' }}>
                <strong>{order.shippingAddress.fullName}</strong><br />
                {order.shippingAddress.address}<br />
                {order.shippingAddress.city} {order.shippingAddress.postalCode && `- ${order.shippingAddress.postalCode}`}<br />
                📞 {order.shippingAddress.phone}
              </div>
            </div>

            {/* Tracking Info */}
            {order.trackingNumber && (
              <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={20} color="#0F766E" /> Tracking Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Tracking Number</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', fontFamily: 'monospace' }}>{order.trackingNumber}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Order Summary */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', position: 'sticky', top: '100px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '20px' }}>Order Summary</h3>
              
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Subtotal</span>
                  <span style={{ fontWeight: '600' }}>Rs. {subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', color: '#0F766E' }}>
                    <span>Discount</span>
                    <span style={{ fontWeight: '600' }}>-Rs. {discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Shipping</span>
                  <span style={{ fontWeight: '600', color: shippingCost === 0 ? '#0F766E' : '#111827' }}>{shippingCost === 0 ? 'FREE' : `Rs. ${shippingCost.toFixed(2)}`}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: '800', color: '#0F766E', paddingTop: '16px', borderTop: '2px solid #E5E7EB', marginBottom: '24px' }}>
                <span>Total</span>
                <span>Rs. {totalAmount.toFixed(2)}</span>
              </div>

              {/* Payment Info */}
              <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '10px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <CreditCard size={16} color="#0F766E" />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F766E' }}>Payment Method</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{order.paymentMethod}</div>
                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', textTransform: 'capitalize' }}>
                  Status: {order.paymentStatus}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => setToast({ message: '📄 Invoice downloaded', type: 'success' })} style={{
                  width: '100%', backgroundColor: '#0F766E', color: 'white', border: 'none',
                  padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                  <Download size={16} /> Download Invoice
                </button>
                
                {order.orderStatus === 'Delivered' && (
                  <>
                    <button onClick={() => setToast({ message: '✅ Items added to cart!', type: 'success' })} style={{
                      width: '100%', backgroundColor: 'white', color: '#0F766E', border: '2px solid #0F766E',
                      padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}>
                      <ShoppingCart size={16} /> Buy Again
                    </button>
                    <button onClick={() => setToast({ message: '⭐ Opening review form...', type: 'info' })} style={{
                      width: '100%', backgroundColor: 'white', color: '#374151', border: '1px solid #E5E7EB',
                      padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}>
                      <Star size={16} /> Leave Review
                    </button>
                  </>
                )}
                
                <button onClick={() => setToast({ message: '💬 Opening support chat...', type: 'info' })} style={{
                  width: '100%', backgroundColor: 'white', color: '#374151', border: '1px solid #E5E7EB',
                  padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                  <MessageCircle size={16} /> Contact Support
                </button>
              </div>
            </div>
          </div>
        </div>
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