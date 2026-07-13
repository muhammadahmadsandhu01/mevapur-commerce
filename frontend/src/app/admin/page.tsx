'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { Package, ShoppingCart, Users, TrendingUp } from 'lucide-react';

export default function AdminDashboard() {
  const { token } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/stats`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        
        if (response.data.success) {
          setStats(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
        setStats({
          totalProducts: 0,
          totalOrders: 0,
          totalCustomers: 0,
          totalRevenue: 0,
          recentOrders: []
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token]);

  const statCards = [
    {
      icon: Package,
      label: 'Total Products',
      value: stats?.totalProducts || 0,
      color: '#0F766E',
      bgColor: '#D1FAE5'
    },
    {
      icon: ShoppingCart,
      label: 'Total Orders',
      value: stats?.totalOrders || 0,
      color: '#7C3AED',
      bgColor: '#EDE9FE'
    },
    {
      icon: Users,
      label: 'Total Customers',
      value: stats?.totalCustomers || 0,
      color: '#F59E0B',
      bgColor: '#FEF3C7'
    },
    {
      icon: TrendingUp,
      label: 'Total Revenue',
      value: `Rs. ${(stats?.totalRevenue || 0).toLocaleString()}`,
      color: '#10B981',
      bgColor: '#D1FAE5'
    },
  ];

  if (loading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#111827', marginBottom: '32px' }}>
        Dashboard Overview
      </h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {statCards.map((stat, index) => (
          <div
            key={index}
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                backgroundColor: stat.bgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <stat.icon size={28} color={stat.color} />
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '4px' }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#111827' }}>
                  {stat.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}