'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { Plus, Edit, Trash2, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

interface Product {
  _id: string;
  name: string;
  price: string;
  stock: number;
  category: string;
  images: string[];
  isActive: boolean;
}

export default function AdminProducts() {
  const { token } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, [token]);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/products`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      if (response.data.success) {
        setProducts(response.data.data);
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
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/products/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      setProducts(products.filter(p => p._id !== id));
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  if (loading) {
    return <div>Loading products...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827' }}>
          Products Management
        </h1>
        <Link
          href="/admin/products/add"
          style={{
            backgroundColor: '#0F766E',
            color: 'white',
            padding: '14px 24px',
            borderRadius: '12px',
            fontWeight: '700',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.3s'
          }}
        >
          <Plus size={20} /> Add Product
        </Link>
      </div>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: '#6B7280', fontWeight: '600' }}>Product</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#6B7280', fontWeight: '600' }}>Price</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#6B7280', fontWeight: '600' }}>Stock</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#6B7280', fontWeight: '600' }}>Category</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#6B7280', fontWeight: '600' }}>Images</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#6B7280', fontWeight: '600' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#6B7280', fontWeight: '600' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '16px 12px', fontWeight: '600', color: '#111827' }}>
                    {product.name}
                  </td>
                  <td style={{ padding: '16px 12px', fontWeight: '600', color: '#0F766E' }}>
                    Rs. {parseFloat(product.price).toLocaleString()}
                  </td>
                  <td style={{ padding: '16px 12px', color: '#111827' }}>
                    {product.stock}
                  </td>
                  <td style={{ padding: '16px 12px', color: '#6B7280' }}>
                    {product.category}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {product.images?.slice(0, 3).map((img, idx) => (
                        <div key={idx} style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          backgroundColor: '#F3F4F6'
                        }}>
                          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                      {product.images?.length > 3 && (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          backgroundColor: '#E5E7EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#6B7280'
                        }}>
                          +{product.images.length - 3}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '16px 12px' }}>
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
                  <td style={{ padding: '16px 12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link
                        href={`/admin/products/edit/${product._id}`}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#F59E0B',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          textDecoration: 'none',
                          fontWeight: '600',
                          fontSize: '13px'
                        }}
                      >
                        <Edit size={16} /> Edit
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
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}