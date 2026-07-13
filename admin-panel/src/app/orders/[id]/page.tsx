'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Package, 
  User, 
  MapPin, 
  CreditCard, 
  Clock, 
  CheckCircle, 
  Truck,
  XCircle,
  Loader,
  MessageSquare,
  Send,
  AlertCircle
} from 'lucide-react';
import api from '@/lib/api';
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

interface StatusTimeline {
  status: string;
  timestamp: string;
  note: string;
}

interface AdminNote {
  note: string;
  addedBy: string;
  addedAt: string;
}

interface Order {
  _id: string;
  orderId: string;
  user: {
    fullName: string;
    email: string;
    phone: string;
  };
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
  };
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;
  adminNotes: AdminNote[];
  statusTimeline: StatusTimeline[];
  trackingNumber: string;
  courierCompany: string;
  createdAt: string;
}

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/orders/${orderId}`);
      
      if (response.data.success) {
        setOrder(response.data.data);
        setNewStatus(response.data.data.orderStatus);
      }
    } catch (error) {
      console.error('Error fetching order:', error);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === order?.orderStatus) {
      setError('Please select a different status');
      return;
    }

    setUpdating(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.put(`/orders/${orderId}/status`, {
        orderStatus: newStatus,
        adminNotes: adminNote
      });

      if (response.data.success) {
        setSuccess('✅ Order status updated successfully!');
        setAdminNote('');
        await fetchOrder(); // Refresh data
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      setError(error.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pending': return <Clock size={20} />;
      case 'Processing': return <Package size={20} />;
      case 'Shipped': return <Truck size={20} />;
      case 'Delivered': return <CheckCircle size={20} />;
      case 'Cancelled': return <XCircle size={20} />;
      default: return <Clock size={20} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return { bg: '#FEF3C7', color: '#92400E', border: '#F59E0B' };
      case 'Processing': return { bg: '#DBEAFE', color: '#1E40AF', border: '#3B82F6' };
      case 'Shipped': return { bg: '#FEF3C7', color: '#92400E', border: '#F59E0B' };
      case 'Delivered': return { bg: '#D1FAE5', color: '#0F766E', border: '#10B981' };
      case 'Cancelled': return { bg: '#FEE2E2', color: '#DC2626', border: '#EF4444' };
      default: return { bg: '#F3F4F6', color: '#6B7280', border: '#9CA3AF' };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-PK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader 
            size={48} 
            color="var(--primary)" 
            style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }}
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
            Loading order details...
          </p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <AlertCircle size={64} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--text-secondary)' }} />
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Order not found</h2>
        <Link href="/orders" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }}>
          ← Back to Orders
        </Link>
      </div>
    );
  }

  const currentStatusColor = getStatusColor(order.orderStatus);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <Link
          href="/orders"
          style={{
            color: 'var(--primary)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            marginBottom: '16px',
            fontSize: '14px'
          }}
        >
          <ArrowLeft size={18} />
          Back to Orders
        </Link>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ 
              fontSize: '32px', 
              fontWeight: '800', 
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Order #{order.orderId}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Placed on {formatDate(order.createdAt)}
            </p>
          </div>
          
          <span style={{
            padding: '12px 24px',
            backgroundColor: currentStatusColor.bg,
            color: currentStatusColor.color,
            border: `2px solid ${currentStatusColor.border}`,
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {getStatusIcon(order.orderStatus)}
            {order.orderStatus}
          </span>
        </div>
      </div>

      {/* Success & Error Messages */}
      {success && (
        <div style={{
          padding: '16px',
          backgroundColor: '#D1FAE5',
          border: '1px solid #10B981',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#065F46'
        }}>
          <CheckCircle size={24} />
          <span style={{ fontWeight: '600' }}>{success}</span>
        </div>
      )}

      {error && (
        <div style={{
          padding: '16px',
          backgroundColor: '#FEE2E2',
          border: '1px solid #EF4444',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#991B1B'
        }}>
          <AlertCircle size={24} />
          <span style={{ fontWeight: '600' }}>{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Order Items */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '700',
              marginBottom: '24px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Package size={24} color="var(--primary)" />
              Order Items ({order.items.length})
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {order.items.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '20px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: 'white',
                    flexShrink: 0
                  }}>
                    <img
                      src={item.image || item.product?.images?.[0] || '/placeholder.png'}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      {item.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Quantity: <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.quantity}</span>
                      </div>
                      <div style={{ fontWeight: '700', fontSize: '18px', color: 'var(--primary)' }}>
                        Rs. {(item.price * item.quantity).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '700',
              marginBottom: '24px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <MapPin size={24} color="var(--primary)" />
              Shipping Address
            </h2>

            <div style={{
              padding: '24px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontWeight: '700', fontSize: '18px', color: 'var(--text-primary)', marginBottom: '12px' }}>
                {order.shippingAddress.fullName}
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8', fontSize: '15px' }}>
                <div>{order.shippingAddress.address}</div>
                <div>{order.shippingAddress.city} {order.shippingAddress.postalCode && `- ${order.shippingAddress.postalCode}`}</div>
                <div style={{ marginTop: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  📱 {order.shippingAddress.phone}
                </div>
              </div>
            </div>
          </div>

          {/* Status Timeline */}
          {order.statusTimeline && order.statusTimeline.length > 0 && (
            <div style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              border: '1px solid var(--border-color)'
            }}>
              <h2 style={{ 
                fontSize: '20px', 
                fontWeight: '700',
                marginBottom: '24px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <Clock size={24} color="var(--primary)" />
                Status Timeline
              </h2>

              <div style={{ position: 'relative', paddingLeft: '32px' }}>
                <div style={{
                  position: 'absolute',
                  left: '11px',
                  top: '8px',
                  bottom: '8px',
                  width: '2px',
                  backgroundColor: 'var(--border-color)'
                }} />
                
                {order.statusTimeline.map((timeline, index) => {
                  const statusColor = getStatusColor(timeline.status);
                  return (
                    <div key={index} style={{ position: 'relative', marginBottom: '24px' }}>
                      <div style={{
                        position: 'absolute',
                        left: '-32px',
                        top: '4px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: statusColor.border,
                        border: '3px solid white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }} />
                      <div style={{
                        padding: '16px',
                        backgroundColor: 'var(--bg-primary)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{
                            padding: '6px 12px',
                            backgroundColor: statusColor.bg,
                            color: statusColor.color,
                            borderRadius: '20px',
                            fontSize: '13px',
                            fontWeight: '700'
                          }}>
                            {timeline.status}
                          </span>
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {formatDate(timeline.timestamp)}
                          </span>
                        </div>
                        {timeline.note && (
                          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                            {timeline.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Update Status */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '700',
              marginBottom: '24px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <CheckCircle size={24} color="var(--primary)" />
              Update Status
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
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

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Admin Note (Optional)
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Add a note about this status change..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <button
              onClick={handleStatusUpdate}
              disabled={updating || newStatus === order.orderStatus}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: updating || newStatus === order.orderStatus ? '#9CA3AF' : 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: updating || newStatus === order.orderStatus ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {updating ? (
                <>
                  <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  Updating...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Update Status
                </>
              )}
            </button>
          </div>

          {/* Order Summary */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '700',
              marginBottom: '24px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <CreditCard size={24} color="var(--primary)" />
              Order Summary
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Rs. {order.subtotal.toLocaleString()}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Shipping</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                  {order.shippingCost === 0 ? 'FREE' : `Rs. ${order.shippingCost.toLocaleString()}`}
                </span>
              </div>

              {order.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: '#10B981' }}>Discount</span>
                  <span style={{ fontWeight: '600', color: '#10B981' }}>-Rs. {order.discount.toLocaleString()}</span>
                </div>
              )}

              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                paddingTop: '16px',
                fontSize: '20px',
                fontWeight: '800',
                color: 'var(--primary)'
              }}>
                <span>Total</span>
                <span>Rs. {order.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div style={{ 
              marginTop: '24px', 
              padding: '16px', 
              backgroundColor: 'var(--bg-primary)', 
              borderRadius: '10px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Payment Method
              </div>
              <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px' }}>
                {order.paymentMethod === 'COD' ? '💵 Cash on Delivery' : order.paymentMethod}
              </div>
              <div style={{ 
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: order.paymentStatus === 'Paid' ? '#D1FAE5' : '#FEF3C7',
                color: order.paymentStatus === 'Paid' ? '#0F766E' : '#92400E',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                display: 'inline-block'
              }}>
                {order.paymentStatus}
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '700',
              marginBottom: '24px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <User size={24} color="var(--primary)" />
              Customer
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '20px',
                fontWeight: '700'
              }}>
                {order.user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px' }}>
                  {order.user?.fullName || order.shippingAddress.fullName}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {order.user?.email || 'N/A'}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  📱 {order.user?.phone || order.shippingAddress.phone}
                </div>
              </div>
            </div>
          </div>

          {/* Admin Notes */}
          {order.adminNotes && order.adminNotes.length > 0 && (
            <div style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              border: '1px solid var(--border-color)'
            }}>
              <h2 style={{ 
                fontSize: '20px', 
                fontWeight: '700',
                marginBottom: '24px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <MessageSquare size={24} color="var(--primary)" />
                Admin Notes
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {order.adminNotes.map((note, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '16px',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      {note.note}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {formatDate(note.addedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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