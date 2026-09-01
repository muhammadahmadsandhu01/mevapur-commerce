'use client';

import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Loader,
  RefreshCw,
  ShoppingCart,
  TrendingUp
} from 'lucide-react';
import api from '@/lib/api';

interface AnalyticsData {
  thisMonth: { revenue: number; orders: number };
  lastMonth: { revenue: number; orders: number };
  growth: { revenue: number | null; orders: number | null };
}

const currencyFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0
});
const numberFormatter = new Intl.NumberFormat('en-PK');

const growthStyle = (value: number | null, current: number) => {
  if (value === null) {
    if (current > 0) {
      return { icon: ArrowUpRight, color: 'var(--success-text)', background: 'var(--success-light)', label: 'new activity', text: 'New' };
    }
    return { icon: ArrowRight, color: 'var(--text-secondary)', background: 'var(--bg-primary)', label: 'not applicable', text: 'N/A' };
  }
  if (value > 0) return { icon: ArrowUpRight, color: 'var(--success-text)', background: 'var(--success-light)', label: 'increase', text: `+${value.toFixed(2)}%` };
  if (value < 0) return { icon: ArrowDownRight, color: 'var(--danger-text)', background: 'var(--danger-light)', label: 'decrease', text: `${value.toFixed(2)}%` };
  return { icon: ArrowRight, color: 'var(--text-secondary)', background: 'var(--bg-primary)', label: 'no change', text: '0.00%' };
};

function ComparisonCard({
  title,
  current,
  previous,
  growth,
  format,
  icon: Icon
}: {
  title: string;
  current: number;
  previous: number;
  growth: number | null;
  format: (value: number) => string;
  icon: typeof BarChart3;
}) {
  const presentation = growthStyle(growth, current);
  const GrowthIcon = presentation.icon;

  return (
    <article style={{ padding: '22px', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '22px' }}>
        <div><p style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>{title} this month</p><p style={{ color: 'var(--text-primary)', fontSize: '28px', fontWeight: '800' }}>{format(current)}</p></div>
        <span style={{ width: '44px', height: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--accent-text)' }}><Icon size={22} /></span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Last month: <strong style={{ color: 'var(--text-primary)' }}>{format(previous)}</strong></span>
        <span aria-label={presentation.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 9px', borderRadius: '999px', background: presentation.background, color: presentation.color, fontSize: '12px', fontWeight: '800' }}><GrowthIcon size={14} /> {presentation.text}</span>
      </div>
    </article>
  );
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/reports/analytics');
      if (response.data?.success !== true || !response.data.data) {
        throw new Error('Unexpected analytics response');
      }
      setAnalytics(response.data.data);
    } catch (requestError) {
      setAnalytics(null);
      const status = axios.isAxiosError(requestError) ? requestError.response?.status : undefined;
      if (status === 401) setError('Your Admin session has expired. Sign in again to view analytics.');
      else if (status === 403) setError('This account is not authorized to view Admin analytics.');
      else setError('Analytics could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalytics]);

  const hasActivity = Boolean(
    analytics
    && (analytics.thisMonth.revenue || analytics.thisMonth.orders || analytics.lastMonth.revenue || analytics.lastMonth.orders)
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '26px' }}><h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Analytics</h1><p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '720px' }}>This month compared with last month, using non-cancelled order data from the protected Analytics report.</p></header>

      {loading ? (
        <div style={{ minHeight: '300px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)' }}><Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading analytics" /></div>
      ) : error ? (
        <div role="alert" style={{ padding: '42px 20px', textAlign: 'center', border: '1px solid var(--danger-text)', borderRadius: '12px', background: 'var(--card-bg)' }}><AlertCircle size={38} color="var(--danger-text)" style={{ margin: '0 auto 12px' }} /><h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Analytics unavailable</h2><p style={{ color: 'var(--danger-text)', fontSize: '13px', marginBottom: '16px' }}>{error}</p><button type="button" onClick={() => void loadAnalytics()} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', border: 0, borderRadius: '8px', background: 'var(--primary)', color: '#0B132B', fontWeight: '800', cursor: 'pointer' }}><RefreshCw size={16} /> Retry</button></div>
      ) : analytics ? (
        <>
          {!hasActivity && <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '13px 15px', marginBottom: '18px', border: '1px solid var(--border-color)', borderRadius: '9px', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '13px' }}><BarChart3 size={18} /> No non-cancelled order activity was recorded for either comparison month.</div>}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px' }}>
            <ComparisonCard title="Revenue" current={analytics.thisMonth.revenue} previous={analytics.lastMonth.revenue} growth={analytics.growth.revenue} format={(value) => currencyFormatter.format(value)} icon={TrendingUp} />
            <ComparisonCard title="Orders" current={analytics.thisMonth.orders} previous={analytics.lastMonth.orders} growth={analytics.growth.orders} format={(value) => numberFormatter.format(value)} icon={ShoppingCart} />
          </section>
        </>
      ) : null}
    </div>
  );
}
