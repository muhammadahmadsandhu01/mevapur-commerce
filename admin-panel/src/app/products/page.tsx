'use client';

import { useEffect, useState } from 'react';
import { 
  Package, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Download,
  Eye,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  category: string;
  brand?: string;
  sku: string;
  stock: number;
  images: string[];
  isActive: boolean;
  soldCount?: number;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  useEffect(() => {
    fetchProducts();
  }, [currentPage, search, category]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: 10
      };
      
      if (search) params.search = search;
      if (category) params.category = category;

      const response = await api.get('/products', { params });
      
      if (response.data.success) {
        setProducts(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      await api.delete(`/products/${id}`);
      setProducts(products.filter(p => p._id !== id));
      alert('Product deleted successfully!');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete product');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.length === 0) {
      alert('Please select products to delete');
      return;
    }

    if (!confirm(`Delete ${selectedProducts.length} products?`)) return;

    try {
      await api.post('/products/bulk-delete', { productIds: selectedProducts });
      setProducts(products.filter(p => !selectedProducts.includes(p._id)));
      setSelectedProducts([]);
      alert('Products deleted successfully!');
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Failed to delete products');
    }
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(p => p._id));
    }
  };

  const toggleSelectProduct = (id: string) => {
    if (selectedProducts.includes(id)) {
      setSelectedProducts(selectedProducts.filter(pid => pid !== id));
    } else {
      setSelectedProducts([...selectedProducts, id]);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ 
              fontSize: '32px', 
              fontWeight: '800', 
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Products Management
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Manage your product inventory, prices, and details
            </p>
          </div>
          
          <Link
            href="/products/add"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '10px',
              textDecoration: 'none',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
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
            <Plus size={20} />
            Add Product
          </Link>
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
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Package size={24} color="#3B82F6" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Total Products
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {pagination?.total || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle size={24} color="#10B981" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Active Products
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {products.filter(p => p.isActive).length}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertCircle size={24} color="#EF4444" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Low Stock
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {products.filter(p => p.stock < 50 && p.stock > 0).length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Actions */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ 
            flex: 1, 
            minWidth: '300px',
            position: 'relative' 
          }}>
            <Search 
              size={18} 
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)'
              }}
            />
            <input
              type="text"
              placeholder="Search products by name, SKU, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 48px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Category Filter */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '14px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Categories</option>
            <option value="Fruits">Fruits</option>
            <option value="Dry Fruits">Dry Fruits</option>
            <option value="Groceries">Groceries</option>
            <option value="Spices">Spices</option>
            <option value="Others">Others</option>
          </select>

          {/* Bulk Actions */}
          {selectedProducts.length > 0 && (
            <button
              onClick={handleBulkDelete}
              style={{
                padding: '12px 20px',
                backgroundColor: '#EF4444',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Trash2 size={18} />
              Delete ({selectedProducts.length})
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid var(--border-color)',
              borderTop: '4px solid var(--primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Package size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No products found</p>
            <p>Create your first product to get started</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left' }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === products.length}
                        onChange={toggleSelectAll}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Product
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      SKU
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Category
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Price
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Stock
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Status
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr 
                      key={product._id} 
                      style={{ 
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '16px' }}>
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product._id)}
                          onChange={() => toggleSelectProduct(product._id)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {product.images && product.images.length > 0 ? (
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              style={{
                                width: '48px',
                                height: '48px',
                                objectFit: 'cover',
                                borderRadius: '8px'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '8px',
                              backgroundColor: 'var(--bg-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <Package size={24} color="var(--text-secondary)" />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                              {product.name}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                              {product.brand || 'No brand'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {product.sku}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                        {product.category}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            Rs. {product.price.toLocaleString()}
                          </div>
                          {product.originalPrice && product.originalPrice > product.price && (
                            <div style={{ fontSize: '13px', color: '#10B981' }}>
                              Rs. {product.originalPrice.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: product.stock === 0 ? '#FEE2E2' : 
                                         product.stock < 50 ? '#FEF3C7' : '#D1FAE5',
                          color: product.stock === 0 ? '#DC2626' : 
                                 product.stock < 50 ? '#92400E' : '#0F766E',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}>
                          {product.stock} units
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: product.isActive ? '#D1FAE5' : '#FEE2E2',
                          color: product.isActive ? '#0F766E' : '#DC2626',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}>
                          {product.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Link
                            href={`/products/${product._id}/edit`}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#F59E0B',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: '600',
                              fontSize: '13px'
                            }}
                          >
                            <Edit size={16} />
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(product._id)}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#EF4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: '600',
                              fontSize: '13px'
                            }}
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div style={{
                padding: '20px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px'
              }}>
                <button
                  onClick={() => setCurrentPage(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: pagination.hasPrev ? 'var(--primary)' : '#9CA3AF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: pagination.hasPrev ? 'pointer' : 'not-allowed',
                    fontWeight: '600'
                  }}
                >
                  Previous
                </button>
                
                <div style={{ display: 'flex', gap: '4px' }}>
                  {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: page === pagination.page ? 'var(--primary)' : 'var(--card-bg)',
                        color: page === pagination.page ? 'white' : 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: page === pagination.page ? '700' : '500'
                      }}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setCurrentPage(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: pagination.hasNext ? 'var(--primary)' : '#9CA3AF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: pagination.hasNext ? 'pointer' : 'not-allowed',
                    fontWeight: '600'
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}