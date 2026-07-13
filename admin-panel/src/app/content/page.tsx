'use client';

import { useEffect, useState } from 'react';
import { 
  Layout,
  Image, 
  Sliders, 
  FileText, 
  BookOpen,
  Plus, 
  Edit, 
  Trash2, 
  Search,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  Loader,
  X
} from 'lucide-react';
import api from '@/lib/api';

interface ContentItem {
  _id: string;
  type: 'banner' | 'slider' | 'page' | 'blog';
  title: string;
  slug: string;
  subtitle?: string;
  description?: string;
  content?: string;
  image?: string;
  position: number;
  isActive: boolean;
  isFeatured: boolean;
  category?: string;
  createdAt: string;
}

interface ContentPageProps {
  defaultType?: 'banner' | 'slider' | 'page' | 'blog';
}

export default function ContentPage({ defaultType }: ContentPageProps) {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'banner' | 'slider' | 'page' | 'blog'>(
    defaultType || 'all'
  );
  
  const [formData, setFormData] = useState({
    type: 'banner' as 'banner' | 'slider' | 'page' | 'blog',
    title: '',
    slug: '',
    subtitle: '',
    description: '',
    content: '',
    image: '',
    buttonText: '',
    buttonLink: '',
    position: '0',
    isActive: true,
    isFeatured: false,
    category: '',
    metaTitle: '',
    metaDescription: '',
    keywords: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchContents();
    fetchStats();
  }, [activeTab, statusFilter]);

  const fetchContents = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (activeTab !== 'all') params.type = activeTab;
      if (statusFilter !== '') params.isActive = statusFilter;
      if (search) params.search = search;

      const response = await api.get('/content', { params });
      if (response.data.success) {
        setContents(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/content/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSubmit = async () => {
    setError('');
    
    if (!formData.title || !formData.type) {
      setError('Title and type are required');
      return;
    }

    setSaving(true);
    try {
      const contentData = {
        type: formData.type,
        title: formData.title,
        slug: formData.slug || formData.title.toLowerCase().replace(/ /g, '-'),
        subtitle: formData.subtitle,
        description: formData.description,
        content: formData.content,
        image: formData.image,
        button: formData.buttonText ? {
          text: formData.buttonText,
          link: formData.buttonLink
        } : undefined,
        position: parseInt(formData.position) || 0,
        isActive: formData.isActive,
        isFeatured: formData.isFeatured,
        category: formData.category,
        seo: {
          metaTitle: formData.metaTitle,
          metaDescription: formData.metaDescription,
          keywords: formData.keywords
        },
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined
      };

      if (editingContent) {
        const response = await api.put(`/content/${editingContent._id}`, contentData);
        if (response.data.success) {
          setShowModal(false);
          setEditingContent(null);
          resetForm();
          await fetchContents();
        }
      } else {
        const response = await api.post('/content', contentData);
        if (response.data.success) {
          setShowModal(false);
          resetForm();
          await fetchContents();
          await fetchStats();
        }
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this content?')) return;

    try {
      const response = await api.delete(`/content/${id}`);
      if (response.data.success) {
        await fetchContents();
        await fetchStats();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete content');
    }
  };

  const handleToggleStatus = async (content: ContentItem) => {
    try {
      const response = await api.put(`/content/${content._id}`, {
        isActive: !content.isActive
      });
      if (response.data.success) {
        await fetchContents();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const openEditModal = (content: ContentItem) => {
    setEditingContent(content);
    setFormData({
      type: content.type,
      title: content.title,
      slug: content.slug,
      subtitle: content.subtitle || '',
      description: content.description || '',
      content: content.content || '',
      image: content.image || '',
      buttonText: '',
      buttonLink: '',
      position: content.position.toString(),
      isActive: content.isActive,
      isFeatured: content.isFeatured,
      category: content.category || '',
      metaTitle: '',
      metaDescription: '',
      keywords: '',
      startDate: '',
      endDate: ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      type: activeTab !== 'all' ? activeTab : 'banner',
      title: '',
      slug: '',
      subtitle: '',
      description: '',
      content: '',
      image: '',
      buttonText: '',
      buttonLink: '',
      position: '0',
      isActive: true,
      isFeatured: false,
      category: '',
      metaTitle: '',
      metaDescription: '',
      keywords: '',
      startDate: '',
      endDate: ''
    });
    setError('');
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'banner': return { label: 'Banner', color: '#3B82F6', bg: '#DBEAFE', icon: Image };
      case 'slider': return { label: 'Slider', color: '#8B5CF6', bg: '#EDE9FE', icon: Sliders };
      case 'page': return { label: 'Page', color: '#10B981', bg: '#D1FAE5', icon: FileText };
      case 'blog': return { label: 'Blog', color: '#F59E0B', bg: '#FEF3C7', icon: BookOpen };
      default: return { label: type, color: '#6B7280', bg: '#F3F4F6', icon: Layout };
    }
  };

  const filteredContents = contents.filter(content => {
    const matchesSearch = content.title.toLowerCase().includes(search.toLowerCase()) ||
                         content.slug.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

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

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Content Management
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Manage banners, sliders, pages, and blog posts
            </p>
          </div>
          
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
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
            Add Content
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Total', value: stats.totalContent, color: '#3B82F6', bg: '#DBEAFE', icon: Layout },
              { label: 'Banners', value: stats.banners, color: '#3B82F6', bg: '#DBEAFE', icon: Image },
              { label: 'Sliders', value: stats.sliders, color: '#8B5CF6', bg: '#EDE9FE', icon: Sliders },
              { label: 'Pages', value: stats.pages, color: '#10B981', bg: '#D1FAE5', icon: FileText },
              { label: 'Blogs', value: stats.blogs, color: '#F59E0B', bg: '#FEF3C7', icon: BookOpen }
            ].map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} style={{
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
                    backgroundColor: stat.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon size={24} color={stat.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {stat.value}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Type Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All Content', icon: Layout },
          { id: 'banner', label: 'Banners', icon: Image },
          { id: 'slider', label: 'Sliders', icon: Sliders },
          { id: 'page', label: 'Pages', icon: FileText },
          { id: 'blog', label: 'Blogs', icon: BookOpen }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '10px 20px',
                backgroundColor: isActive ? 'var(--primary)' : 'var(--card-bg)',
                color: isActive ? 'white' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: isActive ? '700' : '500',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={18} style={{
              position: 'absolute', left: '16px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-secondary)'
            }} />
            <input
              type="text"
              placeholder="Search content..."
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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading content...</p>
        </div>
      ) : filteredContents.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Layout size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            No content found
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '20px'
        }}>
          {filteredContents.map((content) => {
            const typeConfig = getTypeConfig(content.type);
            const TypeIcon = typeConfig.icon;
            return (
              <div
                key={content._id}
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden'
                }}
              >
                {content.image && (
                  <div style={{ height: '180px', backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
                    <img src={content.image} alt={content.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}

                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: typeConfig.bg,
                      color: typeConfig.color,
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <TypeIcon size={12} />
                      {typeConfig.label}
                    </span>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: content.isActive ? '#D1FAE5' : '#FEE2E2',
                      color: content.isActive ? '#0F766E' : '#DC2626',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {content.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {content.title}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: '12px' }}>
                    /{content.slug}
                  </p>

                  {content.description && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                      {content.description}
                    </p>
                  )}

                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)',
                    marginBottom: '16px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}>
                    <span>Position: {content.position}</span>
                    <span>{new Date(content.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => openEditModal(content)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        backgroundColor: '#F59E0B',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontWeight: '600',
                        fontSize: '13px'
                      }}
                    >
                      <Edit size={14} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleStatus(content)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: content.isActive ? '#6B7280' : '#10B981',
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
                      {content.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => handleDelete(content._id)}
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
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal - (Same as before, code is long so I'm keeping it same) */}
      {showModal && (
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
          setShowModal(false);
          setEditingContent(null);
          resetForm();
        }}>
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '90vh',
              overflow: 'auto',
              border: '1px solid var(--border-color)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {editingContent ? 'Edit Content' : 'Add New Content'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingContent(null); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px' }}>
                <X size={24} />
              </button>
            </div>

            {error && (
              <div style={{ padding: '12px', backgroundColor: '#FEE2E2', border: '1px solid #EF4444', borderRadius: '8px', marginBottom: '20px', color: '#DC2626', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    style={inputStyle}
                  >
                    <option value="banner">Banner</option>
                    <option value="slider">Slider</option>
                    <option value="page">Page</option>
                    <option value="blog">Blog Post</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Title *</label>
                  <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Enter title" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Slug (URL)</label>
                <input type="text" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder="auto-generated-from-title" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Subtitle</label>
                  <input type="text" value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} placeholder="Optional subtitle" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Category</label>
                  <input type="text" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="e.g., Electronics" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Short Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief description..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {(formData.type === 'page' || formData.type === 'blog') && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Full Content</label>
                  <textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} placeholder="Full content..." rows={8} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }} />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Image URL</label>
                <input type="url" value={formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} placeholder="https://example.com/image.jpg" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Position</label>
                  <input type="number" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} placeholder="0" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', paddingBottom: '12px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Active</label>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: formData.isActive ? 'var(--primary)' : '#ccc', transition: '.4s', borderRadius: '34px' }}>
                      <span style={{ position: 'absolute', content: '""', height: '20px', width: '20px', left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%', transform: formData.isActive ? 'translateX(24px)' : 'translateX(0)' }} />
                    </span>
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', paddingBottom: '12px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Featured</label>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input type="checkbox" checked={formData.isFeatured} onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: formData.isFeatured ? 'var(--primary)' : '#ccc', transition: '.4s', borderRadius: '34px' }}>
                      <span style={{ position: 'absolute', content: '""', height: '20px', width: '20px', left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%', transform: formData.isFeatured ? 'translateX(24px)' : 'translateX(0)' }} />
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={() => { setShowModal(false); setEditingContent(null); resetForm(); }} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '15px' }}>Cancel</button>
                <button onClick={handleSubmit} disabled={saving} style={{ flex: 1, padding: '14px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  {saving ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={20} />}
                  {editingContent ? 'Update Content' : 'Create Content'}
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