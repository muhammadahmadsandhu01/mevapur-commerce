'use client';

import { useEffect, useState } from 'react';
import { 
  DollarSign, ShoppingCart, Users, Package, TrendingUp, 
  AlertCircle, CheckCircle, Clock, XCircle, ArrowUpRight, Truck 
} from 'lucide-react';
import { getAdminStats, getRecentOrders, getTopProducts } from '@/lib/api';

interface DashboardStats {
  totalRevenue: number;
  todayRevenue: number;
  monthlyRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalCustomers: number;
  newCustomers: number;
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  revenueGrowth: number | null;
  ordersGrowth: number | null;
  customersGrowth: number | null;
  productsGrowth: number | null;
  averageOrderValue: number;
  conversionRate: number | null;
}

interface Order {
  _id: string;
  orderId: string;
  user?: { fullName: string; email: string };
  shippingAddress?: { fullName: string };
  totalAmount: number;
  orderStatus: string;
  createdAt: string;
}

interface Product {
  _id: string;
  name: string;
  price: number;
  stock: number;
  soldCount: number;
  images: string[];
}

interface ProductApiResponse {
  _id: string;
  name: string;
  price: number;
  stock: number;
  soldCount?: number;
  images?: string[];
  gallery?: string[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topProducts, setTopProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setLoadError(false);

        const [statsData, ordersData, productsData] = await Promise.all([
          getAdminStats(),
          getRecentOrders(5),
          getTopProducts(5)
        ]);

        if (statsData) {
          setStats({
            totalRevenue: statsData.totalRevenue ?? 0,
            todayRevenue: statsData.todayRevenue ?? 0,
            monthlyRevenue: statsData.monthlyRevenue ?? 0,
            totalOrders: statsData.totalOrders ?? 0,
            pendingOrders: statsData.pendingOrders ?? 0,
            processingOrders: statsData.processingOrders ?? 0,
            shippedOrders: statsData.shippedOrders ?? 0,
            deliveredOrders: statsData.deliveredOrders ?? 0,
            cancelledOrders: statsData.cancelledOrders ?? 0,
            totalCustomers: statsData.totalCustomers ?? 0,
            newCustomers: statsData.newCustomers ?? 0,
            totalProducts: statsData.totalProducts ?? 0,
            lowStockProducts: statsData.lowStockProducts ?? 0,
            outOfStockProducts: statsData.outOfStockProducts ?? 0,
            revenueGrowth: typeof statsData.revenueGrowth === 'number' ? statsData.revenueGrowth : null,
            ordersGrowth: typeof statsData.ordersGrowth === 'number' ? statsData.ordersGrowth : null,
            customersGrowth: typeof statsData.customersGrowth === 'number' ? statsData.customersGrowth : null,
            productsGrowth: typeof statsData.productsGrowth === 'number' ? statsData.productsGrowth : null,
            averageOrderValue: statsData.averageOrderValue ?? 0,
            conversionRate: typeof statsData.conversionRate === 'number' ? statsData.conversionRate : null
          });
        }

        setRecentOrders(Array.isArray(ordersData) ? ordersData : []);
        setTopProducts(Array.isArray(productsData) ? productsData.map((product: ProductApiResponse) => ({
          _id: product._id,
          name: product.name,
          price: product.price,
          stock: product.stock,
          soldCount: product.soldCount ?? 0,
          images: product.images || product.gallery || []
        })) : []);
      } catch {
        setStats(null);
        setRecentOrders([]);
        setTopProducts([]);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [retryCount]);

  const kpiCards = [
    {
      title: 'Total Revenue',
      value: stats ? `Rs. ${stats.totalRevenue.toLocaleString()}` : 'Unavailable',
      change: stats?.revenueGrowth ?? null,
      icon: DollarSign,
      color: 'var(--accent-text)',
      bgColor: 'rgba(255, 138, 0, 0.1)'
    },
    {
      title: 'Total Orders',
      value: stats ? stats.totalOrders : 'Unavailable',
      change: stats?.ordersGrowth ?? null,
      icon: ShoppingCart,
      color: 'var(--info-text)',
      bgColor: 'var(--info-light)',
    },
    {
      title: 'Total Customers',
      value: stats ? stats.totalCustomers : 'Unavailable',
      change: stats?.customersGrowth ?? null,
      icon: Users,
      color: 'var(--success-text)',
      bgColor: 'rgba(22, 163, 74, 0.1)'
    },
    {
      title: 'Total Products',
      value: stats ? stats.totalProducts : 'Unavailable',
      change: stats?.productsGrowth ?? null,
      icon: Package,
      color: 'var(--warning-text)',
      bgColor: 'rgba(245, 158, 11, 0.1)'
    },
  ];

