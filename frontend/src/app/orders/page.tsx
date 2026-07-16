'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo, useEffect } from 'react';
import { Search, Package, ShoppingBag, ArrowLeft, Loader } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import axios from 'axios';
import OrderCard from '@/components/OrderCard';
import Toast from '@/components/Toast';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  sku?: string;
  variant?: string;
}

interface TimelineEvent {
  status: string;
  timestamp: string;
  note?: string;
  date?: string;
  completed?: boolean;
}

interface Order {
  _id: string;
  id: string;
  orderId: string;
  orderNumber: string;  // ✅ REQUIRED (not optional)
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;  // ✅ REQUIRED (not optional)
  totalAmount: number;
  createdAt: string;
  orderDate: string;  // ✅ REQUIRED (not optional)
  estimatedDelivery?: string;
  subtotal: number;  // ✅ REQUIRED (not optional)
  shipping: number;  // ✅ REQUIRED (not optional)
  tax: number;  // ✅ REQUIRED (not optional)
  discount: number;  // ✅ REQUIRED (not optional)
  productCount: number;  // ✅ REQUIRED (not optional)
  timeline?: TimelineEvent[];
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    name: string;  // ✅ REQUIRED (not optional)
    phone: string;
    address: string;
    city: string;
    province?: string;
    postalCode?: string;
  };
  trackingNumber?: string;
  courier?: string;
}

export default function OrdersPage() {
  const { token } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/orders/my-orders`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        if (data.success) {
          // ✅ Map backend data ensuring ALL required fields are ALWAYS present
          const mappedOrders: Order[] = data.data.map((order: any) => ({
            _id: order._id,
            id: order._id || '',
            orderId: order.orderId || '',
            orderNumber: order.orderId || order.orderNumber || `ORD-${order._id.slice(-6).toUpperCase()}`,  // ✅ ALWAYS provide
            orderStatus: order.orderStatus || 'Pending',
            paymentMethod: order.paymentMethod || 'COD',
            paymentStatus: order.paymentStatus || 'Pending',  // ✅ ALWAYS provide
            totalAmount: order.totalAmount || 0,
            createdAt: order.createdAt || new Date().toISOString(),
            orderDate: order.createdAt || order.orderDate || new Date().toISOString(),  // ✅ ALWAYS provide
            subtotal: order.subtotal || order.totalAmount || 0,  // ✅ ALWAYS provide
            shipping: order.shippingCost || order.shipping || 0,  // ✅ ALWAYS provide
            tax: order.tax || 0,  // ✅ ALWAYS provide
            discount: order.discount || 0,  // ✅ ALWAYS provide
            productCount: order.items?.length || 0,  // ✅ ALWAYS provide
            timeline: order.statusTimeline || order.timeline || [],
            items: order.items?.map((item: any) => ({
              id: item._id || item.id || item.product || '',
              name: item.name || 'Product',
              price: item.price || 0,
              quantity: item.quantity || 1,
              image: item.image || '/placeholder.png',
              sku: item.sku || '',
              variant: item.variant || ''
            })) || [],
            shippingAddress: {
              fullName: order.shippingAddress?.fullName || 'Customer',
              name: order.shippingAddress?.fullName || order.shippingAddress?.name || 'Customer',  // ✅ ALWAYS provide
              phone: order.shippingAddress?.phone || '',
              address: order.shippingAddress?.address || '',
              city: order.shippingAddress?.city || '',
              province: order.shippingAddress?.province || '',
              postalCode: order.shippingAddress?.postalCode || ''
            },
            trackingNumber: order.trackingNumber || '',
            courier: order.courier || ''
          }));
          
          setOrders(mappedOrders);
        }
      } catch (error) {
        console.error('Error fetching orders:', error);
        setToast({ message: 'Failed to load orders', type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [token]);

  const filteredOrders = useMemo(() => {
    let ordersList = [...orders];

    if (paymentFilter !== 'all') {
      ordersList = ordersList.filter(o => o.paymentMethod === paymentFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      ordersList = ordersList.filter(o =>
        o.orderId.toLowerCase().includes(q) ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.items.some(item => item.name.toLowerCase().includes(q)) ||
        o.shippingAddress.fullName.toLowerCase().includes(q)
      );
    }

    ordersList.sort((a, b) => {
      switch (sortBy) {
        case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'highest': return b.totalAmount - a.totalAmount;
        case 'lowest': return a.totalAmount - b.totalAmount;
        default: return 0;
      }
    });

    return ordersList;
  }, [orders, searchQuery, sortBy, paymentFilter]);

  const handleAction = (action: string, orderId: string) => {
    const messages: Record<string, { message: string; type: 'success' | 'error' | 'info' }> = {
      'buy-again': { message: '✅ Items added to cart!', type: 'success' },
      'cancel': { message: '❌ Order cancelled successfully', type: 'info' },
      'return': { message: '🔄 Return request submitted', type: 'success' },
      'invoice': { message: ' Invoice downloaded', type: 'success' },
      'track': { message: '📦 Tracking details loaded', type: 'info' },
      'review': { message: '⭐ Redirecting to review page...', type: 'info' },
      'support': { message: '💬 Opening support chat...', type: 'info' }
    };

    const toastData = messages[action];
    if (toastData) {
      setToast(toastData);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#0F766E' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      
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
        
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type="text"
                placeholder="Search by Order #, Product, Name..."
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

            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
              style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', backgroundColor: 'white', cursor: 'pointer' }}>
              <option value="all">All Payments</option>
              <option value="COD">Cash on Delivery</option>
              <option value="jazzcash">JazzCash</option>
              <option value="visa">Visa Card</option>
              <option value="mastercard">MasterCard</option>
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', backgroundColor: 'white', cursor: 'pointer' }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Amount</option>
              <option value="lowest">Lowest Amount</option>
            </select>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', backgroundColor: 'white', borderRadius: '16px' }}>
            <div style={{ fontSize: '100px', marginBottom: '24px' }}>📦</div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
              {orders.length === 0 ? "You haven't placed any orders yet" : 'No orders found'}
            </h2>
            <p style={{ color: '#6B7280', marginBottom: '32px', fontSize: '15px' }}>
              {orders.length === 0 ? 'Start shopping to see your orders here' : 'Try a different search term'}
            </p>
            {orders.length === 0 && (
              <Link href="/products" style={{
                backgroundColor: '#0F766E', color: 'white', padding: '14px 32px',
                borderRadius: '50px', fontWeight: '700', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 4px 12px rgba(15,118,110,0.3)'
              }}>
                <ShoppingBag size={18} /> Continue Shopping
              </Link>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '16px', fontSize: '14px', color: '#6B7280' }}>
              Showing {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
            </div>
            {filteredOrders.map(order => (
              <OrderCard key={order._id} order={order} onAction={handleAction} />
            ))}
          </>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}