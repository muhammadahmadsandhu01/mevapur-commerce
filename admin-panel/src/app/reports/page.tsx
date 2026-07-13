'use client';

import { useEffect, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  Download,
  Calendar,
  Loader,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import api from '@/lib/api';

interface SalesData {
  date: string;
  revenue: number;
  orders: number;
}

interface PaymentMethod {
  _id: string;
  count: number;
  total: number;
}

interface ProductItem {
  _id: string;
  name: string;
  price: number;
  stock: number;
  soldCount: number;
  category: string;
  images: string[];
}

interface CategoryStat {
  _id: string;
  totalSales: number;
  totalRevenue: number;
  productCount: number;
}

interface CustomerSpender {
  userId: string;
  fullName: string;
  email: string;
  totalSpent: number;
  orderCount: number;
}

interface GrowthData {
  date: string;
  newCustomers: number;
}

interface OrderItem {
  _id: string;
  orderId: string;
  user?: {
    fullName: string;
    email: string;
  };
  totalAmount: number;
  orderStatus: string;
  createdAt: string;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('sales');
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab === 'sales') fetchSalesReport();
    else if (activeTab === 'products') fetchProductReport();
    else if (activeTab === 'customers') fetchCustomerReport();
    else if (activeTab === 'orders') fetchOrderReport();
  }, [activeTab, dateRange]);

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/reports/analytics');
      if (response.data.success) {
        setAnalytics(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const fetchSalesReport = async () => {
    setLoading(true);
    try {
      const params: any = { period: 'daily' };
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;

      const response = await api.get('/reports/sales', { params });
      if (response.data.success) {
        setSalesData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching sales report:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductReport = async () => {
    setLoading(true);
    try {
      const response = await api.get('/reports/products');
      if (response.data.success) {
        setProductData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching product report:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerReport = async () => {
    setLoading(true);
    try {
      const response = await api.get('/reports/customers');
      if (response.data.success) {
        setCustomerData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching customer report:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderReport = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;

      const response = await api.get('/reports/orders', { params });
      if (response.data.success) {
        setOrderData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching order report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: string) => {
    try {
      const response = await api.get(`/reports/export/${type}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_report_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export report');
    }
  };

  const tabs = [
    { id: 'sales', label: 'Sales', icon: DollarSign },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'orders', label: 'Orders', icon: ShoppingCart }
  ];

  const COLORS = ['#0F766E', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#10B981'];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '800', 
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}>
          Reports & Analytics
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Comprehensive business insights and performance metrics
        </p>
      </div>

      {/* Analytics Summary Cards */}
      {analytics && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: '20px',
          marginBottom: '32px'
        }}>
          <div style={{
            padding: '24px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
            color: 'white'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>This Month Revenue</div>
                <div style={{ fontSize: '32px', fontWeight: '800' }}>
                  Rs. {analytics.thisMonth.revenue.toLocaleString()}
                </div>
              </div>
              <DollarSign size={32} style={{ opacity: 0.3 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              {analytics.growth.revenue >= 0 ? (
                <>
                  <ArrowUpRight size={18} />
                  <span>+{analytics.growth.revenue}% vs last month</span>
                </>
              ) : (
                <>
                  <ArrowDownRight size={18} />
                  <span>{analytics.growth.revenue}% vs last month</span>
                </>
              )}
            </div>
          </div>

          <div style={{
            padding: '24px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
            color: 'white'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>This Month Orders</div>
                <div style={{ fontSize: '32px', fontWeight: '800' }}>
                  {analytics.thisMonth.orders.toLocaleString()}
                </div>
              </div>
              <ShoppingCart size={32} style={{ opacity: 0.3 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              {analytics.growth.orders >= 0 ? (
                <>
                  <ArrowUpRight size={18} />
                  <span>+{analytics.growth.orders}% vs last month</span>
                </>
              ) : (
                <>
                  <ArrowDownRight size={18} />
                  <span>{analytics.growth.orders}% vs last month</span>
                </>
              )}
            </div>
          </div>

          <div style={{
            padding: '24px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: 'white'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Last Month Revenue</div>
                <div style={{ fontSize: '32px', fontWeight: '800' }}>
                  Rs. {analytics.lastMonth.revenue.toLocaleString()}
                </div>
              </div>
              <TrendingUp size={32} style={{ opacity: 0.3 }} />
            </div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>
              {analytics.lastMonth.orders} orders processed
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px',
        borderBottom: '2px solid var(--border-color)',
        paddingBottom: '8px',
        flexWrap: 'wrap'
      }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 24px',
                backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-secondary)',
                border: isActive ? 'none' : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: isActive ? '700' : '500',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Date Range Filter */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <Calendar size={20} color="var(--text-secondary)" />
        <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            style={{
              padding: '10px 14px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '14px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          />
          <span style={{ alignSelf: 'center', color: 'var(--text-secondary)' }}>to</span>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            style={{
              padding: '10px 14px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '14px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          />
        </div>
        <button
          onClick={() => handleExport(activeTab)}
          style={{
            padding: '10px 20px',
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Download size={18} />
          Export CSV
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading report...</p>
        </div>
      ) : (
        <>
          {/* SALES REPORT */}
          {activeTab === 'sales' && salesData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Revenue</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>
                    Rs. {salesData.summary.totalRevenue.toLocaleString()}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Orders</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {salesData.summary.totalOrders}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Avg Order Value</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    Rs. {Math.round(salesData.summary.averageOrderValue).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Revenue Chart */}
              <div style={{
                backgroundColor: 'var(--card-bg)',
                padding: '24px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                  Revenue Trend
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesData.chartData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0F766E" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#0F766E" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} />
                    <YAxis stroke="var(--text-secondary)" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px'
                      }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#0F766E" fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Payment Methods */}
              {salesData.paymentMethods && salesData.paymentMethods.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                    Payment Methods
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={salesData.paymentMethods}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry: any) => `${entry._id}: ${entry.count}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {salesData.paymentMethods.map((entry: PaymentMethod, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* PRODUCTS REPORT */}
          {activeTab === 'products' && productData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Products</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {productData.totalProducts}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Low Stock</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#F59E0B' }}>
                    {productData.lowStockProducts?.length || 0}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Out of Stock</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#EF4444' }}>
                    {productData.outOfStockCount || 0}
                  </div>
                </div>
              </div>

              {/* Top Products */}
              <div style={{
                backgroundColor: 'var(--card-bg)',
                padding: '24px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                  Top Selling Products
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Product</th>
                        <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Category</th>
                        <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Price</th>
                        <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Sold</th>
                        <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productData.topProducts && productData.topProducts.map((product: ProductItem, index: number) => (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{product.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{product.category}</td>
                          <td style={{ padding: '12px', color: 'var(--text-primary)' }}>Rs. {product.price}</td>
                          <td style={{ padding: '12px', color: 'var(--text-primary)', fontWeight: '600' }}>{product.soldCount}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              padding: '4px 10px',
                              backgroundColor: product.stock === 0 ? '#FEE2E2' : product.stock < 50 ? '#FEF3C7' : '#D1FAE5',
                              color: product.stock === 0 ? '#DC2626' : product.stock < 50 ? '#92400E' : '#0F766E',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {product.stock}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category Performance */}
              {productData.categoryStats && productData.categoryStats.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                    Sales by Category
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={productData.categoryStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="_id" stroke="var(--text-secondary)" fontSize={12} />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card-bg)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="totalRevenue" fill="#0F766E" name="Revenue (Rs.)" />
                      <Bar dataKey="totalSales" fill="#3B82F6" name="Units Sold" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* CUSTOMERS REPORT */}
          {activeTab === 'customers' && customerData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Customers</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {customerData.summary?.totalCustomers || 0}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>New (Last 30 Days)</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#10B981' }}>
                    {customerData.summary?.newCustomers || 0}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Growth Rate</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#3B82F6' }}>
                    {customerData.summary?.growthRate || 0}%
                  </div>
                </div>
              </div>

              {/* Customer Growth Chart */}
              {customerData.customerGrowth && customerData.customerGrowth.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                    Customer Growth (Last 30 Days)
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={customerData.customerGrowth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={11} />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card-bg)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="newCustomers" fill="#8B5CF6" name="New Customers" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top Spenders */}
              {customerData.topSpenders && customerData.topSpenders.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                    Top Spenders
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Customer</th>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Email</th>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Orders</th>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Total Spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerData.topSpenders.map((spender: CustomerSpender, index: number) => (
                          <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{spender.fullName}</td>
                            <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{spender.email}</td>
                            <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{spender.orderCount}</td>
                            <td style={{ padding: '12px', fontWeight: '700', color: 'var(--primary)' }}>Rs. {spender.totalSpent.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ORDERS REPORT */}
          {activeTab === 'orders' && orderData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Orders</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {orderData.totalOrders || 0}
                  </div>
                </div>
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Avg Processing Time</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>
                    {orderData.avgProcessingTime || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Status Breakdown */}
              {orderData.statusBreakdown && orderData.statusBreakdown.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                    Order Status Breakdown
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={orderData.statusBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry: any) => `${entry._id}: ${entry.count}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {orderData.statusBreakdown.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recent Orders Table */}
              {orderData.recentOrders && orderData.recentOrders.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--card-bg)',
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                    Recent Orders
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Order ID</th>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Customer</th>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Total</th>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Status</th>
                          <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderData.recentOrders.slice(0, 20).map((order: OrderItem, index: number) => (
                          <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: '600' }}>{order.orderId}</td>
                            <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{order.user?.fullName || 'N/A'}</td>
                            <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>Rs. {order.totalAmount?.toLocaleString()}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{
                                padding: '4px 10px',
                                backgroundColor: order.orderStatus === 'Delivered' ? '#D1FAE5' : order.orderStatus === 'Pending' ? '#FEF3C7' : order.orderStatus === 'Cancelled' ? '#FEE2E2' : '#DBEAFE',
                                color: order.orderStatus === 'Delivered' ? '#0F766E' : order.orderStatus === 'Pending' ? '#92400E' : order.orderStatus === 'Cancelled' ? '#DC2626' : '#1E40AF',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                {order.orderStatus}
                              </span>
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                              {new Date(order.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}