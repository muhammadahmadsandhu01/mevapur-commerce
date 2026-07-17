'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, Package, User, MapPin, Phone, Mail,
  CreditCard, Truck, CheckCircle, Clock, XCircle,
  Calendar, DollarSign, Printer, Send, Edit3,
  Loader, AlertCircle, Save, X, Star, ShoppingBag
} from 'lucide-react';
import api from '@/lib/api';

interface OrderItem {
  _id?: string;
  product?: string | { _id: string; name: string; images?: string[] };
  name: string;
  price: number;
  quantity: number;
  image?: string;
  variant?: string;
  sku?: string;
}

interface TimelineEntry {
  status: string;
  timestamp: string;
  note?: string;
}

interface Order {
  _id: string;
  orderId: string;
  user?: {
    _id: string;
    fullName: string;
    email: string;
    phone?: string;
  };
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;
  statusTimeline?: TimelineEntry[];
  notes?: string;
  adminNotes?: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/orders/${orderId}`);
      if (response.data.success) {
        setOrder(response.data.data);
        setNewStatus(response.data.data.orderStatus);
        setTrackingNumber(response.data.data.trackingNumber || '');
      } else {
        setError('Order not found');
      }
    } catch (err: any) {
      console.error('Error fetching order:', err);
      setError(err.response?.data?.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    
    setUpdating(true);
    try {
      await api.put(`/orders/${orderId}/status`, {
        orderStatus: newStatus,
        adminNotes
      });
      await fetchOrder();
      setShowStatusModal(false);
      setAdminNotes('');
      alert('Order status updated successfully!');
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update order status');
    } finally {
      setUpdating(false);
    }
  };

  const handleTrackingUpdate = async () => {
    try {
      await api.put(`/orders/${orderId}`, {
        trackingNumber
      });
      await fetchOrder();
      setShowTrackingModal(false);
      alert('Tracking number updated!');
    } catch (error) {
      console.error('Error updating tracking:', error);
      alert('Failed to update tracking number');
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Delivered': return { bg: '#D1FAE5', color: '#0F766E', icon: CheckCircle, label: 'Delivered' };
      case 'Shipped': return { bg: '#DBEAFE', color: '#1E40AF', icon: Truck, label: 'Shipped' };
      case 'Processing': return { bg: '#FEF3C7', color: '#92400E', icon: Package, label: 'Processing' };
      case 'Pending': return { bg: '#F3F4F6', color: '#6B7280', icon: Clock, label: 'Pending' };
      case 'Cancelled': return { bg: '#FEE2E2', color: '#DC2626', icon: XCircle, label: 'Cancelled' };
      default: return { bg: '#F3F4F6', color: '#6B7280', icon: Clock, label: status };
    }
  };

  const getPaymentStatusConfig = (status: string) => {
    switch (status) {
      case 'Paid': return { bg: '#D1FAE5', color: '#0F766E' };
      case 'Pending': return { bg: '#FEF3C7', color: '#92400E' };
      case 'Failed': return { bg: '#FEE2E2', color: '#DC2626' };
      case 'Refunded': return { bg: '#DBEAFE', color: '#1E40AF' };
      default: return { bg: '#F3F4F6', color: '#6B7280' };
    }
  };

  const timelineSteps = [
    { key: 'Pending', label: 'Order Placed', icon: Clock },
    { key: 'Processing', label: 'Processing', icon: Package },
    { key: 'Shipped', label: 'Shipped', icon: Truck },
    { key: 'Delivered', label: 'Delivered', icon: CheckCircle }
  ];

  const getCurrentStepIndex = () => {
    if (!order) return 0;
    if (order.orderStatus === 'Cancelled') return -1;
    const index = timelineSteps.findIndex(s => s.key === order.orderStatus);
    return index === -1 ? 0 : index;
  };

  const getTimelineDate = (statusKey: string) => {
    if (!order?.statusTimeline) return null;
    const entry = order.statusTimeline.find(t => t.status === statusKey);
    return entry ? new Date(entry.timestamp) : null;
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={48} className="animate-spin text-teal-700" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <AlertCircle size={64} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
        <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
          {error || 'Order Not Found'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          The order you're looking for doesn't exist or has been removed.
        </p>
        <button
          onClick={() => router.push('/admin/orders')}
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <ArrowLeft size={18} /> Back to Orders
        </button>
      </div>
    );
  }

  const statusConfig = getStatusConfig(order.orderStatus);
  const StatusIcon = statusConfig.icon;
  const paymentConfig = getPaymentStatusConfig(order.paymentStatus);
  const currentStepIndex = getCurrentStepIndex();

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start', 
        marginBottom: '32px', 
        flexWrap: 'wrap', 
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => router.push('/admin/orders')}
            style={{
              padding: '10px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                Order #{order.orderId || order._id.slice(-8).toUpperCase()}
              </h1>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: statusConfig.bg,
                color: statusConfig.color,
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '700'
              }}>
                <StatusIcon size={14} />
                {statusConfig.label}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} />
                {new Date(order.createdAt).toLocaleString()}
              </div>
              {order.trackingNumber && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={14} />
                  Tracking: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{order.trackingNumber}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={handlePrint}
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--card-bg)'; }}
          >
            <Printer size={18} /> Print
          </button>
          <button
            onClick={() => setShowTrackingModal(true)}
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--card-bg)'; }}
          >
            <Truck size={18} /> Tracking
          </button>
          <button
            onClick={() => { setNewStatus(order.orderStatus); setShowStatusModal(true); }}
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--primary-dark)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <Edit3 size={18} /> Update Status
          </button>
        </div>
      </div>

      {/* Timeline */}
      {order.orderStatus !== 'Cancelled' && (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Truck size={20} color="var(--primary)" /> Order Progress
          </h2>
          <div style={{ position: 'relative' }}>
            {/* Progress Line */}
            <div style={{
              position: 'absolute',
              top: '24px',
              left: '40px',
              right: '40px',
              height: '3px',
              backgroundColor: 'var(--border-color)'
            }}>
              <div style={{
                height: '100%',
                width: `${(currentStepIndex / (timelineSteps.length - 1)) * 100}%`,
                backgroundColor: 'var(--primary)',
                transition: 'width 0.5s ease'
              }} />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${timelineSteps.length}, 1fr)`,
              gap: '16px',
              position: 'relative'
            }}>
              {timelineSteps.map((step, index) => {
                const StepIcon = step.icon;
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const stepDate = getTimelineDate(step.key);

                return (
                  <div key={step.key} style={{ textAlign: 'center', position: 'relative' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: isCompleted ? 'var(--primary)' : 'var(--bg-primary)',
                      border: isCurrent ? '3px solid var(--primary)' : '3px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                      transition: 'all 0.3s',
                      boxShadow: isCurrent ? '0 0 0 4px rgba(15, 118, 110, 0.2)' : 'none'
                    }}>
                      <StepIcon size={20} color={isCompleted ? 'white' : 'var(--text-secondary)'} />
                    </div>
                    <div style={{
                      fontWeight: '700',
                      fontSize: '14px',
                      color: isCompleted ? 'var(--text-primary)' : 'var(--text-secondary)',
                      marginBottom: '4px'
                    }}>
                      {step.label}
                    </div>
                    {stepDate && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {stepDate.toLocaleDateString()}
                        <div style={{ fontSize: '11px' }}>{stepDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )}
                    {!stepDate && isCompleted && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Completed</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cancelled Notice */}
      {order.orderStatus === 'Cancelled' && (
        <div style={{
          backgroundColor: '#FEE2E2',
          border: '1px solid #EF4444',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <XCircle size={32} color="#DC2626" />
          <div>
            <div style={{ fontWeight: '700', color: '#991B1B', fontSize: '16px', marginBottom: '4px' }}>
              This order has been cancelled
            </div>
            <div style={{ color: '#991B1B', fontSize: '14px' }}>
              {order.statusTimeline?.find(t => t.status === 'Cancelled')?.note || 'No cancellation reason provided.'}
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Order Items */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShoppingBag size={20} color="var(--primary)" /> Order Items ({order.items.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {order.items.map((item, index) => {
                const productImage = item.image || 
                  (typeof item.product === 'object' ? item.product.images?.[0] : null) ||
                  'https://via.placeholder.com/80x80?text=No+Image';
                const productName = item.name || (typeof item.product === 'object' ? item.product.name : 'Unknown Product');
                
                return (
                  <div key={index} style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '16px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    transition: 'all 0.2s'
                  }}>
                    <img
                      src={productImage}
                      alt={productName}
                      style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80x80?text=No+Image'; }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px', marginBottom: '4px' }}>
                        {productName}
                      </div>
                      {item.variant && (
                        <div style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          backgroundColor: 'var(--primary-light)',
                          color: 'var(--primary)',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          marginBottom: '8px'
                        }}>
                          {item.variant}
                        </div>
                      )}
                      {item.sku && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          SKU: {item.sku}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          Qty: <strong style={{ color: 'var(--text-primary)' }}>{item.quantity}</strong> × Rs. {item.price.toLocaleString()}
                        </div>
                        <div style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '16px' }}>
                          Rs. {(item.price * item.quantity).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shipping Address */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MapPin size={20} color="var(--primary)" /> Shipping Address
            </h2>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#0F766E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: '700',
                fontSize: '24px',
                flexShrink: 0
              }}>
                {order.shippingAddress.fullName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px', marginBottom: '8px' }}>
                  {order.shippingAddress.fullName}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={14} />
                    {order.shippingAddress.address}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={14} />
                    {order.shippingAddress.city}{order.shippingAddress.province ? `, ${order.shippingAddress.province}` : ''} {order.shippingAddress.postalCode && `- ${order.shippingAddress.postalCode}`}
                    {order.shippingAddress.country && `, ${order.shippingAddress.country}`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={14} />
                    {order.shippingAddress.phone}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Notes */}
          {(order.adminNotes || order.notes) && (
            <div style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid var(--border-color)'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Edit3 size={20} color="var(--primary)" /> Notes
              </h2>
              {order.notes && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Customer Notes
                  </div>
                  <div style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6' }}>
                    {order.notes}
                  </div>
                </div>
              )}
              {order.adminNotes && (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Admin Notes
                  </div>
                  <div style={{ padding: '12px', backgroundColor: '#FEF3C7', borderRadius: '8px', color: '#92400E', fontSize: '14px', lineHeight: '1.6', border: '1px solid #F59E0B' }}>
                    {order.adminNotes}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Customer Info */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <User size={20} color="var(--primary)" /> Customer
            </h2>
            {order.user ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#0F766E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '20px'
                  }}>
                    {order.user.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>
                      {order.user.fullName}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Customer ID: {order.user._id.slice(-8)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <Mail size={14} />
                    {order.user.email}
                  </div>
                  {order.user.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <Phone size={14} />
                      {order.user.phone}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                <User size={48} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div>Guest Customer</div>
              </div>
            )}
          </div>

          {/* Payment Info */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CreditCard size={20} color="var(--primary)" /> Payment
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Method</div>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
                  {order.paymentMethod === 'COD' ? '💵 Cash on Delivery' : order.paymentMethod}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Status</div>
                <div style={{
                  display: 'inline-flex',
                  padding: '6px 12px',
                  backgroundColor: paymentConfig.bg,
                  color: paymentConfig.color,
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '700'
                }}>
                  {order.paymentStatus}
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <DollarSign size={20} color="var(--primary)" /> Order Summary
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Rs. {order.subtotal.toLocaleString()}</span>
              </div>
              {order.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#10B981' }}>
                  <span>Discount</span>
                  <span style={{ fontWeight: '600' }}>-Rs. {order.discount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Shipping</span>
                <span style={{ fontWeight: '600', color: order.shippingCost === 0 ? '#10B981' : 'var(--text-primary)' }}>
                  {order.shippingCost === 0 ? 'FREE' : `Rs. ${order.shippingCost.toLocaleString()}`}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '20px',
                fontWeight: '800',
                color: 'var(--primary)',
                paddingTop: '16px',
                borderTop: '2px solid var(--border-color)',
                marginTop: '8px'
              }}>
                <span>Total</span>
                <span>Rs. {order.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' }}>
              Quick Actions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => { setNewStatus(order.orderStatus); setShowStatusModal(true); }}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Edit3 size={16} /> Update Status
              </button>
              <button
                onClick={() => setShowTrackingModal(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Truck size={16} /> Update Tracking
              </button>
              <button
                onClick={handlePrint}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Printer size={16} /> Print Invoice
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Update Modal */}
      {showStatusModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowStatusModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                Update Order Status
              </h2>
              <button onClick={() => setShowStatusModal(false)} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '10px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Order</div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                  #{order.orderId || order._id.slice(-8).toUpperCase()}
                </div>
              </div>
              <div style={{
                padding: '6px 14px',
                backgroundColor: statusConfig.bg,
                color: statusConfig.color,
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700'
              }}>
                {statusConfig.label}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              >
                <option value="Pending">Pending</option>
                <option value="Processing">Processing</option>
                <option value="Shipped">Shipped</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Admin Notes (Optional)
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add notes about this status update..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={updating || !newStatus}
                style={{
                  padding: '12px 24px',
                  backgroundColor: updating ? 'var(--text-secondary)' : 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: updating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {updating ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                {updating ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowTrackingModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                Update Tracking Number
              </h2>
              <button onClick={() => setShowTrackingModal(false)} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Tracking Number
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g., TRK123456789"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                This will be shared with the customer for tracking their shipment.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowTrackingModal(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleTrackingUpdate}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Save size={18} /> Save Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media print {
          button, nav, header { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}