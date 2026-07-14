'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle, Package, Truck, CreditCard, Calendar, Copy, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface OrderItem {
  product: {
    _id: string;
    name: string;
    images: string[];
  };
  name: string;
  price: number;
  quantity: number;
  image: string;
}

interface Order {
  _id: string;
  orderId: string;
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
  };
  paymentMethod: string;
  orderStatus: string;
  paymentStatus: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;
  createdAt: string;
}

export default function OrderSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token } = useAuthStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      const orderId = searchParams.get('orderId');
      
      if (!orderId || !token) {
        router.push('/');
        return;
      }

      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (response.data.success) {
          setOrder(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching order:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [searchParams, token, router]);

  const copyOrderId = () => {
    if (order) {
      navigator.clipboard.writeText(order.orderId || order._id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
          <p style={{ color: '#6B7280' }}>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#6B7280', marginBottom: '20px' }}>Order not found</p>
          <Link href="/" style={{ color: '#0F766E', fontWeight: '600' }}>← Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', paddingBottom: '60px' }}>
      
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <Link href="/" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeft size={20} /> Back to Home
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* Success Message */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '100px',
            height: '100px',
            backgroundColor: '#0F766E',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px'
          }}>
            <CheckCircle size={60} color="white" />
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
            Order Confirmed! 
          </h1>
          <p style={{ fontSize: '18px', color: '#6B7280', marginBottom: '8px' }}>
            Thank you for shopping with MevaPur
          </p>
          <p style={{ fontSize: '14px', color: '#10B981', fontWeight: '600' }}>
            We've sent a confirmation email to your registered email address
          </p>
        </div>

        {/* Order ID Card */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          textAlign: 'center',
          border: '2px solid #0F766E'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
            <Package size={20} color="#0F766E" />
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#6B7280' }}>Your Order ID</span>
          </div>
          <div style={{
            fontSize: '28px',
            fontWeight: '800',
            color: '#0F766E',
            fontFamily: 'monospace',
            marginBottom: '16px',
            letterSpacing: '1px'
          }}>
            {order.orderId || order._id}
          </div>
          <button
            onClick={copyOrderId}
            style={{
              backgroundColor: copied ? '#10B981' : '#0F766E',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              if (!copied) {
                e.currentTarget.style.backgroundColor = '#115E59';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={e => {
              if (!copied) {
                e.currentTarget.style.backgroundColor = '#0F766E';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <Copy size={16} />
            {copied ? 'Copied!' : 'Copy Order ID'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          
          {/* Order Details */}
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} color="#0F766E" /> Order Details
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>Order Date</span>
                <span style={{ fontWeight: '600', color: '#111827' }}>{formatDate(order.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>Order Status</span>
                <span style={{
                  padding: '4px 12px',
                  backgroundColor: '#D1FAE5',
                  color: '#0F766E',
                  borderRadius: '20px',
                  fontWeight: '600',
                  fontSize: '13px'
                }}>
                  {order.orderStatus}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>Payment Status</span>
                <span style={{
                  padding: '4px 12px',
                  backgroundColor: order.paymentStatus === 'Paid' ? '#D1FAE5' : '#FEF3C7',
                  color: order.paymentStatus === 'Paid' ? '#0F766E' : '#92400E',
                  borderRadius: '20px',
                  fontWeight: '600',
                  fontSize: '13px'
                }}>
                  {order.paymentStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard size={20} color="#0F766E" /> Payment Method
            </h3>
            <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                {order.paymentMethod === 'COD' ? ' Cash on Delivery' : order.paymentMethod}
              </div>
              <div style={{ fontSize: '13px', color: '#6B7280' }}>
                {order.paymentMethod === 'COD' ? 'Pay when you receive' : 'Online payment'}
              </div>
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck size={20} color="#0F766E" /> Shipping Address
          </h3>
          <div style={{ padding: '20px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
            <div style={{ fontWeight: '700', color: '#111827', fontSize: '16px', marginBottom: '8px' }}>
              {order.shippingAddress.fullName}
            </div>
            <div style={{ color: '#374151', lineHeight: '1.6', marginBottom: '8px' }}>
              {order.shippingAddress.address}<br />
              {order.shippingAddress.city} {order.shippingAddress.postalCode && `- ${order.shippingAddress.postalCode}`}
            </div>
            <div style={{ color: '#6B7280', fontSize: '14px' }}>
              📱 {order.shippingAddress.phone}
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>
            Order Items ({order.items.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {order.items.map((item, index) => (
              <div key={index} style={{
                display: 'flex',
                gap: '16px',
                padding: '20px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E5E7EB'
              }}>
                <img
                  src={item.image || item.product?.images?.[0]}
                  alt={item.name}
                  style={{
                    width: '100px',
                    height: '100px',
                    objectFit: 'cover',
                    borderRadius: '8px'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', color: '#111827', fontSize: '16px', marginBottom: '8px' }}>
                    {item.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#6B7280' }}>
                      Quantity: <span style={{ fontWeight: '600', color: '#111827' }}>{item.quantity}</span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F766E' }}>
                      Rs. {(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Summary */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>
            Order Summary
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E5E7EB' }}>
              <span style={{ color: '#6B7280' }}>Subtotal ({order.items.reduce((a, b) => a + b.quantity, 0)} items)</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>Rs. {order.subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E5E7EB' }}>
              <span style={{ color: '#6B7280' }}>Shipping</span>
              <span style={{ fontWeight: '600', color: order.shippingCost === 0 ? '#0F766E' : '#111827' }}>
                {order.shippingCost === 0 ? 'FREE' : `Rs. ${order.shippingCost.toFixed(2)}`}
              </span>
            </div>
            {order.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E5E7EB' }}>
                <span style={{ color: '#10B981' }}>Discount</span>
                <span style={{ fontWeight: '600', color: '#10B981' }}>-Rs. {order.discount.toFixed(2)}</span>
              </div>
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '20px 0',
              marginTop: '12px',
              borderTop: '2px solid #E5E7EB',
              fontSize: '20px',
              fontWeight: '800',
              color: '#0F766E'
            }}>
              <span>Total</span>
              <span>Rs. {order.totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push(`/orders/${order._id}`)}
            style={{
              backgroundColor: '#0F766E',
              color: 'white',
              border: 'none',
              padding: '16px 32px',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
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
            <Package size={20} /> Track Order
          </button>
          <Link
            href="/"
            style={{
              backgroundColor: 'white',
              color: '#0F766E',
              border: '2px solid #0F766E',
              padding: '16px 32px',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '16px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.3s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F0FDFA';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <ArrowLeft size={20} /> Continue Shopping
          </Link>
        </div>

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