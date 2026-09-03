'use client';

import {
  Package,
  Truck,
  CreditCard,
  Calendar,
  ChevronDown,
  ChevronUp,
  Eye,
  Download,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import OrderTimeline from './OrderTimeline';
import { Order } from '@/data/mockOrders';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';
import { formatMoney } from '@/lib/money';

interface OrderCardProps {
  order: Order;
  onAction: (action: string, orderId: string) => void;
}

export default function OrderCard({ order, onAction }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    pending: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
    confirmed: { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
    processing: { bg: '#E0E7FF', text: '#4338CA', border: '#6366F1' },
    packed: { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
    shipped: { bg: '#DCFCE7', text: '#166534', border: '#16A34A' },
    'out-for-delivery': { bg: '#CFFAFE', text: '#155E75', border: '#06B6D4' },
    delivered: { bg: '#DCFCE7', text: '#166534', border: '#16A34A' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
    returned: { bg: '#FED7AA', text: '#9A3412', border: '#F97316' },
    refunded: { bg: '#E5E7EB', text: '#374151', border: '#6B7280' },
  };

  const paymentStatusColors: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    paid: { bg: '#DCFCE7', text: '#166534' },
    'cod-pending': { bg: '#FEF3C7', text: '#92400E' },
    refunded: { bg: '#E5E7EB', text: '#374151' },
    failed: { bg: '#FEE2E2', text: '#991B1B' },
  };

  const statusColor = statusColors[order.orderStatus] || statusColors.pending;
  const paymentColor = paymentStatusColors[order.paymentStatus] || paymentStatusColors.pending;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const canCancel = order.orderStatus === 'pending' || order.orderStatus === 'confirmed';
  const canReturn = order.orderStatus === 'delivered';
  const displayId = order.orderNumber || order.id;

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        border: '1px solid #E5E7EB',
        marginBottom: '20px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid #F3F4F6',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#0B132B' }}>
              #{displayId}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} /> {formatDate(order.orderDate || new Date().toISOString())}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* Order Status Badge */}
          <div
            style={{
              backgroundColor: statusColor.bg,
              color: statusColor.text,
              border: `1px solid ${statusColor.border}`,
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              textTransform: 'capitalize',
            }}
          >
            <Package size={14} />
            {order.orderStatus.replace('-', ' ')}
          </div>

          {/* Payment Status Badge */}
          <div
            style={{
              backgroundColor: paymentColor.bg,
              color: paymentColor.text,
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'capitalize',
            }}
          >
            💳 {order.paymentStatus.replace('-', ' ')}
          </div>
        </div>
      </div>

      {/* Products Preview */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#F8FAFC', flexShrink: 0 }}>
            <Image
              src={getSafeMediaUrl(order.items[0]?.image)}
              alt={order.items[0]?.name || 'Product'}
              fill
              sizes="80px"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
              {order.items[0]?.name}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
              {order.items[0]?.variant} • Qty: {order.items[0]?.quantity}
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#FF8A00' }}>
              {formatMoney(order.items[0]?.price)}
            </div>
          </div>
          {order.items.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                color: '#0B132B',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              +{order.items.length - 1} More
            </button>
          )}
        </div>

        {/* Expanded Products */}
        {expanded &&
          order.items.slice(1).map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: '#F8FAFC',
                borderRadius: '10px',
              }}
            >
              <div style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff', flexShrink: 0 }}>
                <Image
                  src={getSafeMediaUrl(item.image)}
                  alt={item.name}
                  fill
                  sizes="60px"
                  style={{ objectFit: 'cover' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '2px' }}>
                  {item.variant} • Qty: {item.quantity}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#FF8A00' }}>
                  {formatMoney(item.price)}
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Order Info Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
          padding: '16px',
          backgroundColor: '#F8FAFC',
          borderRadius: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Total Amount</div>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#0B132B' }}>
            {formatMoney(order.totalAmount)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Payment Method</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CreditCard size={14} /> {order.paymentMethod}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Products</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
            {order.productCount} items
          </div>
        </div>
        {order.trackingNumber && (
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Tracking</div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', fontFamily: 'monospace' }}>
              {order.trackingNumber}
            </div>
          </div>
        )}
      </div>

      {/* Timeline Toggle */}
      {showTimeline && order.timeline && (
        <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '12px' }}>
          <OrderTimeline timeline={order.timeline} />
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link
            href={`/orders/${order.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: '#0B132B',
              color: 'white',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              textDecoration: 'none',
            }}
          >
            <Eye size={14} /> View Details
          </Link>

          <button
            onClick={() => setShowTimeline(!showTimeline)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: 'white',
              border: '1px solid #E5E7EB',
              color: '#374151',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            <Truck size={14} /> {showTimeline ? 'Hide Tracking' : 'Track Order'}
          </button>

          <button
            onClick={() => onAction('invoice', order.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: 'white',
              border: '1px solid #E5E7EB',
              color: '#374151',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            <Download size={14} /> Invoice
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canCancel && (
            <button
              onClick={() => onAction('cancel', order.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#FEE2E2',
                color: '#991B1B',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <XCircle size={14} /> Cancel Order
            </button>
          )}

          {canReturn && (
            <button
              onClick={() => onAction('return', order.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #FCD34D',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={14} /> Return
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
