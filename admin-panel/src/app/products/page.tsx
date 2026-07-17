'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Package, Search, Plus, Edit, Trash2, Eye, 
  ChevronLeft, ChevronRight, Loader, TrendingUp, 
  AlertCircle, CheckCircle, XCircle, LayoutGrid, 
  List, MoreVertical, Filter, X
} from 'lucide-react';
import { getProducts, deleteProduct } from '@/lib/api';

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  stock: number;
  category?: { name: string; slug: string };
  subcategory?: { name: string; slug: string };
  brand?: { name: string; slug: string };
  images?: string[];
  primaryImage?: string;
  rating?: number;
  numReviews?: number;
  reviewCount?: number;
  isFeatured?: boolean;
  isActive?: boolean;
  variants?: any[];
  attributes?: { name: string; value: string }[];
  createdAt: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list'); // Enterprise default: List

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const params: any = { page, limit: 12, sortBy };
        if (debouncedSearch) params.keyword = debouncedSearch;
        if (categoryFilter) params.category = categoryFilter;

        const data = await getProducts(page, 12, params);
        
        if (data.success) {
          setProducts(data.data);
          setTotalPages(data.pagination?.pages || 1);
          setTotalProducts(data.pagination?.total || 0);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [page, debouncedSearch, categoryFilter, sortBy]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
    
    setDeletingId(id);
    try {
      await deleteProduct(id);
      setProducts(products.filter(p => p._id !== id));
      setTotalProducts(totalProducts - 1);
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    } finally {
      setDeletingId(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setSortBy('newest');
    setPage(1);
  };

  const getStatusBadge = (product: Product) => {
    if (product.stock === 0) {
      return { bg: '#FEE2E2', color: '#DC2626', text: 'Out of Stock', icon: XCircle };
    }
    if (product.stock < 10) {
      return { bg: '#FEF3C7', color: '#92400E', text: 'Low Stock', icon: AlertCircle };
    }
    return { bg: '#D1FAE5', color: '#0F766E', text: 'In Stock', icon: CheckCircle };
  };

  const hasActiveFilters = searchQuery || categoryFilter || sortBy !== 'newest';

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Products
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Manage your product catalog, inventory, and variants.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/products/add')}
          style={{
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '10px',
            fontWeight: '700',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = 'var(--primary)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <Plus size={18} /> Add Product
        </button>
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
          <div style={{
            width: '48px', height: '48px', borderRadius: '10px',
            backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Package size={24} color="#3B82F6" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Products</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{totalProducts}</div>
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
          <div style={{
            width: '48px', height: '48px', borderRadius: '10px',
            backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <TrendingUp size={24} color="#10B981" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Active Products</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
              {products.filter(p => p.isActive !== false).length}
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
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
            placeholder="Search by name, SKU, or brand..."
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
              outline: 'none',
              transition: 'all 0.2s'
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            style={{
              padding: '10px 32px 10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: '500',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center'
            }}
          >
            <option value="">All Categories</option>
            <option value="dry-fruits">Dry Fruits</option>
            <option value="dried-fruits">Dried Fruits</option>
            <option value="seeds">Seeds</option>
            <option value="spices-herbs">Spices & Herbs</option>
            <option value="grocery-essentials">Grocery Essentials</option>
            <option value="organic-foods">Organic Foods</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            style={{
              padding: '10px 32px 10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: '500',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center'
            }}
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Highest Rated</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#DC2626'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--input-bg)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
            >
              <X size={16} /> Clear
            </button>
          )}

          {/* View Toggle */}
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
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '10px 14px',
                border: 'none',
                borderLeft: '1px solid var(--border-color)',
                backgroundColor: viewMode === 'grid' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{
          display: viewMode === 'list' ? 'flex' : 'grid',
          flexDirection: viewMode === 'list' ? 'column' : undefined,
          gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(280px, 1fr))' : undefined,
          gap: '16px'
        }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              height: viewMode === 'list' ? '80px' : '320px',
              animation: 'pulse 1.5s infinite',
              border: '1px solid var(--border-color)'
            }} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '80px 20px',
          textAlign: 'center',
          border: '1px solid var(--border-color)',
          borderStyle: 'dashed'
        }}>
          <div style={{ width: '80px', height: '80px', backgroundColor: 'var(--bg-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Package size={40} color="var(--text-secondary)" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No products found
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
            {debouncedSearch ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'Get started by creating your first product.'}
          </p>
          <button
            onClick={() => router.push('/admin/products/add')}
            style={{
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={18} /> Add Product
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW (TABLE) */
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
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Product</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stock</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
                {products.map((product) => {
                  const status = getStatusBadge(product);
                  const StatusIcon = status.icon;
                  const imageUrl = product.primaryImage || product.images?.[0] || 'https://via.placeholder.com/400x400?text=No+Image';
                  
                  return (
                    <tr 
                      key={product._id} 
                      style={{ 
                        borderBottom: '1px solid var(--border-color)', 
                        transition: 'background-color 0.2s',
                        opacity: deletingId === product._id ? 0.5 : 1
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{
                            width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden',
                            backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', flexShrink: 0
                          }}>
                            <img src={imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px', marginBottom: '4px' }}>
                              {product.name}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {product.variants && product.variants.length > 0 ? `${product.variants.length} variants` : 'Simple product'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-secondary)',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          border: '1px solid var(--border-color)'
                        }}>
                          {product.category?.name || 'Uncategorized'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                          Rs. {product.price.toLocaleString()}
                        </div>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                            Rs. {product.originalPrice.toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
                          {product.stock}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          units
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
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => router.push(`/admin/products/${product._id}`)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                            title="View"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => router.push(`/admin/products/${product._id}/edit`)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#3B82F6'; e.currentTarget.style.borderColor = '#3B82F6'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(product._id, product.name)}
                            disabled={deletingId === product._id}
                            style={{
                              padding: '8px',
                              backgroundColor: deletingId === product._id ? '#FEE2E2' : 'transparent',
                              color: deletingId === product._id ? '#DC2626' : 'var(--text-secondary)',
                              border: `1px solid ${deletingId === product._id ? '#DC2626' : 'var(--border-color)'}`,
                              borderRadius: '6px',
                              cursor: deletingId === product._id ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                              if (deletingId !== product._id) {
                                e.currentTarget.style.backgroundColor = '#FEE2E2';
                                e.currentTarget.style.color = '#DC2626';
                                e.currentTarget.style.borderColor = '#DC2626';
                              }
                            }}
                            onMouseLeave={e => {
                              if (deletingId !== product._id) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                              }
                            }}
                            title="Delete"
                          >
                            {deletingId === product._id ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID VIEW */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}>
          {products.map((product) => {
            const status = getStatusBadge(product);
            const StatusIcon = status.icon;
            const imageUrl = product.primaryImage || product.images?.[0] || 'https://via.placeholder.com/400x400?text=No+Image';
            
            return (
              <div
                key={product._id}
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid var(--border-color)',
                  transition: 'all 0.3s',
                  opacity: deletingId === product._id ? 0.5 : 1,
                  display: 'flex',
                  flexDirection: 'column'
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
                {/* Image */}
                <div style={{ position: 'relative', height: '200px', backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
                  <img
                    src={imageUrl}
                    alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                  
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    backgroundColor: status.bg,
                    color: status.color,
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <StatusIcon size={12} />
                    {status.text}
                  </div>

                  {product.variants && product.variants.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      backgroundColor: 'rgba(17, 24, 39, 0.85)',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: '700',
                      backdropFilter: 'blur(4px)'
                    }}>
                      {product.variants.length} variants
                    </div>
                  )}

                  {product.isFeatured && (
                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      backgroundColor: '#F59E0B',
                      color: 'white',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: '700',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                      ⭐ Featured
                    </div>
                  )}
                </div>

                {/* Content */}
                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {product.category?.name || 'Uncategorized'}
                  </div>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    lineHeight: '1.4'
                  }}>
                    {product.name}
                  </h3>

                  {product.brand && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      Brand: {product.brand.name}
                    </div>
                  )}

                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
                      <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--primary)' }}>
                        Rs. {product.price.toLocaleString()}
                      </span>
                      {product.originalPrice && product.originalPrice > product.price && (
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                          Rs. {product.originalPrice.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => router.push(`/admin/products/${product._id}`)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--primary)';
                          e.currentTarget.style.color = 'white';
                          e.currentTarget.style.borderColor = 'var(--primary)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                          e.currentTarget.style.color = 'var(--primary)';
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                        }}
                      >
                        <Eye size={14} /> View
                      </button>
                      <button
                        onClick={() => router.push(`/admin/products/${product._id}/edit`)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          backgroundColor: '#DBEAFE',
                          color: '#1E40AF',
                          border: '1px solid transparent',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = '#1E40AF';
                          e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = '#DBEAFE';
                          e.currentTarget.style.color = '#1E40AF';
                        }}
                      >
                        <Edit size={14} /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(product._id, product.name)}
                        disabled={deletingId === product._id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#FEE2E2',
                          color: '#DC2626',
                          border: '1px solid transparent',
                          borderRadius: '8px',
                          cursor: deletingId === product._id ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          opacity: deletingId === product._id ? 0.5 : 1
                        }}
                        onMouseEnter={e => {
                          if (deletingId !== product._id) {
                            e.currentTarget.style.backgroundColor = '#DC2626';
                            e.currentTarget.style.color = 'white';
                          }
                        }}
                        onMouseLeave={e => {
                          if (deletingId !== product._id) {
                            e.currentTarget.style.backgroundColor = '#FEE2E2';
                            e.currentTarget.style.color = '#DC2626';
                          }
                        }}
                      >
                        {deletingId === product._id ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && products.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          marginTop: '32px',
          padding: '20px',
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={{
              padding: '10px 16px',
              backgroundColor: page === 1 ? 'var(--bg-primary)' : 'var(--card-bg)',
              color: page === 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { if (page !== 1) { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = 'var(--primary)'; } }}
            onMouseLeave={e => { if (page !== 1) { e.currentTarget.style.backgroundColor = 'var(--card-bg)'; e.currentTarget.style.borderColor = 'var(--border-color)'; } }}
          >
            <ChevronLeft size={16} /> Prev
          </button>

          <span style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            style={{
              padding: '10px 16px',
              backgroundColor: page === totalPages ? 'var(--bg-primary)' : 'var(--card-bg)',
              color: page === totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { if (page !== totalPages) { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = 'var(--primary)'; } }}
            onMouseLeave={e => { if (page !== totalPages) { e.currentTarget.style.backgroundColor = 'var(--card-bg)'; e.currentTarget.style.borderColor = 'var(--border-color)'; } }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}