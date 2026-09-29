'use client';

import { useEffect, useState } from 'react';
import { 
  DollarSign, ShoppingCart, ShoppingBag, Package, TrendingUp, 
  AlertCircle, CheckCircle, Clock, XCircle, ArrowUpRight, Truck, Tag 
} from 'lucide-react';
import { getAdminStats, getRecentOrders, getTopProducts } from '@/lib/api';

interface ChartDataItem {
  date: string;
  revenue: number;
  orders: number;
  currency?: string;
}

interface CategoryStatItem {
  _id: string;
  totalRevenue: number;
  totalSales: number;
  productCount?: number;
  currency?: string;
}

function formatChartDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

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
  chartData?: ChartDataItem[];
  categoryStats?: CategoryStatItem[];
  cogs?: number;
  netProfit?: number;
  profitMargin?: number;
  cancellationRate?: number;
  uncollectedCod?: number;
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
            conversionRate: typeof statsData.conversionRate === 'number' ? statsData.conversionRate : null,
            chartData: Array.isArray(statsData.chartData) ? statsData.chartData : [],
            categoryStats: Array.isArray(statsData.categoryStats) ? statsData.categoryStats : [],
            cogs: typeof statsData.cogs === 'number' ? statsData.cogs : 0,
            netProfit: typeof statsData.netProfit === 'number' ? statsData.netProfit : 0,
            profitMargin: typeof statsData.profitMargin === 'number' ? statsData.profitMargin : 0,
            cancellationRate: typeof statsData.cancellationRate === 'number' ? statsData.cancellationRate : 0,
            uncollectedCod: typeof statsData.uncollectedCod === 'number' ? statsData.uncollectedCod : 0
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
      title: 'Gross Sales (Turnover)',
      subtitle: 'Realized Customer Turnover',
      value: stats ? `Rs. ${stats.totalRevenue.toLocaleString()}` : 'Unavailable',
      icon: DollarSign,
      color: 'var(--accent-text)',
      bgColor: 'rgba(255, 138, 0, 0.1)',
      badge: stats?.revenueGrowth !== null && stats?.revenueGrowth !== undefined ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
          borderRadius: '20px',
          backgroundColor: stats.revenueGrowth >= 0 ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.1)',
          color: stats.revenueGrowth >= 0 ? 'var(--success-text)' : 'var(--danger-text)',
          fontSize: '13px', fontWeight: '700'
        }}>
          <ArrowUpRight size={14} style={stats.revenueGrowth < 0 ? { transform: 'rotate(90deg)' } : undefined} />
          {stats.revenueGrowth > 0 ? '+' : ''}{stats.revenueGrowth}%
        </span>
      ) : (
        <span style={{
          padding: '6px 12px', borderRadius: '20px',
          backgroundColor: 'rgba(255, 138, 0, 0.12)', color: 'var(--accent-text)',
          fontSize: '12px', fontWeight: '700'
        }}>
          Turnover
        </span>
      )
    },
    {
      title: 'Cost of Goods (COGS)',
      subtitle: 'Product acquisition cost',
      value: stats ? `Rs. ${(stats.cogs ?? 0).toLocaleString()}` : 'Unavailable',
      icon: Tag,
      color: '#3B82F6',
      bgColor: 'rgba(59, 130, 246, 0.1)',
      badge: (
        <span style={{
          padding: '6px 12px', borderRadius: '20px',
          backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6',
          fontSize: '12px', fontWeight: '700'
        }}>
          {stats && stats.totalRevenue > 0 ? `${Math.round(((stats.cogs || 0) / stats.totalRevenue) * 100)}% of Sales` : 'Direct Cost'}
        </span>
      )
    },
    {
      title: 'Net Profit',
      subtitle: 'Sales minus product cost',
      value: stats ? `Rs. ${(stats.netProfit ?? 0).toLocaleString()}` : 'Unavailable',
      icon: TrendingUp,
      color: '#10B981',
      bgColor: 'rgba(16, 185, 129, 0.1)',
      badge: (
        <span style={{
          padding: '6px 14px', borderRadius: '20px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          fontSize: '13px', fontWeight: '800'
        }}>
          +{stats?.profitMargin ?? 0}% Margin
        </span>
      )
    },
    {
      title: 'Orders & Risk Status',
      subtitle: 'Fulfillment & cancellation control',
      value: stats ? `${stats.totalOrders} Orders` : 'Unavailable',
      icon: ShoppingBag,
      color: '#8B5CF6',
      bgColor: 'rgba(139, 92, 246, 0.1)',
      badge: (stats?.cancellationRate ?? 0) > 30 ? (
        <span style={{
          padding: '6px 12px', borderRadius: '20px',
          backgroundColor: 'rgba(220, 38, 38, 0.12)', color: 'var(--danger-text)',
          border: '1px solid #DC2626',
          fontSize: '12px', fontWeight: '800'
        }}>
          ⚠ {stats?.cancellationRate}% Cancelled
        </span>
      ) : (
        <span style={{
          padding: '6px 12px', borderRadius: '20px',
          backgroundColor: 'rgba(22, 163, 74, 0.12)', color: 'var(--success-text)',
          fontSize: '12px', fontWeight: '700'
        }}>
          {stats?.deliveredOrders ?? 0} Delivered
        </span>
      )
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
              {card.badge}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>
              {card.title}
            </div>
            {'subtitle' in card && Boolean(card.subtitle) && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', opacity: 0.85 }}>
                {card.subtitle}
              </div>
            )}
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
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Revenue Overview
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Daily sales performance
              </p>
            </div>
            {stats?.chartData && stats.chartData.length > 0 && (
              <span style={{
                fontSize: '12px',
                fontWeight: '600',
                padding: '4px 10px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 138, 0, 0.12)',
                color: 'var(--accent-text)'
              }}>
                {stats.chartData.reduce((s, c) => s + c.orders, 0)} Orders Realized
              </span>
            )}
          </div>
          {stats?.chartData && stats.chartData.length > 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', height: '210px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
                {(() => {
                  const maxRev = Math.max(...stats.chartData.map(d => d.revenue), 1);
                  return stats.chartData.map((d, idx) => {
                    const heightPct = Math.max(Math.round((d.revenue / maxRev) * 100), 12);
                    return (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          minWidth: '56px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end'
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                          Rs. {d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue}
                        </div>
                        <div
                          title={`${d.date}: Rs. ${d.revenue.toLocaleString()} (${d.orders} orders)`}
                          style={{
                            width: '100%',
                            maxWidth: '42px',
                            height: `${heightPct}%`,
                            background: 'linear-gradient(180deg, #FF8A00 0%, #D97706 100%)',
                            borderRadius: '8px 8px 2px 2px',
                            boxShadow: '0 4px 12px rgba(255, 138, 0, 0.25)',
                            transition: 'height 0.4s ease'
                          }}
                        />
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                          {formatChartDate(d.date)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--accent-text)', opacity: 0.9, fontWeight: '700' }}>
                          {d.orders} ord
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            <div style={{
              height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '32px', textAlign: 'center', borderRadius: '12px',
              backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)'
            }}>
              No realized sales records available in this period.
            </div>
          )}
        </div>

        {/* Category Distribution */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Sales by Category
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Distribution of revenue by department
              </p>
            </div>
            {stats?.categoryStats && stats.categoryStats.length > 0 && (
              <span style={{
                fontSize: '12px',
                fontWeight: '600',
                padding: '4px 10px',
                borderRadius: '12px',
                backgroundColor: 'rgba(22, 163, 74, 0.12)',
                color: 'var(--success-text)'
              }}>
                {stats.categoryStats.length} Categories
              </span>
            )}
          </div>
          {stats?.categoryStats && stats.categoryStats.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '260px', overflowY: 'auto', paddingRight: '4px' }}>
              {(() => {
                const totalCatRev = stats.categoryStats.reduce((sum, c) => sum + (c.totalRevenue || 0), 0) || 1;
                const palette = ['#FF8A00', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4'];
                return stats.categoryStats.map((cat, idx) => {
                  const pct = Math.round(((cat.totalRevenue || 0) / totalCatRev) * 100);
                  const color = palette[idx % palette.length];
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} />
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{cat._id}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({cat.totalSales} units)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Rs. {cat.totalRevenue.toLocaleString()}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', minWidth: '32px', textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', backgroundColor: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div style={{
              height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '32px', textAlign: 'center', borderRadius: '12px',
              backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)'
            }}>
              No category sales data available.
            </div>
          )}
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

      {/* Executive Financial Health & P&L Statement */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '16px',
        padding: '28px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Financial Health & P&L Statement
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Executive reconciliation of commercial revenue, inventory expense, realized profit, and working capital.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px', borderRadius: '20px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981',
              fontSize: '12px', fontWeight: '700'
            }}>
              Net Realized Margin: +{stats?.profitMargin ?? 0}%
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px', borderRadius: '20px',
              backgroundColor: 'rgba(255, 138, 0, 0.12)', color: 'var(--accent-text)',
              fontSize: '12px', fontWeight: '700'
            }}>
              All-Time Realized
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          {/* Daily Turnover */}
          <div style={{
            padding: '24px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #0B132B 0%, #162244 100%)',
            color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', opacity: 0.85, fontWeight: '600' }}>Daily Turnover</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.15)' }}>Today</span>
              </div>
              <div style={{ fontSize: '30px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.5px' }}>
                {stats ? `Rs. ${stats.todayRevenue.toLocaleString()}` : 'Unavailable'}
              </div>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75, paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              Today&apos;s realized customer billing
            </div>
          </div>

          {/* Monthly Turnover */}
          <div style={{
            padding: '24px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #FF8A00 0%, #E67D00 100%)',
            color: '#0B132B', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', opacity: 0.9, fontWeight: '700' }}>Monthly Turnover</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(0,0,0,0.12)', fontWeight: '700' }}>This Month</span>
              </div>
              <div style={{ fontSize: '30px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.5px' }}>
                {stats ? `Rs. ${stats.monthlyRevenue.toLocaleString()}` : 'Unavailable'}
              </div>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.85, paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.1)', fontWeight: '600' }}>
              Current calendar month gross sales
            </div>
          </div>

          {/* Cash in Transit (Pending COD) */}
          <div style={{
            padding: '24px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #312E81 0%, #1E1B4B 100%)',
            color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', opacity: 0.85, fontWeight: '600' }}>Cash in Transit</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.15)' }}>Pending COD</span>
              </div>
              <div style={{ fontSize: '30px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.5px' }}>
                {stats ? `Rs. ${(stats.uncollectedCod ?? 0).toLocaleString()}` : 'Unavailable'}
              </div>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75, paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              Outstanding funds on pending/in-transit orders
            </div>
          </div>

          {/* Net Realized Profit (All Time) */}
          <div style={{
            padding: '24px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #166534 0%, #14532D 100%)',
            color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', opacity: 0.85, fontWeight: '600' }}>Net Realized Profit</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.15)' }}>All Time</span>
              </div>
              <div style={{ fontSize: '30px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.5px' }}>
                {stats ? `Rs. ${(stats.netProfit ?? 0).toLocaleString()}` : 'Unavailable'}
              </div>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75, paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              Gross sales minus total COGS (Rs. {(stats?.cogs ?? 0).toLocaleString()})
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
