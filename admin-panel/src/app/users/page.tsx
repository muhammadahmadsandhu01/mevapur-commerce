'use client';

import { useEffect, useState } from 'react';
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Shield, 
  ShieldCheck, 
  ShieldAlert,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle,
  Loader,
  X,
  Mail,
  Phone,
  Lock
} from 'lucide-react';
import api from '@/lib/api';

interface StaffUser {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'super_admin' | 'admin' | 'manager' | 'support' | 'inventory';
  isBlocked: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'admin',
    password: ''
  });

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;

      const response = await api.get('/users/staff', { params });
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    
    if (!formData.fullName || !formData.email || (!editingUser && !formData.password)) {
      setError('Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const response = await api.put(`/users/staff/${editingUser._id}`, {
          fullName: formData.fullName,
          phone: formData.phone,
          role: formData.role
        });
        if (response.data.success) {
          setShowModal(false);
          setEditingUser(null);
          resetForm();
          await fetchUsers();
        }
      } else {
        const response = await api.post('/users/staff', formData);
        if (response.data.success) {
          setShowModal(false);
          resetForm();
          await fetchUsers();
        }
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;

    try {
      const response = await api.delete(`/users/staff/${id}`);
      if (response.data.success) {
        await fetchUsers();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleToggleBlock = async (user: StaffUser) => {
    try {
      const response = await api.put(`/users/staff/${user._id}`, {
        isBlocked: !user.isBlocked
      });
      if (response.data.success) {
        await fetchUsers();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update user');
    }
  };

  const openEditModal = (user: StaffUser) => {
    setEditingUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      password: ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      role: 'admin',
      password: ''
    });
    setError('');
  };

  const getRoleConfig = (role: string) => {
    switch (role) {
      case 'super_admin': return { label: 'Super Admin', color: '#7C3AED', bg: '#EDE9FE', icon: ShieldAlert };
      case 'admin': return { label: 'Admin', color: '#1E40AF', bg: '#DBEAFE', icon: ShieldCheck };
      case 'manager': return { label: 'Manager', color: '#0F766E', bg: '#D1FAE5', icon: Shield };
      case 'support': return { label: 'Support', color: '#B45309', bg: '#FEF3C7', icon: UserCheck };
      case 'inventory': return { label: 'Inventory', color: '#4338CA', bg: '#E0E7FF', icon: Users };
      default: return { label: role, color: '#6B7280', bg: '#F3F4F6', icon: Users };
    }
  };

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
            <h1 style={{ 
              fontSize: '32px', 
              fontWeight: '800', 
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Staff Management
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Manage admin users, roles, and permissions
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
            Add Staff Member
          </button>
        </div>

        {/* Role Info Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '24px'
        }}>
          {['super_admin', 'admin', 'manager', 'support', 'inventory'].map((role) => {
            const config = getRoleConfig(role);
            const Icon = config.icon;
            const count = users.filter(u => u.role === role).length;
            return (
              <div key={role} style={{
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
                  backgroundColor: config.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={24} color={config.color} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {config.label}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
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
              placeholder="Search by name or email..."
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
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
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
            <option value="">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="support">Support</option>
            <option value="inventory">Inventory</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading staff members...</p>
        </div>
      ) : users.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Users size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            No staff members found
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Staff Member</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Role</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Joined</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const roleConfig = getRoleConfig(user.role);
                  const RoleIcon = roleConfig.icon;
                  return (
                    <tr 
                      key={user._id} 
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            backgroundColor: roleConfig.bg,
                            color: roleConfig.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '16px'
                          }}>
                            {user.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {user.fullName}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Mail size={12} /> {user.email}
                            </div>
                            {user.phone && (
                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Phone size={12} /> {user.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: roleConfig.bg,
                          color: roleConfig.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <RoleIcon size={14} />
                          {roleConfig.label}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: user.isBlocked ? '#FEE2E2' : '#D1FAE5',
                          color: user.isBlocked ? '#DC2626' : '#0F766E',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {user.isBlocked ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {new Date(user.createdAt).toLocaleDateString('en-PK', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => openEditModal(user)}
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
                            onClick={() => handleToggleBlock(user)}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: user.isBlocked ? '#10B981' : '#6B7280',
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
                            {user.isBlocked ? <UserCheck size={16} /> : <UserX size={16} />}
                          </button>
                          <button
                            onClick={() => handleDelete(user._id)}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
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
          setEditingUser(null);
          resetForm();
        }}>
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '500px',
              border: '1px solid var(--border-color)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {editingUser ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingUser(null);
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
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="John Doe"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="staff@mevapur.com"
                  disabled={!!editingUser}
                  style={{
                    ...inputStyle,
                    opacity: editingUser ? 0.6 : 1,
                    cursor: editingUser ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0300-1234567"
                  style={inputStyle}
                />
              </div>

              {!editingUser && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Password *
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 8 characters"
                    style={inputStyle}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Role *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  style={inputStyle}
                >
                  <option value="admin">Admin (Full Access)</option>
                  <option value="manager">Manager (Products & Orders)</option>
                  <option value="support">Support (Orders & Reviews)</option>
                  <option value="inventory">Inventory (Products & Stock)</option>
                </select>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  {formData.role === 'admin' && 'Full access to all features'}
                  {formData.role === 'manager' && 'Can manage products, orders, and customers'}
                  {formData.role === 'support' && 'Can view and update orders and reviews'}
                  {formData.role === 'inventory' && 'Can manage products and stock only'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingUser(null);
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
                  onClick={handleSubmit}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: saving ? '#9CA3AF' : 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '15px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {saving ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={20} />}
                  {editingUser ? 'Update Staff' : 'Add Staff'}
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