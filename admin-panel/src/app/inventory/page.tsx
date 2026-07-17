'use client';

import { useState, useEffect } from 'react';
import { 
  Package, AlertTriangle, CheckCircle, TrendingUp, 
  TrendingDown, Search, Filter, Download, Upload,
  ArrowUpDown, ChevronDown, ChevronUp, X, Save,
  Box, ShoppingCart, Truck, Calendar
} from 'lucide-react';
import api from '@/lib/api';

interface InventoryItem {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
    images?: string[];
  };
  stock: number;
  lowStockThreshold: number;
  variants?: {
    sku: string;
    stock: number;
    attributes?: { name: string; value: string }[];
  }[];
  lastUpdated: string;
  warehouse?: string;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'low-stock' | 'out-of-stock'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'lastUpdated'>('name');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'update-stock' | 'export' | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState(0);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const response = await api.get('/inventory');
      if (response.data.success) {
        setInventory(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkAction || selectedItems.length === 0) return;

    try {
      if (bulkAction === 'update-stock' && editingId) {
        await api.put(`/inventory/${editingId}`, { stock: editStock });
        await fetchInventory();
        setEditingId(null);
      }
      setSelectedItems([]);
      setBulkAction('');
    } catch (error) {
      console.error('Bulk update error:', error);
    }
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Product Name', 'SKU', 'Stock', 'Low Stock Threshold', 'Status', 'Last Updated'].join(','),
      ...inventory.map(item => [
        item.product.name,
        item.product.sku,
        item.stock,
        item.lowStockThreshold,
        item.stock === 0 ? 'Out of Stock' : item.stock < item.lowStockThreshold ? 'Low Stock' : 'In Stock',
        new Date(item.lastUpdated).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusBadge = (item: InventoryItem) => {
    if (item.stock === 0) {
      return { bg: '#FEE2E2', color: '#DC2626', text: 'Out of Stock', icon: X };
    }
    if (item.stock < item.lowStockThreshold) {
      return { bg: '#FEF3C7', color: '#92400E', text: 'Low Stock', icon: AlertTriangle };
    }
    return { bg: '#D1FAE5', color: '#0F766E', text: 'In Stock', icon: CheckCircle };
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' ||
                         (filterType === 'low-stock' && item.stock < item.lowStockThreshold && item.stock > 0) ||
                         (filterType === 'out-of-stock' && item.stock === 0);
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sortBy === 'name') return a.product.name.localeCompare(b.product.name);
    if (sortBy === 'stock') return b.stock - a.stock;
    if (sortBy === 'lastUpdated') return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    return 0;
  });

  const stats = {
    total: inventory.length,
    inStock: inventory.filter(i => i.stock > i.lowStockThreshold).length,
    lowStock: inventory.filter(i => i.stock < i.lowStockThreshold && i.stock > 0).length,
    outOfStock: inventory.filter(i => i.stock === 0).length,
    totalValue: inventory.reduce((acc, item) => acc + (item.stock * 100), 0) // Approximate value
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Inventory Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Track stock levels, manage warehouses, and monitor inventory health.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={exportToCSV}
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--card-bg)'; }}
          >
            <Download size={18} /> Export
          </button>
          <button
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--primary-dark)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <Upload size={18} /> Import Stock
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={24} color="#3B82F6" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Products</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.total}</div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={24} color="#10B981" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>In Stock</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.inStock}</div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={24} color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Low Stock</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.lowStock}</div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={24} color="#EF4444" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Out of Stock</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.outOfStock}</div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search by product name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Products</option>
          <option value="low-stock">Low Stock</option>
          <option value="out-of-stock">Out of Stock</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="name">Sort by Name</option>
          <option value="stock">Sort by Stock</option>
          <option value="lastUpdated">Last Updated</option>
        </select>

        <div style={{
          display: 'flex',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--input-bg)'
        }}>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '10px 14px',
              border: 'none',
              backgroundColor: viewMode === 'list' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'list' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <ArrowUpDown size={18} />
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.length > 0 && (
        <div style={{
          backgroundColor: '#F0FDFA',
          borderRadius: '12px',
          padding: '16px 20px',
          border: '1px solid #0F766E',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              checked={selectedItems.length === filteredInventory.length}
              onChange={(e) => setSelectedItems(e.target.checked ? filteredInventory.map(i => i._id) : [])}
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: '600', color: '#0F766E' }}>
              {selectedItems.length} item(s) selected
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as any)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'white',
                fontSize: '14px'
              }}
            >
              <option value="">Bulk Actions</option>
              <option value="update-stock">Update Stock</option>
              <option value="export">Export Selected</option>
            </select>
            {bulkAction === 'update-stock' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  value={editStock}
                  onChange={(e) => setEditStock(parseInt(e.target.value) || 0)}
                  placeholder="New stock value"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    width: '150px'
                  }}
                />
                <button
                  onClick={handleBulkUpdate}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#0F766E',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Save size={16} /> Update
                </button>
              </div>
            )}
            <button
              onClick={() => { setSelectedItems([]); setBulkAction(''); }}
              style={{
                padding: '8px 12px',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inventory List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              height: '80px',
              animation: 'pulse 1.5s infinite',
              border: '1px solid var(--border-color)'
            }} />
          ))}
        </div>
      ) : filteredInventory.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '80px 20px',
          textAlign: 'center',
          border: '1px solid var(--border-color)',
          borderStyle: 'dashed'
        }}>
          <Package size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No inventory items found
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>Try adjusting your filters or search query</p>
        </div>
      ) : viewMode === 'list' ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.length === filteredInventory.length}
                      onChange={(e) => setSelectedItems(e.target.checked ? filteredInventory.map(i => i._id) : [])}
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Product</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SKU</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Stock Level</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Last Updated</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
                {filteredInventory.map((item) => {
                  const status = getStatusBadge(item);
                  const StatusIcon = status.icon;
                  
                  return (
                    <tr 
                      key={item._id} 
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItems([...selectedItems, item._id]);
                            } else {
                              setSelectedItems(selectedItems.filter(id => id !== item._id));
                            }
                          }}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden',
                            backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)'
                          }}>
                            <img 
                              src={item.product.images?.[0] || 'https://via.placeholder.com/100x100'} 
                              alt={item.product.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                              {item.product.name}
                            </div>
                            {item.warehouse && (
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                <Truck size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                {item.warehouse}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {item.product.sku}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            flex: 1,
                            height: '8px',
                            backgroundColor: item.stock < item.lowStockThreshold ? '#FEE2E2' : '#D1FAE5',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            maxWidth: '100px'
                          }}>
                            <div style={{
                              width: `${Math.min((item.stock / item.lowStockThreshold) * 100, 100)}%`,
                              height: '100%',
                              backgroundColor: item.stock < item.lowStockThreshold ? '#EF4444' : '#10B981',
                              borderRadius: '4px'
                            }} />
                          </div>
                          <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {item.stock}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Threshold: {item.lowStockThreshold}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          backgroundColor: status.bg,
                          color: status.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '700'
                        }}>
                          <StatusIcon size={14} />
                          {status.text}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <Calendar size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                        {new Date(item.lastUpdated).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => { setEditingId(item._id); setEditStock(item.stock); }}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}
                        >
                          Update Stock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filteredInventory.map((item) => {
            const status = getStatusBadge(item);
            const StatusIcon = status.icon;
            
            return (
              <div key={item._id} style={{
                backgroundColor: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                padding: '20px',
                transition: 'all 0.3s'
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden',
                      backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)'
                    }}>
                      <img 
                        src={item.product.images?.[0] || 'https://via.placeholder.com/100x100'} 
                        alt={item.product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>
                        {item.product.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {item.product.sku}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 12px',
                    backgroundColor: status.bg,
                    color: status.color,
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <StatusIcon size={12} />
                    {status.text}
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Stock Level</span>
                    <span style={{ fontWeight: '800', color: 'var(--text-primary)', fontSize: '20px' }}>{item.stock}</span>
                  </div>
                  <div style={{
                    height: '8px',
                    backgroundColor: item.stock < item.lowStockThreshold ? '#FEE2E2' : '#D1FAE5',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${Math.min((item.stock / item.lowStockThreshold) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: item.stock < item.lowStockThreshold ? '#EF4444' : '#10B981',
                      borderRadius: '4px',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'right' }}>
                    Low stock threshold: {item.lowStockThreshold}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setEditingId(item._id); setEditStock(item.stock); }}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px'
                    }}
                  >
                    Update Stock
                  </button>
                  <button
                    style={{
                      padding: '10px',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px'
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}