  const orderStats = [
    { label: 'Pending', value: stats ? stats.pendingOrders : 'Unavailable', color: '#F59E0B', icon: Clock },
    { label: 'Processing', value: stats ? stats.processingOrders : 'Unavailable', color: 'var(--warning)', icon: Truck },
    { label: 'Delivered', value: stats ? stats.deliveredOrders : 'Unavailable', color: '#16A34A', icon: CheckCircle },
    { label: 'Cancelled', value: stats ? stats.cancelledOrders : 'Unavailable', color: '#DC2626', icon: XCircle },
  ];

  if (loading) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '24px'
      }}>
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            style={{
              height: '140px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              animation: 'pulse 2s infinite'
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Dashboard Overview
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Welcome back! Here&apos;s what&apos;s happening with your store today.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px',
          padding: '16px 20px', marginBottom: '24px', borderRadius: '12px',
          backgroundColor: 'rgba(220, 38, 38, 0.1)', border: '1px solid #DC2626',
          color: 'var(--danger-text)', flexWrap: 'wrap'
        }}>
          <span>Dashboard analytics are currently unavailable. No fallback data is being shown.</span>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              backgroundColor: 'var(--primary)', color: '#0B132B', fontWeight: '700'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {kpiCards.map((card, index) => (
          <div
            key={index}
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              border: '1px solid var(--border-color)',
              transition: 'all 0.3s',
              cursor: 'pointer'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '12px',
                backgroundColor: card.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <card.icon size={28} color={card.color} />
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                borderRadius: '20px',
                backgroundColor: typeof card.change === 'number'
                  ? (card.change >= 0 ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.1)')
                  : 'var(--bg-primary)',
                color: typeof card.change === 'number'
                  ? (card.change >= 0 ? 'var(--success-text)' : 'var(--danger-text)')
                  : 'var(--text-secondary)',
                fontSize: '13px', fontWeight: '700'
              }}>
                {typeof card.change === 'number' ? (
                  <>
                    <ArrowUpRight size={14} style={card.change < 0 ? { transform: 'rotate(90deg)' } : undefined} />
                    {card.change > 0 ? '+' : ''}{card.change}%
                  </>
                ) : 'Comparison unavailable'}
              </div>
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>
              {card.title}
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Order Status & Alerts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {/* Order Status */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-primary)' }}>
            Order Status
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
            {orderStats.map((stat, index) => (
              <div key={index} style={{
                padding: '20px', borderRadius: '12px', backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)', textAlign: 'center'
              }}>
                <stat.icon size={32} color={stat.color} style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-primary)' }}>
            Alerts
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid #F59E0B', display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <AlertCircle size={24} color="var(--warning-text)" />
              <div>
                <div style={{ fontWeight: '700', color: 'var(--warning-text)', marginBottom: '4px' }}>Low Stock Alert</div>
                <div style={{ fontSize: '13px', color: 'var(--warning-text)' }}>
                  {stats ? `${stats.lowStockProducts} products need restocking` : 'Inventory data unavailable'}
                </div>
              </div>
            </div>
            <div style={{
              padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid #DC2626', display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <XCircle size={24} color="var(--danger-text)" />
              <div>
                <div style={{ fontWeight: '700', color: 'var(--danger-text)', marginBottom: '4px' }}>Out of Stock</div>
                <div style={{ fontSize: '13px', color: 'var(--danger-text)' }}>
                  {stats ? `${stats.outOfStockProducts} products unavailable` : 'Inventory data unavailable'}
                </div>
              </div>
            </div>
            <div style={{
              padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(22, 163, 74, 0.12)',
              border: '1px solid #16A34A', display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <TrendingUp size={24} color="var(--success-text)" />
              <div>
                <div style={{ fontWeight: '700', color: 'var(--success-text)', marginBottom: '4px' }}>New Customers</div>
                <div style={{ fontSize: '13px', color: 'var(--success-text)' }}>
                  {stats ? `${stats.newCustomers} new signups today` : 'Customer data unavailable'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {/* Revenue Chart */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-primary)' }}>
            Revenue Overview
          </h2>
          <div style={{
            height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '32px', textAlign: 'center', borderRadius: '12px',
            backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)'
          }}>
            Revenue time-series data is not available from the current analytics API.
          </div>
        </div>

        {/* Category Distribution */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-primary)' }}>
            Sales by Category
          </h2>
          <div style={{
            height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '32px', textAlign: 'center', borderRadius: '12px',
            backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)'
          }}>
            Category sales data is not available from the current analytics API.
          </div>
        </div>
      </div>

      {/* Top Products & Recent Orders */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {/* Top Products */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-primary)' }}>
            Top Selling Products
          </h2>
          {topProducts.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Product</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Sales</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '16px 12px', fontWeight: '600', color: 'var(--text-primary)' }}>{product.name}</td>
                      <td style={{ padding: '16px 12px', color: 'var(--text-secondary)' }}>{product.soldCount || 0}</td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{
                          padding: '4px 12px',
                          backgroundColor: product.stock < 50 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 163, 74, 0.12)',
                          color: product.stock < 50 ? 'var(--danger-text)' : 'var(--success-text)',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {product.stock} units
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', borderRadius: '12px' }}>
              <Package size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>No products available</p>
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-primary)' }}>
            Recent Orders
          </h2>
          {recentOrders.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Order ID</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Customer</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Total</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '16px 12px', fontWeight: '600', color: 'var(--accent-text)' }}>
                        {order.orderId || order._id.slice(-8).toUpperCase()}
                      </td>
                      <td style={{ padding: '16px 12px', color: 'var(--text-secondary)' }}>
                        {order.shippingAddress?.fullName || order.user?.fullName || 'N/A'}
                      </td>
                      <td style={{ padding: '16px 12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        Rs. {order.totalAmount?.toLocaleString() || 0}
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: order.orderStatus === 'Delivered' ? 'rgba(22, 163, 74, 0.12)' : 
                                         order.orderStatus === 'Processing' ? 'var(--warning-light)' :
                                         order.orderStatus === 'Shipped' ? 'rgba(255, 138, 0, 0.12)' :
                                         order.orderStatus === 'Pending' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(220, 38, 38, 0.1)',
                          color: order.orderStatus === 'Delivered' ? 'var(--success-text)' : 
                                 order.orderStatus === 'Processing' ? 'var(--warning-text)' :
                                 order.orderStatus === 'Shipped' ? 'var(--accent-text)' :
                                 order.orderStatus === 'Pending' ? 'var(--warning-text)' : 'var(--danger-text)',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {order.orderStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', borderRadius: '12px' }}>
              <ShoppingCart size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>No recent orders</p>
            </div>
          )}
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        border: '1px solid var(--border-color)'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-primary)' }}>
          Revenue Breakdown
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
            <div style={{ padding: '24px', borderRadius: '12px', background: 'linear-gradient(135deg, #0B132B 0%, #060A16 100%)', color: 'white' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Today&apos;s Revenue</div>
            <div style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>
              {stats ? `Rs. ${stats.todayRevenue.toLocaleString()}` : 'Unavailable'}
            </div>
            <div style={{ fontSize: '13px', opacity: 0.8 }}>Day-over-day comparison unavailable</div>
          </div>
            <div style={{ padding: '24px', borderRadius: '12px', background: 'linear-gradient(135deg, #FF8A00 0%, #E67D00 100%)', color: '#0B132B' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Monthly Revenue</div>
            <div style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>
              {stats ? `Rs. ${stats.monthlyRevenue.toLocaleString()}` : 'Unavailable'}
            </div>
            <div style={{ fontSize: '13px', opacity: 0.8 }}>Month-over-month comparison unavailable</div>
          </div>
            <div style={{ padding: '24px', borderRadius: '12px', background: 'linear-gradient(135deg, #166534 0%, #14532D 100%)', color: 'white' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Total Revenue</div>
            <div style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>
              {stats ? `Rs. ${stats.totalRevenue.toLocaleString()}` : 'Unavailable'}
            </div>
            <div style={{ fontSize: '13px', opacity: 0.8 }}>All time</div>
          </div>
        </div>
      </div>
    </div>
  );
}
