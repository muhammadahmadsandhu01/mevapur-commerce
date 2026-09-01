'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import {
  Package, AlertTriangle, CheckCircle,
  Search, Download, ChevronDown, ChevronUp,
  X, Box, History, Loader, AlertCircle, Layers
} from 'lucide-react';
import api from '@/lib/api';
import { PRODUCT_PLACEHOLDER } from '@/lib/placeholder';

interface InventoryVariant {
  _id: string;
  sku: string;
  stock: number;
  price: number;
  attributes?: { name: string; value: string }[];
}

interface InventoryItem {
  _id: string;
  id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
    images?: string[];
    price: number;
    category?: { id: string; name: string } | null;
  };
  stock: number;
  lowStockThreshold: number;
  hasVariants: boolean;
  variants: InventoryVariant[];
  lastUpdated: string;
}

interface InventorySummary {
  global: {
    totalProducts: number;
    totalSellableSkus: number;
    totalPhysicalUnits: number;
    inStockSkus: number;
    lowStockSkus: number;
    outOfStockSkus: number;
  };
}

interface HistoryTransaction {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  variantId?: string | null;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  reference?: string;
  performedBy: {
    fullName: string;
    email: string;
  };
  createdAt: string;
}

function InventoryContent() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockStatus, setStockStatus] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
  const [sortBy, setSortBy] = useState<'stock-asc' | 'stock-desc' | 'name-asc' | 'name-desc' | 'updatedAt-desc'>('stock-asc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // Adjustment Modal State
  const [adjustTargetProduct, setAdjustTargetProduct] = useState<InventoryItem | null>(null);
  const [adjustVariantId, setAdjustVariantId] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'in' | 'out' | 'adjustment'>('in');
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustReference, setAdjustReference] = useState<string>('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // History Drawer State
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // Export State
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: 15,
        sortBy
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (stockStatus !== 'all') params.stockStatus = stockStatus;

      const response = await api.get('/inventory', { params });
      if (response.data.success) {
        setInventory(response.data.data);
        if (response.data.summary) {
          setSummary(response.data.summary);
        }
        if (response.data.pagination) {
          setTotalPages(response.data.pagination.pages || 1);
          setTotalRecords(response.data.pagination.total || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, stockStatus, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchInventory();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchInventory]);

  const toggleExpand = (productId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const openAdjustModal = (item: InventoryItem, variantId?: string) => {
    setAdjustTargetProduct(item);
    setAdjustVariantId(variantId || (item.hasVariants && item.variants.length > 0 ? item.variants[0]._id : ''));
    setAdjustType('in');
    setAdjustQuantity(1);
    setAdjustReason('');
    setAdjustReference('');
    setAdjustError(null);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTargetProduct) return;

    if (!adjustReason.trim()) {
      setAdjustError('A reason is required for audit recording.');
      return;
    }

    if (adjustTargetProduct.hasVariants && !adjustVariantId) {
      setAdjustError('Please select a specific variant to adjust.');
      return;
    }

    setAdjustLoading(true);
    setAdjustError(null);

    try {
      const operationKey = crypto.randomUUID();
      const payload: Record<string, unknown> = {
        productId: adjustTargetProduct.product._id,
        type: adjustType,
        quantity: Number(adjustQuantity),
        reason: adjustReason.trim(),
        reference: adjustReference.trim() || undefined,
        operationKey
      };

      if (adjustTargetProduct.hasVariants && adjustVariantId) {
        payload.variantId = adjustVariantId;
      }

      const response = await api.post('/inventory/adjust', payload);
      if (response.data.success) {
        setAdjustTargetProduct(null);
        await fetchInventory();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to adjust stock';
      setAdjustError(msg);
    } finally {
      setAdjustLoading(false);
    }
  };

  const fetchHistory = async (pageToFetch = 1) => {
    setHistoryLoading(true);
    try {
      const response = await api.get('/inventory/history', {
        params: { page: pageToFetch, limit: 20 }
      });
      if (response.data.success) {
        setHistoryItems(response.data.data);
        if (response.data.pagination) {
          setHistoryTotalPages(response.data.pagination.pages || 1);
          setHistoryPage(response.data.pagination.page || 1);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stock history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryDrawer = () => {
    setHistoryOpen(true);
    void fetchHistory(1);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const params: Record<string, string> = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (stockStatus !== 'all') params.stockStatus = stockStatus;

      const response = await api.get('/inventory/export', {
        params,
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to export inventory dataset';
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  };

  const globalMetrics = summary?.global || {
    totalProducts: totalRecords,
    totalSellableSkus: totalRecords,
    totalPhysicalUnits: inventory.reduce((sum, item) => sum + (item.stock || 0), 0),
    inStockSkus: 0,
    lowStockSkus: 0,
    outOfStockSkus: 0
  };

  const getStatusBadge = (stock: number, threshold = 10) => {
    if (stock <= 0) {
      return { bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger-text)', text: 'Out of Stock', icon: X };
    }
    if (stock <= threshold) {
      return { bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-text)', text: 'Low Stock', icon: AlertTriangle };
    }
    return { bg: 'rgba(22, 163, 74, 0.12)', color: 'var(--success-text)', text: 'In Stock', icon: CheckCircle };
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.5px' }}>
            Inventory Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Sellable SKU stock controls, atomic variant adjustments, and transaction audit trails.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={openHistoryDrawer}
            style={{
              padding: '12px 18px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <History size={18} /> Stock History
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: exporting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: exporting ? 0.6 : 1
            }}
          >
            {exporting ? <Loader size={18} className="animate-spin" /> : <Download size={18} />}
            {exporting ? 'Exporting...' : `Export Full Dataset (${totalRecords})`}
          </button>
        </div>
      </div>

      {exportError && (
        <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '10px', color: 'var(--danger-text)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <AlertCircle size={18} /> {exportError}
          </div>
          <button onClick={() => setExportError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}

      {/* Truthful Global KPI Telemetry (Zero Fabricated Valuation) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Total Products</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={20} color="var(--primary)" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalMetrics.totalProducts.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Catalog product groups</div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Sellable SKUs</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={20} color="#A855F7" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalMetrics.totalSellableSkus.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Independent sellable lines</div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Total Physical Units</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(255, 138, 0, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box size={20} color="var(--accent-text)" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalMetrics.totalPhysicalUnits.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Total units in warehouse</div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Low / Out of Stock SKUs</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} color="var(--warning-text)" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--warning-text)' }}>
            {(globalMetrics.lowStockSkus + globalMetrics.outOfStockSkus).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {globalMetrics.lowStockSkus} low, {globalMetrics.outOfStockSkus} out of stock
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); void fetchInventory(); }} style={{ display: 'flex', gap: '8px', flex: '1', minWidth: '280px', maxWidth: '460px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search product name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px 12px 42px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '0 18px',
              backgroundColor: 'var(--primary)',
              color: '#0B132B',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-primary)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            {(['all', 'in-stock', 'low-stock', 'out-of-stock'] as const).map((st) => (
              <button
                key={st}
                onClick={() => { setStockStatus(st); setPage(1); }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: stockStatus === st ? 'var(--card-bg)' : 'transparent',
                  color: stockStatus === st ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: stockStatus === st ? '700' : '500',
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: stockStatus === st ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                {st === 'all' ? 'All' : st === 'in-stock' ? 'In Stock' : st === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
              </button>
            ))}
          </div>

          {/* Sort Select */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as 'stock-asc' | 'stock-desc' | 'name-asc' | 'name-desc' | 'updatedAt-desc'); setPage(1); }}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="stock-asc">Lowest Stock First</option>
            <option value="stock-desc">Highest Stock First</option>
            <option value="name-asc">Product Name (A-Z)</option>
            <option value="name-desc">Product Name (Z-A)</option>
            <option value="updatedAt-desc">Recently Updated</option>
          </select>
        </div>
      </div>

      {/* Inventory Table with Expandable Variants */}
      <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading inventory records...</p>
          </div>
        ) : inventory.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>No Products Found</h3>
            <p style={{ fontSize: '14px' }}>Try adjusting your search query or filter options.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '16px 20px', width: '40px' }}></th>
                  <th style={{ padding: '16px 20px' }}>Product & Root SKU</th>
                  <th style={{ padding: '16px 20px' }}>Category</th>
                  <th style={{ padding: '16px 20px' }}>Current Stock</th>
                  <th style={{ padding: '16px 20px' }}>Threshold</th>
                  <th style={{ padding: '16px 20px' }}>Stock Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => {
                  const isExpanded = expandedProducts.has(item._id);
                  const badge = getStatusBadge(item.stock, item.lowStockThreshold);

                  return (
                    <tr key={item._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '40px 1.8fr 1fr 1fr 1fr 1.2fr 1.2fr', alignItems: 'center', padding: '16px 20px', borderBottom: isExpanded ? '1px dashed var(--border-color)' : 'none' }}>
                          <div>
                            {item.hasVariants && item.variants.length > 0 && (
                              <button
                                onClick={() => toggleExpand(item._id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
                              >
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-color)' }}>
                              <img
                                src={item.product.images?.[0] || PRODUCT_PLACEHOLDER}
                                alt={item.product.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER; }}
                              />
                            </div>
                            <div>
                              <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{item.product.name}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                SKU: {item.product.sku} {item.hasVariants ? `(${item.variants.length} variants)` : ''}
                              </div>
                            </div>
                          </div>

                          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {item.product.category?.name || 'Uncategorized'}
                          </div>

                          <div>
                            <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{item.stock}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '4px' }}>units</span>
                          </div>

                          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {item.lowStockThreshold} units
                          </div>

                          <div>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: '700',
                              backgroundColor: badge.bg,
                              color: badge.color
                            }}>
                              {badge.text}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => openAdjustModal(item)}
                              style={{
                                padding: '8px 16px',
                                backgroundColor: 'var(--primary)',
                                color: '#0B132B',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: '700',
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              Adjust Stock
                            </button>
                          </div>
                        </div>

                        {/* Variant Sub-Rows */}
                        {isExpanded && item.hasVariants && (
                          <div style={{ backgroundColor: 'var(--bg-primary)', padding: '12px 20px 16px 60px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>
                              Individual Variant Sellable SKUs
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                  <th style={{ padding: '8px 12px' }}>Variant SKU</th>
                                  <th style={{ padding: '8px 12px' }}>Attributes</th>
                                  <th style={{ padding: '8px 12px' }}>Stock</th>
                                  <th style={{ padding: '8px 12px' }}>Status</th>
                                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.variants.map((v) => {
                                  const vBadge = getStatusBadge(v.stock, item.lowStockThreshold);
                                  return (
                                    <tr key={v._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                      <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--text-primary)' }}>{v.sku}</td>
                                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                        {v.attributes && v.attributes.length > 0
                                          ? v.attributes.map((a) => `${a.name}: ${a.value}`).join(' | ')
                                          : 'Default'}
                                      </td>
                                      <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-primary)' }}>{v.stock} units</td>
                                      <td style={{ padding: '10px 12px' }}>
                                        <span style={{
                                          padding: '2px 8px',
                                          borderRadius: '8px',
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          backgroundColor: vBadge.bg,
                                          color: vBadge.color
                                        }}>
                                          {vBadge.text}
                                        </span>
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                        <button
                                          onClick={() => openAdjustModal(item, v._id)}
                                          style={{
                                            padding: '4px 10px',
                                            backgroundColor: 'var(--card-bg)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            fontWeight: '600',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            color: 'var(--text-primary)'
                                          }}
                                        >
                                          Adjust SKU
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Showing {inventory.length > 0 ? (page - 1) * 15 + 1 : 0} to {Math.min(page * 15, totalRecords)} of {totalRecords} products
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
                fontSize: '13px',
                fontWeight: '600'
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', padding: '0 8px' }}>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
                fontSize: '13px',
                fontWeight: '600'
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {adjustTargetProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setAdjustTargetProduct(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '520px',
              width: '100%',
              border: '1px solid var(--border-color)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>Adjust Stock Level</h3>
              <button onClick={() => setAdjustTargetProduct(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{adjustTargetProduct.product.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Current Product Stock: {adjustTargetProduct.stock} units</div>
            </div>

            {adjustError && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger-text)', fontSize: '13px', marginBottom: '16px' }}>
                {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustSubmit}>
              {adjustTargetProduct.hasVariants && adjustTargetProduct.variants.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Target Variant *</label>
                  <select
                    value={adjustVariantId}
                    onChange={(e) => setAdjustVariantId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    required
                  >
                    {adjustTargetProduct.variants.map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.sku} — Current: {v.stock} units
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Adjustment Type</label>
                  <select
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as 'in' | 'out' | 'adjustment')}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    <option value="in">Restock (+ In)</option>
                    <option value="out">Write-off / Defect (- Out)</option>
                    <option value="adjustment">Direct Count (= Set)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Quantity *</label>
                  <input
                    type="number"
                    min={adjustType === 'adjustment' ? 0 : 1}
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(parseInt(e.target.value, 10) || 0)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Audit Reason *</label>
                <input
                  type="text"
                  placeholder="e.g. Physical inventory count, damaged goods write-off"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Reference / PO (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. PO-84920, AUDIT-2026-Q3"
                  value={adjustReference}
                  onChange={(e) => setAdjustReference(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setAdjustTargetProduct(null)}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  style={{
                    padding: '10px 22px',
                    backgroundColor: 'var(--primary)',
                    color: '#0B132B',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: adjustLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {adjustLoading ? <Loader size={16} className="animate-spin" /> : null}
                  {adjustLoading ? 'Saving...' : 'Apply Stock Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock History Drawer */}
      {historyOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            zIndex: 1050
          }}
          onClick={() => setHistoryOpen(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              width: '100%',
              maxWidth: '650px',
              height: '100vh',
              overflowY: 'auto',
              padding: '30px',
              boxShadow: '-20px 0 60px rgba(0,0,0,0.3)',
              borderLeft: '1px solid var(--border-color)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>Immutable Stock History</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Audit records of all manual adjustments and restocks.</p>
              </div>
              <button onClick={() => setHistoryOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={22} /></button>
            </div>

            {historyLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Loader size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                <p>Loading history records...</p>
              </div>
            ) : historyItems.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <History size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <p>No inventory transactions recorded yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {historyItems.map((tx) => (
                  <div key={tx._id} style={{ backgroundColor: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                        {tx.product?.name || 'Product'}
                      </div>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: tx.type === 'in' ? 'rgba(22, 163, 74, 0.12)' : tx.type === 'out' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                        color: tx.type === 'in' ? 'var(--success-text)' : tx.type === 'out' ? 'var(--danger-text)' : 'var(--primary)'
                      }}>
                        {tx.type.toUpperCase()} ({tx.quantity})
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Stock Change: <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{tx.previousStock} → {tx.newStock}</span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Reason: <span style={{ color: 'var(--text-primary)' }}>{tx.reason}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '6px' }}>
                      <span>By: {tx.performedBy?.fullName || 'Staff'}</span>
                      <span>{new Date(tx.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}

                {historyTotalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <button
                      disabled={historyPage <= 1 || historyLoading}
                      onClick={() => fetchHistory(historyPage - 1)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)', cursor: historyPage <= 1 ? 'not-allowed' : 'pointer' }}
                    >
                      Previous
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Page {historyPage} of {historyTotalPages}</span>
                    <button
                      disabled={historyPage >= historyTotalPages || historyLoading}
                      onClick={() => fetchHistory(historyPage + 1)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)', cursor: historyPage >= historyTotalPages ? 'not-allowed' : 'pointer' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading inventory...</div>}>
      <InventoryContent />
    </Suspense>
  );
}
