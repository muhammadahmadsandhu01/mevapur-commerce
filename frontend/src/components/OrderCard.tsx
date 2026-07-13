'use client';

import { Package, Truck, CreditCard, Calendar, MapPin, ChevronDown, ChevronUp, Eye, Download, RotateCcw, XCircle, ShoppingCart, Star, MessageCircle, Clock } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import OrderTimeline from './OrderTimeline';
import { Order } from '@/data/mockOrders';

interface OrderCardProps {
  order: Order;
  onAction: (action: string, orderId: string) => void;
}

export default function OrderCard({ order, onAction }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

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

  const paymentStatusColors: Record<string, { bg: string; text: string }> = {
    'pending': { bg: '#FEF3C7', text: '#92400E' },
    'paid': { bg: '#D1FAE5', text: '#065F46' },
    'cod-pending': { bg: '#FEF3C7', text: '#92400E' },
    'refunded': { bg: '#E5E7EB', text: '#374151' },
    'failed': { bg: '#FEE2E2', text: '#991B1B' }
  };

  const statusColor = statusColors[order.orderStatus] || statusColors.pending;
  const paymentColor = paymentStatusColors[order.paymentStatus] || paymentStatusColors.pending;

  // ✅ Calculate if within 7 days of delivery
  const isWithin7DaysOfDelivery = () => {
    const deliveredStep = order.timeline.find(t => t.status === 'Delivered');
    if (!deliveredStep || !deliveredStep.completed) return false;
    
    const deliveryDate = new Date(deliveredStep.date);
    const now = new Date();
    const daysDiff = (now.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 7 && daysDiff >= 0;
  };

  // ✅ UPDATED: Conditional actions based on order status
  const getActions = () => {
    const actions = [];
    
    // Always show View Details
    actions.push({ label: 'View Details', icon: <Eye size={14} />, type: 'view', primary: true });
    
    // Track Shipment - for shipped, out-for-delivery, delivered
    if (['shipped', 'out-for-delivery', 'delivered'].includes(order.orderStatus)) {
      actions.push({ label: 'Track Shipment', icon: <Truck size={14} />, type: 'track' });
    }
    
    // ✅ CANCEL ORDER - Only before shipping (pending, confirmed, processing, packed)
    if (['pending', 'confirmed', 'processing', 'packed'].includes(order.orderStatus)) {
      actions.push({ 
        label: 'Cancel Order', 
        icon: <XCircle size={14} />, 
        type: 'cancel', 
        danger: true 
      });
    }
    
    // ✅ RETURN & OTHER OPTIONS - Only after delivery (within 7 days)
    if (order.orderStatus === 'delivered') {
      actions.push({ label: 'Buy Again', icon: <ShoppingCart size={14} />, type: 'buy-again' });
      actions.push({ label: 'Leave Review', icon: <Star size={14} />, type: 'review' });
      
      // Return button - only within 7 days
      if (isWithin7DaysOfDelivery()) {
        actions.push({ 
          label: 'Request Return', 
          icon: <RotateCcw size={14} />, 
          type: 'return',
          subtitle: '7 days remaining'
        });
      }
    }
    
    // Download Invoice - for delivered, cancelled, returned, refunded
    if (['delivered', 'cancelled', 'returned', 'refunded'].includes(order.orderStatus)) {
      actions.push({ label: 'Download Invoice', icon: <Download size={14} />, type: 'invoice' });
    }
    
    actions.push({ label: 'Contact Support', icon: <MessageCircle size={14} />, type: 'support' });
    
    return actions;
  };

  const actions = getActions();

  return (
    <div style={{
      backgroundColor: 'white', borderRadius: '16px', padding: '24px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB',
      transition: 'all 0.3s', marginBottom: '20px'
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Package size={18} color="#0F766E" />
            <span style={{ fontSize: '16px', fontWeight: '800', color: '#111827' }}>Order #{order.orderNumber}</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#6B7280', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} /> Placed: {new Date(order.orderDate).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Truck size={14} /> Est. Delivery: {new Date(order.estimatedDelivery).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{
            backgroundColor: statusColor.bg, color: statusColor.text,
            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
            border: `1px solid ${statusColor.border}`, textTransform: 'capitalize'
          }}>
            {order.orderStatus.replace('-', ' ')}
          </div>
          <div style={{
            backgroundColor: paymentColor.bg, color: paymentColor.text,
            padding: '4px 10px', borderRadius: '16px', fontSize: '11px', fontWeight: '600',
            textTransform: 'capitalize'
          }}>
            💳 {order.paymentStatus.replace('-', ' ')}
          </div>
        </div>
      </div>

      {/* Products Preview */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
          <img src={order.items[0].image} alt={order.items[0].name} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>{order.items[0].name}</div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>{order.items[0].variant} • Qty: {order.items[0].quantity}</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F766E' }}>Rs. {order.items[0].price}</div>
          </div>
          {order.items.length > 1 && (
            <button onClick={() => setExpanded(!expanded)} style={{
              background: 'none', border: '1px solid #E5E7EB', borderRadius: '8px',
              padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              color: '#0F766E', display: 'flex', alignItems: 'center', gap: '4px'
            }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              +{order.items.length - 1} More
            </button>
          )}
        </div>

        {/* Expanded Products */}
        {expanded && order.items.slice(1).map(item => (
          <div key={item.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '10px' }}>
            <img src={item.image} alt={item.name} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>{item.name}</div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '2px' }}>{item.variant} • Qty: {item.quantity}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F766E' }}>Rs. {item.price}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Order Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Total Amount</div>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F766E' }}>Rs. {order.totalAmount.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Payment Method</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CreditCard size={14} /> {order.paymentMethod}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Products</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{order.productCount} items</div>
        </div>
        {order.trackingNumber && (
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Tracking</div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', fontFamily: 'monospace' }}>{order.trackingNumber}</div>
          </div>
        )}
      </div>

      {/* Shipping Address */}
      <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '10px', borderLeft: '3px solid #0F766E' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <MapPin size={14} color="#0F766E" />
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#0F766E' }}>Shipping Address</span>
        </div>
        <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
          {order.shippingAddress.name}<br />
          {order.shippingAddress.address}<br />
          {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}<br />
          📞 {order.shippingAddress.phone}
        </div>
      </div>

      {/* Timeline Toggle */}
      <button onClick={() => setShowTimeline(!showTimeline)} style={{
        width: '100%', background: 'none', border: '1px solid #E5E7EB', borderRadius: '10px',
        padding: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
        color: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        marginBottom: '16px', transition: 'all 0.2s'
      }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F0FDFA'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        {showTimeline ? 'Hide' : 'View'} Order Timeline
        {showTimeline ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showTimeline && <OrderTimeline timeline={order.timeline} />}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid #E5E7EB' }}>
        {actions.map((action, index) => (
          action.type === 'view' ? (
            <Link key={index} href={`/orders/${order.id}`} style={{
              flex: 1, minWidth: '120px',
              backgroundColor: '#0F766E', color: 'white',
              padding: '10px 16px', borderRadius: '10px',
              fontSize: '13px', fontWeight: '700', textDecoration: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(15,118,110,0.3)'
            }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {action.icon} {action.label}
            </Link>
          ) : (
            <button key={index} onClick={() => onAction(action.type, order.id)} style={{
              flex: 1, minWidth: '120px',
              backgroundColor: action.danger ? '#FEE2E2' : 'white',
              color: action.danger ? '#DC2626' : '#374151',
              border: `1px solid ${action.danger ? '#FCA5A5' : '#E5E7EB'}`,
              padding: '10px 16px', borderRadius: '10px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all 0.2s'
            }}
              onMouseEnter={e => { 
                e.currentTarget.style.backgroundColor = action.danger ? '#FEE2E2' : '#F8FAFC';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => { 
                e.currentTarget.style.backgroundColor = action.danger ? '#FEE2E2' : 'white';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {action.icon} {action.label}
              {action.subtitle && <span style={{ fontSize: '10px', opacity: 0.7 }}>({action.subtitle})</span>}
            </button>
          )
        ))}
      </div>
    </div>
  );
}