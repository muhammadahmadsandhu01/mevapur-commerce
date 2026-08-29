'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gift,
  Image as ImageIcon,
  Loader,
  RefreshCw,
  SlidersHorizontal,
  Tag,
  Users
} from 'lucide-react';
import api from '@/lib/api';

type CouponType = 'percentage' | 'fixed' | 'freeshipping';
type PromotionStatus = 'Active' | 'Upcoming' | 'Expired' | 'Inactive';

interface Coupon {
  _id: string;
  code: string;
  type: CouponType;
  value: number;
  usageLimit?: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  description?: string;
  createdAt: string;
}

interface PromotionRecord extends Coupon {
  status: PromotionStatus;
}

const dateFormatter = new Intl.DateTimeFormat('en-PK', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const numberFormatter = new Intl.NumberFormat('en-PK');

const deriveStatus = (coupon: Coupon, now: Date): PromotionStatus => {
  if (!coupon.isActive) return 'Inactive';
  if (now < new Date(coupon.startDate)) return 'Upcoming';
  if (now > new Date(coupon.endDate)) return 'Expired';
  return 'Active';
};

const formatDate = (value: string) => dateFormatter.format(new Date(value));

const formatPromotionValue = (coupon: Coupon) => {
  if (coupon.type === 'percentage') return `${numberFormatter.format(coupon.value)}% off`;
  if (coupon.type === 'fixed') return `Rs. ${numberFormatter.format(coupon.value)} off`;
  return 'Free shipping';
};

const statusStyle = (status: PromotionStatus) => {
  switch (status) {
    case 'Active':
      return { background: 'var(--success-light)', color: 'var(--success-text)' };
    case 'Upcoming':
      return { background: 'var(--info-light)', color: 'var(--info-text)' };
    case 'Expired':
      return { background: 'var(--danger-light)', color: 'var(--danger-text)' };
    default:
      return { background: 'var(--bg-primary)', color: 'var(--text-secondary)' };
  }
};

export default function PromotionsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/coupons');
      if (response.data?.success !== true || !Array.isArray(response.data.data)) {
        throw new Error('Unexpected coupon response');
      }
      setCoupons(response.data.data);
    } catch {
      setError('Promotion data could not be loaded. Confirm your Admin session and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPromotions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPromotions]);

  const overview = useMemo(() => {
    const now = new Date();
    const records: PromotionRecord[] = coupons.map((coupon) => ({
      ...coupon,
      status: deriveStatus(coupon, now)
    }));

    return {
      records: records
        .sort((left, right) => (
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        ))
        .slice(0, 10),
      total: records.length,
      active: records.filter((coupon) => coupon.status === 'Active').length,
      upcoming: records.filter((coupon) => coupon.status === 'Upcoming').length,
      usage: records.reduce((total, coupon) => total + coupon.usedCount, 0)
    };
  }, [coupons]);

  const managementLinks = [
    {
      label: 'Manage Coupons',
      description: 'Create, edit and retire discount codes.',
      href: '/coupons',
      icon: BadgePercent
    },
    {
      label: 'Manage Banners',
      description: 'Maintain promotional banner content.',
      href: '/content/banners',
      icon: ImageIcon
    },
    {
      label: 'Manage Sliders',
      description: 'Maintain promotional slider content.',
      href: '/content/sliders',
      icon: SlidersHorizontal
    }
  ];

  const summaryCards = [
    { label: 'Total promotions', value: overview.total, icon: Gift, color: 'var(--accent-text)', background: 'rgba(255, 138, 0, 0.12)' },
    { label: 'Active now', value: overview.active, icon: CheckCircle2, color: 'var(--success-text)', background: 'var(--success-light)' },
    { label: 'Upcoming', value: overview.upcoming, icon: Clock3, color: 'var(--info-text)', background: 'var(--info-light)' },
    { label: 'Total recorded usage', value: overview.usage, icon: Users, color: 'var(--warning-text)', background: 'var(--warning-light)' }
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Promotion Center
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', maxWidth: '760px' }}>
          Monitor real coupon activity and move to the existing coupon and content management tools.
        </p>
      </header>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {managementLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '18px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                background: 'var(--card-bg)',
                color: 'var(--text-primary)',
                textDecoration: 'none'
              }}
            >
              <span style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 138, 0, 0.12)',
                color: 'var(--accent-text)',
                flexShrink: 0
              }}>
                <Icon size={20} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '14px', fontWeight: '800', marginBottom: '4px' }}>
                  {item.label}
                </span>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
                  {item.description}
                </span>
              </span>
              <ArrowRight size={17} color="var(--text-secondary)" />
            </Link>
          );
        })}
      </section>

      {loading ? (
        <div style={{
          minHeight: '280px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          background: 'var(--card-bg)'
        }}>
          <Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading promotions" />
        </div>
      ) : error ? (
        <div role="alert" style={{
          padding: '40px 24px',
          textAlign: 'center',
          border: '1px solid var(--danger-text)',
          borderRadius: '12px',
          background: 'var(--card-bg)'
        }}>
          <Tag size={38} color="var(--danger-text)" style={{ margin: '0 auto 14px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Promotions unavailable
          </h2>
          <p style={{ color: 'var(--danger-text)', fontSize: '14px', marginBottom: '18px' }}>{error}</p>
          <button
            type="button"
            onClick={() => void loadPromotions()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              border: 0,
              borderRadius: '8px',
              background: 'var(--primary)',
              color: '#0B132B',
              fontWeight: '800',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      ) : (
        <>
          <section style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '20px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  background: 'var(--card-bg)'
                }}>
                  <span style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: card.background,
                    color: card.color,
                    flexShrink: 0
                  }}>
                    <Icon size={23} />
                  </span>
                  <span>
                    <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                      {card.label}
                    </span>
                    <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '24px', fontWeight: '800' }}>
                      {numberFormatter.format(card.value)}
                    </span>
                  </span>
                </div>
              );
            })}
          </section>

          <section style={{
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            background: 'var(--card-bg)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Recent promotions
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                The ten most recently created coupons returned by the Admin API.
              </p>
            </div>

            {overview.records.length === 0 ? (
              <div style={{ padding: '52px 20px', textAlign: 'center' }}>
                <Gift size={42} color="var(--text-secondary)" style={{ opacity: 0.45, margin: '0 auto 14px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  No coupon promotions yet
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '18px' }}>
                  Create and manage the first promotion in the existing Coupons area.
                </p>
                <Link href="/coupons" style={{ color: 'var(--accent-text)', fontWeight: '800', textDecoration: 'none' }}>
                  Manage Coupons
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-primary)' }}>
                      {['Coupon', 'Description', 'Type / value', 'Schedule', 'Usage', 'Status'].map((heading) => (
                        <th key={heading} style={{ padding: '13px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.records.map((coupon) => {
                      const badge = statusStyle(coupon.status);
                      return (
                        <tr key={coupon._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '15px 16px', color: 'var(--text-primary)', fontWeight: '800', fontFamily: 'monospace' }}>
                            {coupon.code}
                          </td>
                          <td style={{ padding: '15px 16px', color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '280px' }}>
                            {coupon.description || 'No description provided'}
                          </td>
                          <td style={{ padding: '15px 16px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '700' }}>
                            {formatPromotionValue(coupon)}
                          </td>
                          <td style={{ padding: '15px 16px', color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <CalendarDays size={14} /> {formatDate(coupon.startDate)} – {formatDate(coupon.endDate)}
                            </span>
                          </td>
                          <td style={{ padding: '15px 16px', color: 'var(--text-primary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                            {numberFormatter.format(coupon.usedCount)}
                            {coupon.usageLimit && coupon.usageLimit > 0
                              ? ` / ${numberFormatter.format(coupon.usageLimit)}`
                              : ' / Unlimited'}
                          </td>
                          <td style={{ padding: '15px 16px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '6px 10px',
                              borderRadius: '999px',
                              fontSize: '12px',
                              fontWeight: '800',
                              ...badge
                            }}>
                              {coupon.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
