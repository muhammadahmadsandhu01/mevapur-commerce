'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { Search, Package, ShoppingBag, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { mockOrders } from '@/data/mockOrders';
import OrderCard from '@/components/OrderCard';
import Toast from '@/components/Toast';

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const filteredOrders = useMemo(() => {
    let orders = [...mockOrders];

    // Payment filter
    if (paymentFilter !== 'all') {
      orders = orders.filter(o => o.paymentMethod === paymentFilter);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      orders = orders.filter(o =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.items.some(item => 
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q)
        ) ||
        (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q))
      );
    }

    // Sort
    orders.sort((a, b) => {
      switch (sortBy) {
        case 'newest': return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
        case 'oldest': return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
        case 'highest': return b.totalAmount - a.totalAmount;
        case 'lowest': return a.totalAmount - b.totalAmount;
        default: return 0;
      }
    });

    return orders;
  }, [searchQuery, sortBy, paymentFilter]);

  const handleAction = (action: string, orderId: string) => {
    const messages: Record<string, { message: string; type: 'success' | 'error' | 'info' }> = {
      'buy-again': { message: '✅ Items added to cart!', type: 'success' },
      'cancel': { message: '❌ Order cancelled successfully', type: 'info' },
      'return': { message: '🔄 Return request submitted', type: 'success' },
      'invoice': { message: '📄 Invoice downloaded', type: 'success' },
      'track': { message: '📦 Tracking details loaded', type: 'info' },
      'review': { message: '⭐ Redirecting to review page...', type: 'info' },
      'support': { message: '💬 Opening support chat...', type: 'info' }
    };

    const toastData = messages[action];
    if (toastData) {
      setToast(toastData);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Link href="/" style={{ color: '#6B7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px' }}>
              <ArrowLeft size={18} /> Back to Home
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Package size={28} color="#0F766E" />
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', margin: 0 }}>My Orders</h1>
          </div>
          <p style={{ fontSize: '15px', color: '#6B7280', marginTop: '8px' }}>
            Manage and track all your orders in one place
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px' }}>
        
        {/* Top Controls */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type="text"
                placeholder="Search by Order #, Product, SKU, Tracking..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px 12px 44px',
                  borderRadius: '10px', border: '2px solid #E5E7EB',
                  fontSize: '14px', outline: 'none', transition: 'all 0.2s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#0F766E'}
                onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'}
              />
            </div>

            {/* Payment Filter */}
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
              style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', backgroundColor: 'white', cursor: 'pointer' }}>
              <option value="all">All Payments</option>
              <option value="COD">Cash on Delivery</option>
              <option value="JazzCash">JazzCash</option>
              <option value="Visa">Visa Card</option>
              <option value="MasterCard">MasterCard</option>
            </select>

            {/* Sort */}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', backgroundColor: 'white', cursor: 'pointer' }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Amount</option>
              <option value="lowest">Lowest Amount</option>
            </select>
          </div>
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', backgroundColor: 'white', borderRadius: '16px' }}>
            <div style={{ fontSize: '100px', marginBottom: '24px' }}>📦</div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
              {searchQuery ? 'No orders found' : "You haven't placed any orders yet"}
            </h2>
            <p style={{ color: '#6B7280', marginBottom: '32px', fontSize: '15px' }}>
              {searchQuery ? 'Try a different search term' : 'Start shopping to see your orders here'}
            </p>
            <Link href="/" style={{
              backgroundColor: '#0F766E', color: 'white', padding: '14px 32px',
              borderRadius: '50px', fontWeight: '700', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 12px rgba(15,118,110,0.3)'
            }}>
              <ShoppingBag size={18} /> Continue Shopping
            </Link>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '16px', fontSize: '14px', color: '#6B7280' }}>
              Showing {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
            </div>
            {filteredOrders.map(order => (
              <OrderCard key={order.id} order={order} onAction={handleAction} />
            ))}
          </>
        )}
      </div>

      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}