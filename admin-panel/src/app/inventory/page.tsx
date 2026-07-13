'use client';

import { useEffect, useState } from 'react';
import { 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Plus, 
  Minus, 
  Search,
  Filter,
  Loader,
  DollarSign,
  Boxes,
  History,
  Edit,
  CheckCircle,
  X,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import api from '@/lib/api';

interface Product {
  _id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  images: string[];
}

interface Transaction {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  type: 'in' | 'out' | 'adjustment' | 'return' | 'damage' | 'sale';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  performedBy: {
    fullName: string;
  };
  createdAt: string;
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'low-stock' | 'adjust' | 'history'>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionPagination, setTransactionPagination] = useState<any>(null);
  
  // Adjustment form
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    type: 'in' as 'in' | 'out' | 'adjustment',
    quantity: '',
    reason: ''
  });
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverview();
      fetchStats();
    } else if (activeTab === 'low-stock') {
      fetchLowStock();
    } else if (activeTab === 'history') {
      fetchTransactions();
    }
  }, [activeTab, transactionPage]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const response = await api.get('/inventory/overview');
      if (response.data.success) {
        setOverview(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching overview:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/inventory/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchLowStock = async () => {
    try {
      setLoading(true);
      const response = await api.get('/inventory/low-stock');
      if (response.data.success) {
        setLowStock(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching low stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/inventory/history?page=${transactionPage}&limit=20`);
      if (response.data.success) {
        setTransactions(response.data.data);
        setTransactionPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!selectedProduct || !adjustForm.quantity || !adjustForm.reason) {
      alert('Please fill all fields');
      return;
    }

    setAdjusting(true);
    try {
      const response = await api.post('/inventory/adjust', {
        productId: selectedProduct._id,
        quantity: parseInt(adjustForm.quantity),
        type: adjustForm.type,
        reason: adjustForm.reason
      });

      if (response.data.success) {
        setShowAdjustModal(false);
        setSelectedProduct(null);
        setAdjustForm({ type: 'in', quantity: '', reason: '' });
        await fetchOverview();
        await fetchStats();
        await fetchLowStock();
        alert('Stock adjusted successfully!');
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  };

  const openAdjustModal = (product: Product) => {
    setSelectedProduct(product);
    setAdjustForm({ type: 'in', quantity: '', reason: '' });
    setShowAdjustModal(true);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'in': return { bg: '#D1FAE5', color: '#0F766E', icon: ArrowUpRight };
      case 'out': return { bg: '#FEE2E2', color: '#DC2626', icon: ArrowDownRight };
      case 'adjustment': return { bg: '#DBEAFE', color: '#1E40AF', icon: Edit };
      case 'return': return { bg: '#FEF3C7', color: '#92400E', icon: History };
      case 'damage': return { bg: '#FEE2E2', color: '#DC2626', icon: AlertTriangle };
      case 'sale': return { bg: '#EDE9FE', color: '#6D28D9', icon: DollarSign };
      default: return { bg: '#F3F4F6', color: '#6B7280', icon: Package };
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)'
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Boxes },
    { id: 'low-stock', label: 'Low Stock', icon: AlertTriangle },
    { id: 'adjust', label: 'Adjust Stock', icon: Edit },
    { id: 'history', label: 'History', icon: History }
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Inventory Management
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Track stock levels, manage inventory, and monitor movements
        </p>
      </div>

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
              onClick={() => setActiveTab(tab.id as any)}
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
              {tab.id === 'low-stock' && stats?.lowStock > 0 && (
                <span style={{
                  backgroundColor: '#EF4444',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700'
                }}>
                  {stats.lowStock}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div>
          {/* Stats Cards */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Boxes size={24} color="#3B82F6" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Products</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.totalProducts}</div>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={24} color="#10B981" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Stock</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.totalStock.toLocaleString()}</div>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DollarSign size={24} color="#F59E0B" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Inventory Value</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Rs. {stats.totalValue.toLocaleString()}</div>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={24} color="#EF4444" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Low Stock</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#EF4444' }}>{stats.lowStock}</div>
                </div>
              </div>
            </div>
          )}

          {/* Category-wise Stock */}
          {overview?.categoryStock && overview.categoryStock.length > 0 && (
            <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                Stock by Category
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Category</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Products</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Total Stock</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.categoryStock.map((cat: any, index: number) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{cat._id || 'Uncategorized'}</td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{cat.productCount}</td>
                        <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{cat.totalStock.toLocaleString()}</td>
                        <td style={{ padding: '12px', fontWeight: '600', color: 'var(--primary)' }}>Rs. {cat.totalValue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          {overview?.recentTransactions && overview.recentTransactions.length > 0 && (
            <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
                Recent Stock Movements
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {overview.recentTransactions.map((t: Transaction) => {
                  const typeConfig = getTypeColor(t.type);
                  const TypeIcon = typeConfig.icon;
                  return (
                    <div key={t._id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: typeConfig.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TypeIcon size={20} color={typeConfig.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
                          {t.product?.name || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {t.reason} • by {t.performedBy?.fullName || 'Admin'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '700', color: typeConfig.color, fontSize: '14px' }}>
                          {t.type === 'in' ? '+' : '-'}{t.quantity}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {t.previousStock} → {t.newStock}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LOW STOCK TAB */}
      {activeTab === 'low-stock' && (
        <div>
          <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={24} color="#F59E0B" />
            <div>
              <div style={{ fontWeight: '700', color: '#92400E' }}>Low Stock Alert</div>
              <div style={{ fontSize: '14px', color: '#92400E' }}>
                {lowStock.length} products need restocking
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
            </div>
          ) : lowStock.length === 0 ? (
            <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <CheckCircle size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="#10B981" />
              <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>All stock levels are good!</p>
            </div>
          ) : (
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <tr>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Product</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>SKU</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Category</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Current Stock</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Price</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((product) => (
                      <tr key={product._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>{product.name}</td>
                        <td style={{ padding: '16px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{product.sku}</td>
                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{product.category}</td>
                        <td style={{ padding: '16px' }}>
                          <span style={{
                            padding: '6px 12px',
                            backgroundColor: product.stock === 0 ? '#FEE2E2' : '#FEF3C7',
                            color: product.stock === 0 ? '#DC2626' : '#92400E',
                            borderRadius: '20px',
                            fontSize: '13px',
                            fontWeight: '700'
                          }}>
                            {product.stock} units
                          </span>
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-primary)' }}>Rs. {product.price}</td>
                        <td style={{ padding: '16px' }}>
                          <button
                            onClick={() => openAdjustModal(product)}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '13px'
                            }}
                          >
                            Restock
                          </button>
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

      {/* ADJUST STOCK TAB */}
      {activeTab === 'adjust' && (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>
            Manual Stock Adjustment
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Update stock levels manually with a reason
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Select Product *
              </label>
              <select
                value={selectedProduct?._id || ''}
                onChange={(e) => {
                  const product = overview?.recentTransactions?.find((t: any) => t.product?._id === e.target.value) ? null : null;
                  // We'll use a different approach - show a list
                }}
                style={inputStyle}
              >
                <option value="">-- Select a product --</option>
              </select>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                💡 Tip: Use the "Low Stock" tab to quickly restock products
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Adjustment Type *
              </label>
              <select
                value={adjustForm.type}
                onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value as any })}
                style={inputStyle}
              >
                <option value="in">Stock In (Add)</option>
                <option value="out">Stock Out (Remove)</option>
                <option value="adjustment">Direct Set (Replace)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Quantity *
              </label>
              <input
                type="number"
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                placeholder="Enter quantity"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Reason *
              </label>
              <input
                type="text"
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                placeholder="e.g., New shipment received"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#DBEAFE', borderRadius: '10px', border: '1px solid #3B82F6', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <AlertTriangle size={18} color="#1E40AF" />
              <span style={{ fontWeight: '600', color: '#1E40AF' }}>Important</span>
            </div>
            <p style={{ fontSize: '13px', color: '#1E40AF', margin: 0 }}>
              All stock adjustments are logged with your user ID and timestamp. This action cannot be undone but can be reversed with another adjustment.
            </p>
          </div>

          <button
            onClick={() => alert('Please select a product from the Low Stock tab to adjust stock')}
            style={{
              padding: '14px 32px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '15px'
            }}
          >
            Adjust Stock
          </button>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...inputStyle, paddingLeft: '48px' }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <History size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
              <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)' }}>No transactions yet</p>
            </div>
          ) : (
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <tr>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Product</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Type</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Change</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Stock</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Reason</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>By</th>
                      <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const typeConfig = getTypeColor(t.type);
                      const TypeIcon = typeConfig.icon;
                      return (
                        <tr key={t._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '16px' }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{t.product?.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{t.product?.sku}</div>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              padding: '6px 12px',
                              backgroundColor: typeConfig.bg,
                              color: typeConfig.color,
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              textTransform: 'capitalize'
                            }}>
                              <TypeIcon size={12} />
                              {t.type}
                            </span>
                          </td>
                          <td style={{ padding: '16px', fontWeight: '700', color: typeConfig.color }}>
                            {t.type === 'in' ? '+' : '-'}{t.quantity}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {t.previousStock} → {t.newStock}
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.reason}
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                            {t.performedBy?.fullName || 'Admin'}
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {new Date(t.createdAt).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {transactionPagination && transactionPagination.pages > 1 && (
                <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setTransactionPage(transactionPagination.page - 1)}
                    disabled={!transactionPagination.hasPrev}
                    style={{ padding: '8px 16px', backgroundColor: transactionPagination.hasPrev ? 'var(--primary)' : '#9CA3AF', color: 'white', border: 'none', borderRadius: '8px', cursor: transactionPagination.hasPrev ? 'pointer' : 'not-allowed', fontWeight: '600' }}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setTransactionPage(transactionPagination.page + 1)}
                    disabled={!transactionPagination.hasNext}
                    style={{ padding: '8px 16px', backgroundColor: transactionPagination.hasNext ? 'var(--primary)' : '#9CA3AF', color: 'white', border: 'none', borderRadius: '8px', cursor: transactionPagination.hasNext ? 'pointer' : 'not-allowed', fontWeight: '600' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setShowAdjustModal(false)}>
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '500px', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>Adjust Stock</h2>
              <button onClick={() => setShowAdjustModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {selectedProduct.name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                SKU: {selectedProduct.sku} • Current Stock: <strong>{selectedProduct.stock} units</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Type *</label>
                <select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value as any })} style={inputStyle}>
                  <option value="in">Stock In (Add)</option>
                  <option value="out">Stock Out (Remove)</option>
                  <option value="adjustment">Direct Set</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Quantity *</label>
                <input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} placeholder="Enter quantity" style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Reason *</label>
                <textarea value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="e.g., New shipment received" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => setShowAdjustModal(false)} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                <button onClick={handleAdjustStock} disabled={adjusting} style={{ flex: 1, padding: '14px', backgroundColor: adjusting ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: adjusting ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  {adjusting ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={20} />}
                  {adjusting ? 'Adjusting...' : 'Confirm Adjustment'}
                </button>
              </div>
            </div>
          </div>
        </div>
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