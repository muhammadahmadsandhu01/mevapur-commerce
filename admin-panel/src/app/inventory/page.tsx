'use client';

import { useState, useEffect, useCallback, Suspense, Fragment } from 'react';
import {
  Package, AlertTriangle, CheckCircle,
  Search, Download, ChevronDown, ChevronRight,
  X, Box, History, Loader, AlertCircle, Layers
} from 'lucide-react';
import api from '@/lib/api';
import { PRODUCT_PLACEHOLDER } from '@/lib/placeholder';
import { resolveImageUrl } from '@/lib/imageUtils';
import { useAuthStore } from '@/store/authStore';

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
  const { user } = useAuthStore();
  const userRole = user?.role || '';
  const canAdjust = ['inventory', 'manager', 'admin', 'super_admin'].includes(userRole);
  const canExport = ['inventory', 'manager', 'admin', 'super_admin'].includes(userRole);

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
  const [adjustOperationKey, setAdjustOperationKey] = useState<string>('');
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
    setAdjustOperationKey(crypto.randomUUID());
  };

  const closeAdjustModal = () => {
    setAdjustTargetProduct(null);
    setAdjustOperationKey('');
    setAdjustError(null);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTargetProduct || adjustLoading) return;

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
      const keyToSend = adjustOperationKey || crypto.randomUUID();
      if (!adjustOperationKey) {
        setAdjustOperationKey(keyToSend);
      }

      const payload: Record<string, unknown> = {
        productId: adjustTargetProduct.product._id,
        type: adjustType,
        quantity: Number(adjustQuantity),
        reason: adjustReason.trim(),
        reference: adjustReference.trim() || undefined,
        operationKey: keyToSend
      };

      if (adjustTargetProduct.hasVariants && adjustVariantId) {
        payload.variantId = adjustVariantId;
      }

      const response = await api.post('/inventory/adjust', payload);
      if (response.data.success) {
        closeAdjustModal();
        await fetchInventory();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to adjust stock';
      setAdjustError(msg);
      // adjustOperationKey is retained across retries
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
      return {
        bg: 'rgba(239, 68, 68, 0.12)',
        color: 'var(--danger-text)',
        badgeClass: 'bg-red-50 text-red-700 border border-red-200',
        text: 'Out of Stock',
        icon: X
      };
    }
    if (stock <= threshold) {
      return {
        bg: 'rgba(245, 158, 11, 0.12)',
        color: 'var(--warning-text)',
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
        text: 'Low Stock',
        icon: AlertTriangle
      };
    }
    return {
      bg: 'rgba(22, 163, 74, 0.12)',
      color: 'var(--success-text)',
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      text: 'In Stock',
      icon: CheckCircle
    };
  };

  const resolveProductImage = (item: Record<string, unknown> | InventoryItem | null | undefined): string | null => {
    if (!item) return null;
    const itemRecord = item as Record<string, unknown>;
    const target = (itemRecord.product && typeof itemRecord.product === 'object'
      ? itemRecord.product
      : itemRecord) as Record<string, unknown>;
    const raw =
      (typeof target.thumbnail === 'string' ? target.thumbnail : null) ||
      (Array.isArray(target.images) && target.images.length > 0
        ? (typeof target.images[0] === 'object' && target.images[0] !== null
          ? ((target.images[0] as Record<string, unknown>).url as string)
          : (target.images[0] as string))
        : null) ||
      (typeof target.image === 'string' ? target.image : null) ||
      (typeof itemRecord.thumbnail === 'string' ? itemRecord.thumbnail : null) ||
      (Array.isArray(itemRecord.images) && itemRecord.images.length > 0
        ? (typeof itemRecord.images[0] === 'object' && itemRecord.images[0] !== null
          ? ((itemRecord.images[0] as Record<string, unknown>).url as string)
          : (itemRecord.images[0] as string))
        : null) ||
      (typeof itemRecord.image === 'string' ? itemRecord.image : null);

    if (!raw || typeof raw !== 'string') return null;

    if (raw.includes('mock.mevapur.test')) {
      const mapped = resolveImageUrl(raw);
      if (mapped && mapped !== PRODUCT_PLACEHOLDER) {
        return mapped;
      }
    }

    if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
      return raw.startsWith('/') ? raw : `/${raw}`;
    }

    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:55069';
    return `${baseUrl.replace(/\/$/, '')}/${raw.replace(/^\//, '')}`;
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
          {canExport && (
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
          )}
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
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left border-collapse min-w-[900px]">
              <colgroup>
                <col className="w-14" style={{ width: '56px' }} />
                <col className="min-w-[280px] lg:w-[360px]" style={{ minWidth: '280px' }} />
                <col className="w-44" style={{ width: '176px' }} />
                <col className="w-32" style={{ width: '128px' }} />
                <col className="w-28" style={{ width: '112px' }} />
                <col className="w-32" style={{ width: '128px' }} />
                <col className="w-32" style={{ width: '128px' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th scope="col" className="w-14 py-3.5 px-3 text-center whitespace-nowrap">
                    EXPAND
                  </th>
                  <th scope="col" className="min-w-[280px] lg:w-[360px] py-3.5 px-4 text-left whitespace-nowrap">
                    PRODUCT & ROOT SKU
                  </th>
                  <th scope="col" className="w-44 py-3.5 px-4 text-left whitespace-nowrap">
                    CATEGORY
                  </th>
                  <th scope="col" className="w-32 py-3.5 px-4 text-left whitespace-nowrap">
                    CURRENT STOCK
                  </th>
                  <th scope="col" className="w-28 py-3.5 px-4 text-left whitespace-nowrap">
                    THRESHOLD
                  </th>
                  <th scope="col" className="w-32 py-3.5 px-4 text-left whitespace-nowrap">
                    STOCK STATUS
                  </th>
                  <th scope="col" className="w-32 py-3.5 px-4 text-right whitespace-nowrap">
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {inventory.map((item) => {
                  const isExpanded = expandedProducts.has(item._id);
                  const imageUrl = resolveProductImage(item);
                  const hasVariants = Boolean(item.hasVariants && item.variants && item.variants.length > 0);

                  return (
                    <Fragment key={item._id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition">
                        {/* Column 1: EXPAND */}
                        <td className="w-14 py-3.5 px-3 text-center align-middle">
                          {hasVariants ? (
                            <button
                              onClick={() => toggleExpand(item._id)}
                              aria-label={isExpanded ? `Collapse variants for ${item.product.name}` : `Expand variants for ${item.product.name}`}
                              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center justify-center transition cursor-pointer"
                            >
                              {isExpanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs font-mono select-none">—</span>
                          )}
                        </td>

                        {/* Column 2: PRODUCT & ROOT SKU */}
                        <td className="min-w-[280px] lg:w-[360px] py-3.5 px-4 align-middle overflow-hidden">
                          <div className="flex items-center gap-3">
                            {/* 48x48 locked thumbnail */}
                            <div
                              className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center relative"
                              style={{ width: '48px', height: '48px', minWidth: '48px', maxWidth: '48px', minHeight: '48px', maxHeight: '48px' }}
                            >
                              {imageUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={imageUrl}
                                  alt={item.product?.name || item.product?.sku || 'Product image'}
                                  className="w-12 h-12 object-cover block"
                                  style={{ width: '48px', height: '48px', minWidth: '48px', maxWidth: '48px', minHeight: '48px', maxHeight: '48px', objectFit: 'cover' }}
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className="placeholder-fallback items-center justify-center w-full h-full"
                                style={{ display: imageUrl ? 'none' : 'flex' }}
                              >
                                <Package className="text-slate-400 w-5 h-5" />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1 truncate">
                              <p className="font-bold text-slate-900 text-xs truncate" title={item.product?.name}>
                                {item.product?.name}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                                SKU: {item.product?.sku || 'N/A'}{hasVariants ? ` (${item.variants.length} variants)` : ''}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Column 3: CATEGORY */}
                        <td className="w-44 py-3.5 px-4 align-middle truncate font-medium text-slate-600">
                          {item.product?.category?.name || '—'}
                        </td>

                        {/* Column 4: CURRENT STOCK */}
                        <td className="w-32 py-3.5 px-4 align-middle font-bold text-slate-900 whitespace-nowrap">
                          {item.stock} units
                        </td>

                        {/* Column 5: THRESHOLD */}
                        <td className="w-28 py-3.5 px-4 align-middle text-slate-500 whitespace-nowrap">
                          {item.lowStockThreshold ?? 2} units
                        </td>

                        {/* Column 6: STOCK STATUS */}
                        <td className="w-32 py-3.5 px-4 align-middle whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              item.stock === 0
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : item.stock <= (item.lowStockThreshold ?? 2)
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {item.stock === 0 ? 'Out of Stock' : item.stock <= (item.lowStockThreshold ?? 2) ? 'Low Stock' : 'In Stock'}
                          </span>
                        </td>

                        {/* Column 7: ACTIONS */}
                        <td className="w-32 py-3.5 px-4 text-right align-middle whitespace-nowrap">
                          {canAdjust && (
                            <button
                              onClick={() => openAdjustModal(item)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 shadow-xs transition cursor-pointer whitespace-nowrap"
                            >
                              Adjust Stock
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Variant Sub-Rows */}
                      {isExpanded && item.hasVariants && (
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                          <td colSpan={7} className="py-4 px-6 pl-14">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                              Individual Variant Sellable SKUs
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-left font-bold uppercase tracking-wider">
                                    <th scope="col" className="py-2.5 px-3">Variant SKU</th>
                                    <th scope="col" className="py-2.5 px-3">Attributes</th>
                                    <th scope="col" className="py-2.5 px-3">Stock</th>
                                    <th scope="col" className="py-2.5 px-3">Status</th>
                                    <th scope="col" className="py-2.5 px-3 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.variants.map((v) => {
                                    const vBadge = getStatusBadge(v.stock, item.lowStockThreshold);
                                    return (
                                      <tr key={v._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                        <td className="py-2.5 px-3 font-semibold text-slate-800 font-mono">{v.sku}</td>
                                        <td className="py-2.5 px-3 text-slate-600">
                                          {v.attributes && v.attributes.length > 0
                                            ? v.attributes.map((a) => `${a.name}: ${a.value}`).join(' | ')
                                            : 'Default'}
                                        </td>
                                        <td className="py-2.5 px-3 font-bold text-slate-900">{v.stock} units</td>
                                        <td className="py-2.5 px-3">
                                          <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${vBadge.badgeClass}`}
                                          >
                                            {vBadge.text}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                          {canAdjust && (
                                            <button
                                              onClick={() => openAdjustModal(item, v._id)}
                                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs transition-colors cursor-pointer border border-slate-200"
                                            >
                                              Adjust SKU
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
          onClick={closeAdjustModal}
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
              <button onClick={closeAdjustModal} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
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
                  onClick={closeAdjustModal}
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
