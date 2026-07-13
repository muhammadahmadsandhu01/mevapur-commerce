'use client';

import { useEffect, useState } from 'react';
import { 
  FolderTree, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Folder,
  FolderOpen,
  AlertCircle,
  CheckCircle,
  Loader,
  X
} from 'lucide-react';
import api from '@/lib/api';

interface Category {
  _id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  parent: string | null;
  subcategories: string[];
  isActive: boolean;
  productCount?: number;
  createdAt: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image: '',
    parent: '',
    isActive: true
  });

  useEffect(() => {
    fetchCategories();
    fetchStats();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await api.get('/categories');
      if (response.data.success) {
        setCategories(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/categories/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleAddCategory = async () => {
    if (!formData.name.trim()) {
      setError('Category name is required');
      return;
    }

    try {
      const categoryData = {
        ...formData,
        parent: formData.parent || null,
        slug: formData.slug || formData.name.toLowerCase().replace(/ /g, '-')
      };

      const response = await api.post('/categories', categoryData);
      
      if (response.data.success) {
        setShowAddModal(false);
        resetForm();
        await fetchCategories();
        await fetchStats();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to create category');
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !formData.name.trim()) {
      setError('Category name is required');
      return;
    }

    try {
      const categoryData = {
        ...formData,
        parent: formData.parent || null,
        slug: formData.slug || formData.name.toLowerCase().replace(/ /g, '-')
      };

      const response = await api.put(`/categories/${editingCategory._id}`, categoryData);
      
      if (response.data.success) {
        setShowEditModal(false);
        setEditingCategory(null);
        resetForm();
        await fetchCategories();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      const response = await api.delete(`/categories/${id}`);
      
      if (response.data.success) {
        await fetchCategories();
        await fetchStats();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete category');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      image: '',
      parent: '',
      isActive: true
    });
    setError('');
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      image: category.image || '',
      parent: category.parent || '',
      isActive: category.isActive
    });
    setShowEditModal(true);
  };

  const getParentCategories = () => {
    return categories.filter(c => !c.parent && c._id !== editingCategory?._id);
  };

  const getParentCategoryName = (parentId: string) => {
    const parent = categories.find(c => c._id === parentId);
    return parent?.name || 'N/A';
  };

  const getSubcategoriesCount = (categoryId: string) => {
    return categories.filter(c => c.parent === categoryId).length;
  };

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(search.toLowerCase()) ||
    cat.slug.toLowerCase().includes(search.toLowerCase())
  );

  const parentCategories = filteredCategories.filter(c => !c.parent);
  const subcategoriesList = filteredCategories.filter(c => c.parent);

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
              Categories Management
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Organize your products with categories and subcategories
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
            Add Category
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
                <FolderTree size={24} color="#3B82F6" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Total Categories
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.totalCategories || 0}
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
                <FolderOpen size={24} color="#10B981" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Parent Categories
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.parentCategories || 0}
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
                <Folder size={24} color="#F59E0B" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Subcategories
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.subcategories || 0}
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
            placeholder="Search categories..."
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

      {/* Categories List */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading categories...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '24px' }}>
          
          {/* Parent Categories */}
          {parentCategories.map((category) => (
            <div
              key={category._id}
              style={{
                backgroundColor: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden'
              }}
            >
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: category.isActive ? 'var(--bg-primary)' : '#FEE2E2'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white'
                    }}>
                      <FolderOpen size={28} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {category.name}
                        </h3>
                        <span style={{
                          padding: '4px 12px',
                          backgroundColor: category.isActive ? '#D1FAE5' : '#FEE2E2',
                          color: category.isActive ? '#0F766E' : '#DC2626',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {category.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Slug: <code style={{ backgroundColor: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{category.slug}</code>
                        {category.description && (
                          <span style={{ marginLeft: '16px' }}>• {category.description}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => openEditModal(category)}
                      style={{
                        padding: '8px 16px',
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
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category._id)}
                      style={{
                        padding: '8px 16px',
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
                </div>
              </div>

              {/* Subcategories */}
              {getSubcategoriesCount(category._id) > 0 && (
                <div style={{ padding: '16px 24px', backgroundColor: 'var(--bg-primary)' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Subcategories ({getSubcategoriesCount(category._id)})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {subcategoriesList
                      .filter(sub => sub.parent === category._id)
                      .map((sub) => (
                        <div
                          key={sub._id}
                          style={{
                            padding: '10px 16px',
                            backgroundColor: 'white',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                            minWidth: '200px',
                            flex: '1'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Folder size={18} color="var(--text-secondary)" />
                            <div>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
                                {sub.name}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {sub.slug}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => openEditModal(sub)}
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#F59E0B',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(sub._id)}
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#EF4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {filteredCategories.length === 0 && (
            <div style={{
              backgroundColor: 'var(--card-bg)',
              padding: '60px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <FolderTree size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
              <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                No categories found
              </p>
              <p style={{ color: 'var(--text-secondary)' }}>
                Create your first category to get started
              </p>
            </div>
          )}
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
          setEditingCategory(null);
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
                {showAddModal ? 'Add Category' : 'Edit Category'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                  setEditingCategory(null);
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
                  Category Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter category name"
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
                  placeholder="category-slug"
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
                  Parent Category
                </label>
                <select
                  value={formData.parent}
                  onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >
                  <option value="">No parent (Top level)</option>
                  {getParentCategories().map(cat => (
                    <option key={cat._id} value={cat._id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter category description"
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
                  Image URL
                </label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="https://example.com/image.jpg"
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

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setEditingCategory(null);
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
                  onClick={showAddModal ? handleAddCategory : handleEditCategory}
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
                  {showAddModal ? 'Add Category' : 'Update Category'}
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