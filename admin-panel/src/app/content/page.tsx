'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, HelpCircle, MessageSquare, 
  Plus, Edit, Trash2, Eye, CheckCircle, XCircle, 
  Clock, Search, Loader, ArrowUpRight, AlertCircle
} from 'lucide-react';
import api from '@/lib/api';

// --- TypeScript Interfaces ---
interface Page {
  _id: string;
  title: string;
  slug: string;
  status: 'Published' | 'Draft';
  updatedAt: string;
}

interface Banner {
  _id: string;
  name: string;
  location: string;
  status: 'Active' | 'Inactive';
  startDate: string;
  endDate: string;
}

interface Faq {
  _id: string;
  question: string;
  category: string;
  status: 'Active' | 'Inactive';
}

interface Testimonial {
  _id: string;
  name: string;
  rating: number;
  review: string;
  status: 'Approved' | 'Pending' | 'Rejected';
}

export default function ContentManagementPage() {
  const [activeTab, setActiveTab] = useState<'pages' | 'banners' | 'faqs' | 'testimonials'>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data States
  const [pages, setPages] = useState<Page[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tabs = [
    { id: 'pages', label: 'Static Pages', icon: FileText, endpoint: '/pages' },
    { id: 'banners', label: 'Banners & Sliders', icon: ImageIcon, endpoint: '/banners' },
    { id: 'faqs', label: 'FAQ Management', icon: HelpCircle, endpoint: '/faqs' },
    { id: 'testimonials', label: 'Testimonials', icon: MessageSquare, endpoint: '/testimonials' },
  ];

  // Fetch data based on active tab and search query
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const currentTab = tabs.find(t => t.id === activeTab);
        if (!currentTab) return;

        // Note: Replace these endpoints with your actual backend routes
        const response = await api.get(currentTab.endpoint, { 
          params: { search: searchQuery } 
        });
        
        if (response.data.success) {
          if (activeTab === 'pages') setPages(response.data.data);
          else if (activeTab === 'banners') setBanners(response.data.data);
          else if (activeTab === 'faqs') setFaqs(response.data.data);
          else if (activeTab === 'testimonials') setTestimonials(response.data.data);
        }
      } catch (err) {
        console.error(`Error fetching ${activeTab}:`, err);
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    // Debounce search to avoid excessive API calls
    const timer = setTimeout(() => {
      fetchData();
    }, 500);

    return () => clearTimeout(timer);
  }, [activeTab, searchQuery]);

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'published' || s === 'active' || s === 'approved') {
      return { bg: '#D1FAE5', color: '#0F766E', icon: CheckCircle, text: status };
    }
    if (s === 'draft' || s === 'inactive' || s === 'pending') {
      return { bg: '#FEF3C7', color: '#92400E', icon: Clock, text: status };
    }
    return { bg: '#FEE2E2', color: '#DC2626', icon: XCircle, text: status };
  };

  const handleDelete = async (id: string, itemName: string) => {
    if (!confirm(`Are you sure you want to delete "${itemName}"? This action cannot be undone.`)) return;
    
    try {
      const currentTab = tabs.find(t => t.id === activeTab);
      await api.delete(`${currentTab?.endpoint}/${id}`);
      
      // Update local state
      if (activeTab === 'pages') setPages(prev => prev.filter(p => p._id !== id));
      else if (activeTab === 'banners') setBanners(prev => prev.filter(b => b._id !== id));
      else if (activeTab === 'faqs') setFaqs(prev => prev.filter(f => f._id !== id));
      else if (activeTab === 'testimonials') setTestimonials(prev => prev.filter(t => t._id !== id));
      
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete item.');
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    try {
      const currentTab = tabs.find(t => t.id === activeTab);
      const newStatus = currentStatus.toLowerCase() === 'active' || currentStatus.toLowerCase() === 'published' || currentStatus.toLowerCase() === 'approved' ? 'Inactive' : 'Active';
      
      await api.patch(`${currentTab?.endpoint}/${id}/status`, { status: newStatus });
      
      // Optimistic UI update
      if (activeTab === 'pages') {
        setPages(prev => prev.map(p => p._id === id ? { ...p, status: newStatus as any } : p));
      } else if (activeTab === 'banners') {
        setBanners(prev => prev.map(b => b._id === id ? { ...b, status: newStatus as any } : b));
      } else if (activeTab === 'faqs') {
        setFaqs(prev => prev.map(f => f._id === id ? { ...f, status: newStatus as any } : f));
      } else if (activeTab === 'testimonials') {
        setTestimonials(prev => prev.map(t => t._id === id ? { ...t, status: newStatus as any } : t));
      }
    } catch (err) {
      console.error('Status toggle error:', err);
      alert('Failed to update status.');
    }
  };

  const renderEmptyState = () => (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <AlertCircle size={48} color="var(--text-secondary)" style={{ opacity: 0.3, margin: '0 auto 16px' }} />
      <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
        No {activeTab} found
      </h3>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
        {searchQuery ? 'Try adjusting your search query.' : 'Get started by adding your first item.'}
      </p>
      <button style={{
        padding: '10px 20px', backgroundColor: 'var(--primary)', color: 'white', border: 'none',
        borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px'
      }}>
        <Plus size={16} /> Add New {activeTab.slice(0, -1)}
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Content Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Manage website content, banners, FAQs, and customer testimonials.
          </p>
        </div>
        <button style={{
          padding: '12px 20px', backgroundColor: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)', transition: 'all 0.2s'
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--primary-dark)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
          <Plus size={18} /> Add New Content
        </button>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border-color)', paddingBottom: '2px', flexWrap: 'wrap' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 20px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                fontSize: '15px', fontWeight: isActive ? '700' : '500',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
              }}
            >
              <Icon size={18} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '16px 20px', border: '1px solid var(--border-color)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Search size={18} color="var(--text-secondary)" />
        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '14px' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ padding: '4px', borderRadius: '50%', border: 'none', backgroundColor: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <XCircle size={16} />
          </button>
        )}
      </div>

      {/* Content Area */}
      <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', minHeight: '400px' }}>
        
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
            <Loader size={40} className="animate-spin text-teal-700" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading content...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#DC2626' }}>
            <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
            <p>{error}</p>
          </div>
        ) : (
          <>
            {/* 1. Static Pages Tab */}
            {activeTab === 'pages' && (pages.length === 0 ? renderEmptyState() : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <tr>
                    {['Page Title', 'URL Slug', 'Status', 'Last Modified', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages.map(page => {
                    const badge = getStatusBadge(page.status);
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={page._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>{page.title}</td>
                        <td style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>{page.slug}</td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: badge.bg, color: badge.color, borderRadius: '20px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            onClick={() => handleStatusToggle(page._id, page.status)}>
                            <BadgeIcon size={12} /> {badge.text}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>{new Date(page.updatedAt).toLocaleDateString()}</td>
                        <td style={{ padding: '16px 20px', display: 'flex', gap: '8px' }}>
                          <button style={{ padding: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }} title="View"><Eye size={16} /></button>
                          <button style={{ padding: '8px', backgroundColor: '#DBEAFE', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#1E40AF' }} title="Edit"><Edit size={16} /></button>
                          <button onClick={() => handleDelete(page._id, page.title)} style={{ padding: '8px', backgroundColor: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#DC2626' }} title="Delete"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

            {/* 2. Banners Tab */}
            {activeTab === 'banners' && (banners.length === 0 ? renderEmptyState() : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <tr>
                    {['Banner Name', 'Location', 'Active Dates', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {banners.map(banner => {
                    const badge = getStatusBadge(banner.status);
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={banner._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ImageIcon size={20} color="var(--text-secondary)" />
                          </div>
                          {banner.name}
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>{banner.location}</td>
                        <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(banner.startDate).toLocaleDateString()} <ArrowUpRight size={12} style={{ verticalAlign: 'middle' }} /> {new Date(banner.endDate).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: badge.bg, color: badge.color, borderRadius: '20px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            onClick={() => handleStatusToggle(banner._id, banner.status)}>
                            <BadgeIcon size={12} /> {badge.text}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', display: 'flex', gap: '8px' }}>
                          <button style={{ padding: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }} title="View"><Eye size={16} /></button>
                          <button style={{ padding: '8px', backgroundColor: '#DBEAFE', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#1E40AF' }} title="Edit"><Edit size={16} /></button>
                          <button onClick={() => handleDelete(banner._id, banner.name)} style={{ padding: '8px', backgroundColor: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#DC2626' }} title="Delete"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

            {/* 3. FAQs Tab */}
            {activeTab === 'faqs' && (faqs.length === 0 ? renderEmptyState() : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <tr>
                    {['Question', 'Category', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faqs.map(faq => {
                    const badge = getStatusBadge(faq.status);
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={faq._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>{faq.question}</td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ padding: '4px 10px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid var(--border-color)' }}>
                            {faq.category}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: badge.bg, color: badge.color, borderRadius: '20px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            onClick={() => handleStatusToggle(faq._id, faq.status)}>
                            <BadgeIcon size={12} /> {badge.text}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', display: 'flex', gap: '8px' }}>
                          <button style={{ padding: '8px', backgroundColor: '#DBEAFE', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#1E40AF' }} title="Edit"><Edit size={16} /></button>
                          <button onClick={() => handleDelete(faq._id, faq.question)} style={{ padding: '8px', backgroundColor: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#DC2626' }} title="Delete"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

            {/* 4. Testimonials Tab */}
            {activeTab === 'testimonials' && (testimonials.length === 0 ? renderEmptyState() : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <tr>
                    {['Customer', 'Review', 'Rating', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {testimonials.map(testimonial => {
                    const badge = getStatusBadge(testimonial.status);
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={testimonial._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>{testimonial.name}</td>
                        <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          "{testimonial.review}"
                        </td>
                        <td style={{ padding: '16px 20px', color: '#F59E0B', fontSize: '14px' }}>
                          {'★'.repeat(testimonial.rating)}{'☆'.repeat(5 - testimonial.rating)}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: badge.bg, color: badge.color, borderRadius: '20px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                            onClick={() => handleStatusToggle(testimonial._id, testimonial.status)}>
                            <BadgeIcon size={12} /> {badge.text}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', display: 'flex', gap: '8px' }}>
                          {testimonial.status === 'Pending' && (
                            <button onClick={() => handleStatusToggle(testimonial._id, testimonial.status)} style={{ padding: '8px', backgroundColor: '#D1FAE5', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#0F766E' }} title="Approve"><CheckCircle size={16} /></button>
                          )}
                          <button onClick={() => handleDelete(testimonial._id, testimonial.name)} style={{ padding: '8px', backgroundColor: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#DC2626' }} title="Delete"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
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