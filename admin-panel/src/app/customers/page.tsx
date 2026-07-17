'use client';

import { useState, useEffect } from 'react';
import { 
  Users, Search, Filter, Download, Mail, Phone, MapPin,
  ShoppingCart, Calendar, TrendingUp, Star, MoreVertical,
  Eye, Edit, Trash2, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import api from '@/lib/api';

interface Customer {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  };
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate?: string;
  createdAt: string;
  isActive: boolean;
  tags?: string[];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'inactive' | 'vip'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'totalSpent' | 'totalOrders' | 'lastOrderDate'>('name');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/customers');
      if (response.data.success) {
        setCustomers(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         customer.phone?.includes(searchQuery);
    const matchesFilter = filterType === 'all' ||
                         (filterType === 'active' && customer.isActive) ||
                         (filterType === 'inactive' && !customer.isActive) ||
                         (filterType === 'vip' && customer.totalSpent > 50000);
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sortBy === 'name') return a.fullName.localeCompare(b.fullName);
    if (sortBy === 'totalSpent') return b.totalSpent - a.totalSpent;
    if (sortBy === 'totalOrders') return b.totalOrders - a.totalOrders;
    if (sortBy === 'lastOrderDate') {
      if (!a.lastOrderDate) return 1;
      if (!b.lastOrderDate) return -1;
      return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
    }
    return 0;
  });

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.isActive).length,
    vip: customers.filter(c => c.totalSpent > 50000).length,
    totalRevenue: customers.reduce((acc, c) => acc + c.totalSpent, 0),
    averageOrderValue: customers.reduce((acc, c) => acc + c.averageOrderValue, 0) / (customers.length || 1)
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Name', 'Email', 'Phone', 'Total Orders', 'Total Spent', 'Avg Order Value', 'Last Order', 'Status'].join(','),
      ...filteredCustomers.map(c => [
        c.fullName,
        c.email,
        c.phone || '',
        c.totalOrders,
        c.totalSpent,
        c.averageOrderValue,
        c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : 'Never',
        c.isActive ? 'Active' : 'Inactive'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getCustomerBadge = (customer: Customer) => {
    if (customer.totalSpent > 50000) {
      return { bg: '#FDF4FF', color: '#A855F7', text: 'VIP Customer', icon: Star };
    }
    if (customer.totalOrders > 10) {
      return { bg: '#DBEAFE', color: '#3B82F6', text: 'Loyal', icon: CheckCircle };
    }
    if (!customer.isActive) {
      return { bg: '#FEE2E2', color: '#EF4444', text: 'Inactive', icon: XCircle };
    }
    return { bg: '#D1FAE5', color: '#10B981', text: 'Active', icon: CheckCircle };
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Customers
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Manage customer accounts, view order history, and track engagement.
          </p>
        </div>
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
          <Download size={18} /> Export CSV
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
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} color="#3B82F6" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Customers</div>
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
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Active Customers</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.active}</div>
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
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FDF4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={24} color="#A855F7" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>VIP Customers</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.vip}</div>
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
            <TrendingUp size={24} color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Rs. {(stats.totalRevenue / 1000).toFixed(1)}k</div>
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
            placeholder="Search by name, email, or phone..."
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
          <option value="all">All Customers</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="vip">VIP Only</option>
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
          <option value="totalSpent">Sort by Spending</option>
          <option value="totalOrders">Sort by Orders</option>
          <option value="lastOrderDate">Last Order</option>
        </select>
      </div>

      {/* Customers List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              height: '100px',
              animation: 'pulse 1.5s infinite',
              border: '1px solid var(--border-color)'
            }} />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '80px 20px',
          textAlign: 'center',
          border: '1px solid var(--border-color)',
          borderStyle: 'dashed'
        }}>
          <Users size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No customers found
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>Try adjusting your filters or search query</p>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Customer</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Contact</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Orders</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Spent</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Last Order</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
                {filteredCustomers.map((customer) => {
                  const badge = getCustomerBadge(customer);
                  const BadgeIcon = badge.icon;
                  
                  return (
                    <tr 
                      key={customer._id} 
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s', cursor: 'pointer' }}
                      onClick={() => { setSelectedCustomer(customer); setShowDetails(true); }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '48px', height: '48px', borderRadius: '50%',
                            backgroundColor: '#0F766E',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: '700', fontSize: '18px',
                            flexShrink: 0
                          }}>
                            {customer.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                              {customer.fullName}
                            </div>
                            {customer.tags && customer.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                {customer.tags.map((tag, i) => (
                                  <span key={i} style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    backgroundColor: 'var(--bg-primary)',
                                    color: 'var(--text-secondary)',
                                    borderRadius: '4px',
                                    fontWeight: '600'
                                  }}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <Mail size={14} />
                            {customer.email}
                          </div>
                          {customer.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                              <Phone size={14} />
                              {customer.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                          {customer.totalOrders}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Avg: Rs. {customer.averageOrderValue.toFixed(0)}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '15px' }}>
                          Rs. {customer.totalSpent.toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          backgroundColor: badge.bg,
                          color: badge.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '700'
                        }}>
                          <BadgeIcon size={14} />
                          {badge.text}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString() : 'Never'}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); setShowDetails(true); }}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Details Modal */}
      {showDetails && selectedCustomer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
          onClick={() => setShowDetails(false)}
        >
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  backgroundColor: '#0F766E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: '700', fontSize: '24px'
                }}>
                  {selectedCustomer.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {selectedCustomer.fullName}
                  </h2>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {getCustomerBadge(selectedCustomer) && (
                      <span style={{
                        padding: '4px 12px',
                        backgroundColor: getCustomerBadge(selectedCustomer).bg,
                        color: getCustomerBadge(selectedCustomer).color,
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}>
                        {getCustomerBadge(selectedCustomer).text}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <XCircle size={24} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              <div style={{
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>
                  Contact Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Mail size={18} color="var(--text-secondary)" />
                    <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{selectedCustomer.email}</span>
                  </div>
                  {selectedCustomer.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Phone size={18} color="var(--text-secondary)" />
                      <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{selectedCustomer.phone}</span>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <MapPin size={18} color="var(--text-secondary)" />
                      <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                        {selectedCustomer.address.street}, {selectedCustomer.address.city}, {selectedCustomer.address.country} {selectedCustomer.address.postalCode}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>
                  Order Statistics
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Orders</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{selectedCustomer.totalOrders}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Spent</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>Rs. {selectedCustomer.totalSpent.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Avg Order Value</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>Rs. {selectedCustomer.averageOrderValue.toFixed(0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Customer Since</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {new Date(selectedCustomer.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Edit Customer
              </button>
              <button
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ShoppingCart size={18} /> View Orders
              </button>
            </div>
          </div>
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