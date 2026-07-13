'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, Truck, CreditCard, Calendar, MapPin, Download, RotateCcw, ShoppingCart, Star, MessageCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { mockOrders } from '@/data/mockOrders';
import OrderTimeline from '@/components/OrderTimeline';
import { useState } from 'react';
import Toast from '@/components/Toast';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;
  const order = mockOrders.find(o => o.id === orderId);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

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
    'pending': { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
    'confirmed': { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
    'processing': { bg: '#E0E7FF', text: '#4338CA', border: '#6366F1' },
    'packed': { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
    'shipped': { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
    'out-for-delivery': { bg: '#CFFAFE', text: '#155E75', border: '#06B6D4' },
    'delivered': { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
    'cancelled': { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
    'returned': { bg: '#FED7AA', text: '#9A3412', border: '#F97316' },
    'refunded': { bg: '#E5E7EB', text: '#374151', border: '#6B7280' }
  };

  const statusColor = statusColors[order.orderStatus] || statusColors.pending;

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
                <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', margin: 0 }}>Order #{order.orderNumber}</h1>
                <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0 0' }}>
                  Placed on {new Date(order.orderDate).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            <div style={{
              backgroundColor: statusColor.bg, color: statusColor.text,
              padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '700',
              border: `1px solid ${statusColor.border}`, textTransform: 'capitalize'
            }}>
              {order.orderStatus.replace('-', ' ')}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
          
          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Order Timeline */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck size={20} color="#0F766E" /> Order Timeline
              </h3>
              <OrderTimeline timeline={order.timeline} />
            </div>

            {/* Products */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={20} color="#0F766E" /> Products ({order.items.length})
              </h3>
              {order.items.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: '16px', padding: '16px', marginBottom: '12px', backgroundColor: '#F8FAFC', borderRadius: '12px' }}>
                  <img src={item.image} alt={item.name} style={{ width: '100px', height: '100px', borderRadius: '10px', objectFit: 'cover' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Variant: {item.variant}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>SKU: {item.sku}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', color: '#6B7280' }}>Qty: {item.quantity}</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F766E' }}>Rs. {(item.price * item.quantity).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Shipping Address */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={20} color="#0F766E" /> Shipping Address
              </h3>
              <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.8' }}>
                <strong>{order.shippingAddress.name}</strong><br />
                {order.shippingAddress.address}<br />
                {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}<br />
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
                    <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Courier</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>{order.courier}</div>
                  </div>
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
                  <span style={{ fontWeight: '600' }}>Rs. {order.subtotal.toLocaleString()}</span>
                </div>
                {order.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', color: '#0F766E' }}>
                    <span>Discount</span>
                    <span style={{ fontWeight: '600' }}>-Rs. {order.discount}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Shipping</span>
                  <span style={{ fontWeight: '600', color: '#0F766E' }}>{order.shipping === 0 ? 'FREE' : `Rs. ${order.shipping}`}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Tax</span>
                  <span style={{ fontWeight: '600' }}>Rs. {order.tax}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: '800', color: '#0F766E', paddingTop: '16px', borderTop: '2px solid #E5E7EB', marginBottom: '24px' }}>
                <span>Total</span>
                <span>Rs. {order.totalAmount.toLocaleString()}</span>
              </div>

              {/* Payment Info */}
              <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '10px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <CreditCard size={16} color="#0F766E" />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F766E' }}>Payment Method</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{order.paymentMethod}</div>
                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', textTransform: 'capitalize' }}>
                  Status: {order.paymentStatus.replace('-', ' ')}
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
                
                {order.orderStatus === 'delivered' && (
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
                    <button onClick={() => setToast({ message: '🔄 Return request submitted', type: 'success' })} style={{
                      width: '100%', backgroundColor: 'white', color: '#DC2626', border: '1px solid #FCA5A5',
                      padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}>
                      <RotateCcw size={16} /> Request Return
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
    </div>
  );
}