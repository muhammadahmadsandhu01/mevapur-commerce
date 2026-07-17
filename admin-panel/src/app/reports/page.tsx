'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Download, TrendingUp, Users, Package, DollarSign, FileText, Loader, AlertCircle, CheckCircle } from 'lucide-react';
import api from '@/lib/api';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'customers'>('sales');
  const [dateRange, setDateRange] = useState('30');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        const endpoint = activeTab === 'sales' ? '/reports/sales' : activeTab === 'inventory' ? '/reports/products' : '/reports/customers';
        const response = await api.get(endpoint, { params: { period: dateRange } });
        if (response.data.success) {
          setReportData(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching report:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [activeTab, dateRange]);

  const tabs = [
    { id: 'sales', label: 'Sales Report', icon: DollarSign },
    { id: 'inventory', label: 'Inventory Report', icon: Package },
    { id: 'customers', label: 'Customer Report', icon: Users },
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Reports & Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Comprehensive insights into your store's performance.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
            style={{ padding: '10px 16px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', outline: 'none' }}>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 3 Months</option>
          </select>
          <button style={{ padding: '10px 16px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 20px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                fontSize: '15px', fontWeight: '600', color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
              <Icon size={18} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          <Loader size={48} className="animate-spin text-teal-700" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : reportData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {activeTab === 'sales' && reportData.summary && (
              <>
                <KPICard label="Total Revenue" value={`Rs. ${(reportData.summary.totalRevenue || 0).toLocaleString()}`} icon={TrendingUp} color="#10B981" bg="#D1FAE5" />
                <KPICard label="Total Orders" value={(reportData.summary.totalOrders || 0).toString()} icon={FileText} color="#3B82F6" bg="#DBEAFE" />
                <KPICard label="Avg Order Value" value={`Rs. ${(reportData.summary.averageOrderValue || 0).toLocaleString()}`} icon={BarChart3} color="#F59E0B" bg="#FEF3C7" />
              </>
            )}
            {activeTab === 'inventory' && (
              <>
                <KPICard label="Total Products" value={(reportData.totalProducts || 0).toString()} icon={Package} color="#3B82F6" bg="#DBEAFE" />
                <KPICard label="Low Stock Items" value={(reportData.lowStockProducts?.length || 0).toString()} icon={AlertCircle} color="#EF4444" bg="#FEE2E2" />
                <KPICard label="Out of Stock" value={(reportData.outOfStockCount || 0).toString()} icon={AlertCircle} color="#DC2626" bg="#FEE2E2" />
              </>
            )}
            {activeTab === 'customers' && reportData.summary && (
              <>
                <KPICard label="Total Customers" value={(reportData.summary.totalCustomers || 0).toString()} icon={Users} color="#3B82F6" bg="#DBEAFE" />
                <KPICard label="New This Period" value={(reportData.summary.newCustomers || 0).toString()} icon={TrendingUp} color="#10B981" bg="#D1FAE5" />
                <KPICard label="Growth Rate" value={`${reportData.summary.growthRate || 0}%`} icon={CheckCircle} color="#10B981" bg="#D1FAE5" />
              </>
            )}
          </div>

          {/* Top Items Table */}
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {activeTab === 'sales' ? 'Revenue by Period' : activeTab === 'inventory' ? 'Low Stock Products' : 'Top Spending Customers'}
              </h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Name / Date</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Metric 1</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Metric 2</th>
                </tr>
              </thead>
              <tbody>
                {activeTab === 'sales' && reportData.chartData?.slice(0, 10).map((item: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--text-primary)' }}>{item.date}</td>
                    <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{item.orders} Orders</td>
                    <td style={{ padding: '16px 24px', fontWeight: '700', color: 'var(--primary)' }}>Rs. {(item.revenue || 0).toLocaleString()}</td>
                  </tr>
                ))}
                {activeTab === 'inventory' && reportData.lowStockProducts?.slice(0, 10).map((item: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--text-primary)' }}>{item.name}</td>
                    <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>Stock: {item.stock}</td>
                    <td style={{ padding: '16px 24px', fontWeight: '700', color: '#EF4444' }}>Low Stock Alert</td>
                  </tr>
                ))}
                {activeTab === 'customers' && reportData.topSpenders?.slice(0, 10).map((item: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--text-primary)' }}>{item.fullName}</td>
                    <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{item.orderCount} Orders</td>
                    <td style={{ padding: '16px 24px', fontWeight: '700', color: 'var(--primary)' }}>Rs. {(item.totalSpent || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '80px 32px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <BarChart3 size={64} color="var(--text-secondary)" style={{ opacity: 0.2, marginBottom: '16px', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>No Data Available</h3>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color, bg }: any) {
  return (
    <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '24px', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>{label}</div>
        <div style={{ padding: '8px', backgroundColor: bg, borderRadius: '8px' }}><Icon size={20} color={color} /></div>
      </div>
      <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}