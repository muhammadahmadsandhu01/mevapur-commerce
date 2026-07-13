'use client';

import { useEffect, useState } from 'react';
import { 
  Building2, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Star,
  Globe,
  AlertCircle,
  CheckCircle,
  Loader,
  X
} from 'lucide-react';
import api from '@/lib/api';

interface Brand {
  _id: string;
  name: string;
  slug: string;
  description: string;
  logo: string;
  website: string;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    logo: '',
    website: '',
    isFeatured: false,
    isActive: true
  });

  useEffect(() => {
    fetchBrands();
    fetchStats();
  }, []);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const response = await api.get('/brands');
      if (response.data.success) {
        setBrands(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching brands:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/brands/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleAddBrand = async () => {
    if (!formData.name.trim()) {
      setError('Brand name is required');
      return;
    }

    try {
      const brandData = {
        ...formData,
        slug: formData.slug || formData.name.toLowerCase().replace(/ /g, '-')
      };

      const response = await api.post('/brands', brandData);
      
      if (response.data.success) {
        setShowAddModal(false);
        resetForm();
        await fetchBrands();
        await fetchStats();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to create brand');
    }
  };

  const handleEditBrand = async () => {
    if (!editingBrand || !formData.name.trim()) {
      setError('Brand name is required');
      return;
    }

    try {
      const brandData = {
        ...formData,
        slug: formData.slug || formData.name.toLowerCase().replace(/ /g, '-')
      };

      const response = await api.put(`/brands/${editingBrand._id}`, brandData);
      
      if (response.data.success) {
        setShowEditModal(false);
        setEditingBrand(null);
        resetForm();
        await fetchBrands();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to update brand');
    }
  };

  const handleDeleteBrand = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;

    try {
      const response = await api.delete(`/brands/${id}`);
      
      if (response.data.success) {
        await fetchBrands();
        await fetchStats();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete brand');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      logo: '',
      website: '',
      isFeatured: false,
      isActive: true
    });
    setError('');
  };

  const openEditModal = (brand: Brand) => {
    setEditingBrand(brand);
    setFormData({
      name: brand.name,
      slug: brand.slug,
      description: brand.description || '',
      logo: brand.logo || '',
      website: brand.website || '',
      isFeatured: brand.isFeatured,
      isActive: brand.isActive
    });
    setShowEditModal(true);
  };

  const filteredBrands = brands.filter(brand => 
    brand.name.toLowerCase().includes(search.toLowerCase()) ||
    brand.slug.toLowerCase().includes(search.toLowerCase())
  );

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
              Brands Management
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Manage product brands and manufacturers
            </p>
          </div>
          
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            style={{
              backgroundColor: 'var(--primary)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px'
            }}
          >
            <Plus size={20} />
            Add Brand
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
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
                <Building2 size={24} color="#3B82F6" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Total Brands
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.totalBrands || 0}
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
                  Active Brands
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.activeBrands || 0}
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
                backgroundColor: '#FEF3C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Star size={24} color="#F59E0B" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Featured Brands
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.featuredBrands || 0}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px'
      }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary)'
          }} />
          <input
            type="text"
            placeholder="Search brands..."
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
      </div>

      {/* Brands Grid */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading brands...</p>
        </div>
      ) : filteredBrands.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Building2 size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            No brands found
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Create your first brand to get started
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '24px'
        }}>
          {filteredBrands.map((brand) => (
            <div
              key={brand._id}
              style={{
                backgroundColor: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                padding: '24px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: '800'
                }}>
                  {brand.logo ? (
                    <img src={brand.logo} alt={brand.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                  ) : (
                    brand.name.charAt(0).toUpperCase()
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => openEditModal(brand)}
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
                      fontWeight: '600',
                      fontSize: '13px'
                    }}
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteBrand(brand._id)}
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
                  </button>
                </div>
              </div>

              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
                {brand.name}
              </h3>
              
              {brand.description && (
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                  {brand.description}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {brand.website && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <Globe size={14} />
                    <a href={brand.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                      {brand.website}
                    </a>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {brand.isFeatured && (
                  <span style={{
                    padding: '6px 12px',
                    backgroundColor: '#FEF3C7',
                    color: '#92400E',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Star size={14} />
                    Featured
                  </span>
                )}
                <span style={{
                  padding: '6px 12px',
                  backgroundColor: brand.isActive ? '#D1FAE5' : '#FEE2E2',
                  color: brand.isActive ? '#0F766E' : '#DC2626',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {brand.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingBrand(null);
          resetForm();
        }}>
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflow: 'auto',
              border: '1px solid var(--border-color)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {showAddModal ? 'Add Brand' : 'Edit Brand'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                  setEditingBrand(null);
                  resetForm();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '8px'
                }}
              >
                <X size={24} />
              </button>
            </div>

            {error && (
              <div style={{
                padding: '12px',
                backgroundColor: '#FEE2E2',
                border: '1px solid #EF4444',
                borderRadius: '8px',
                marginBottom: '20px',
                color: '#DC2626',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Brand Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter brand name"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="brand-slug"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter brand description"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Logo URL
                </label>
                <input
                  type="url"
                  value={formData.logo}
                  onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                  placeholder="https://example.com/logo.jpg"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Website URL
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://example.com"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Featured
                  </label>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input
                      type="checkbox"
                      checked={formData.isFeatured}
                      onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: formData.isFeatured ? 'var(--primary)' : '#ccc',
                      transition: '.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '""',
                        height: '20px',
                        width: '20px',
                        left: '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: '.4s',
                        borderRadius: '50%',
                        transform: formData.isFeatured ? 'translateX(24px)' : 'translateX(0)'
                      }} />
                    </span>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Active
                  </label>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: formData.isActive ? 'var(--primary)' : '#ccc',
                      transition: '.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '""',
                        height: '20px',
                        width: '20px',
                        left: '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: '.4s',
                        borderRadius: '50%',
                        transform: formData.isActive ? 'translateX(24px)' : 'translateX(0)'
                      }} />
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setEditingBrand(null);
                    resetForm();
                  }}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '15px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={showAddModal ? handleAddBrand : handleEditBrand}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '15px'
                  }}
                >
                  {showAddModal ? 'Add Brand' : 'Update Brand'}
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