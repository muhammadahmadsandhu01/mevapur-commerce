'use client';

import axios from 'axios';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BadgePercent,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  LayoutPanelTop,
  Loader,
  Megaphone,
  RefreshCw,
  Tag
} from 'lucide-react';
import api from '@/lib/api';

interface CouponStats {
  total: number;
  active: number;
  expired: number;
  upcoming: number;
  totalUsage: number;
}

interface ContentStats {
  totalContent: number;
  activeContent: number;
  inactiveContent: number;
  banners: number;
  sliders: number;
  pages: number;
  blogs: number;
}

type SourceState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const isCount = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const parseCouponStats = (value: unknown): CouponStats | null => {
  if (!isRecord(value)) return null;
  if (
    !isCount(value.total)
    || !isCount(value.active)
    || !isCount(value.expired)
    || !isCount(value.upcoming)
    || !isCount(value.totalUsage)
  ) return null;
  return value as unknown as CouponStats;
};

const parseContentStats = (value: unknown): ContentStats | null => {
  if (!isRecord(value)) return null;
  if (
    !isCount(value.totalContent)
    || !isCount(value.activeContent)
    || !isCount(value.inactiveContent)
    || !isCount(value.banners)
    || !isCount(value.sliders)
    || !isCount(value.pages)
    || !isCount(value.blogs)
  ) return null;
  return value as unknown as ContentStats;
};

const numberFormatter = new Intl.NumberFormat('en-PK');
const cardStyle = {
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  background: 'var(--card-bg)'
};

const navigationItems = [
  {
    href: '/promotions',
    label: 'Promotion Center',
    description: 'Review current coupon promotion schedules and recorded usage.',
    icon: Megaphone
  },
  {
    href: '/coupons',
    label: 'Manage Coupons',
    description: 'Create and maintain the discount codes supported by checkout.',
    icon: BadgePercent
  },
  {
    href: '/content?type=banner',
    label: 'Manage Banners',
    description: 'Open the Banner tab in the authoritative Content workspace.',
    icon: ImageIcon
  },
  {
    href: '/content?type=slider',
    label: 'Manage Sliders',
    description: 'Open the Slider tab in the authoritative Content workspace.',
    icon: LayoutPanelTop
  },
  {
    href: '/content?type=blog',
    label: 'Manage Blogs',
    description: 'Open the Blog tab for editorial marketing content.',
    icon: BookOpen
  },
  {
    href: '/analytics',
    label: 'View Analytics',
    description: 'Review real month-over-month order and revenue performance.',
    icon: BarChart3
  }
];

function MetricCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: number;
  icon: typeof Tag;
}) {
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '13px', padding: '17px' }}>
      <span style={{ width: '42px', height: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--accent-text)' }}><Icon size={21} /></span>
      <span><span style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700' }}>{label}</span><span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '22px', fontWeight: '800' }}>{numberFormatter.format(value)}</span></span>
    </div>
  );
}

function SourceError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" style={{ padding: '28px 18px', textAlign: 'center' }}>
      <Tag size={32} color="var(--danger-text)" style={{ margin: '0 auto 10px' }} />
      <p style={{ color: 'var(--danger-text)', fontSize: '13px', marginBottom: '13px' }}>{message}</p>
      <button className="marketing-focus" type="button" onClick={retry} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 13px', border: 0, borderRadius: '8px', background: 'var(--primary)', color: '#0B132B', fontWeight: '800', cursor: 'pointer' }}><RefreshCw size={15} /> Retry</button>
    </div>
  );
}

export default function MarketingPage() {
  const [couponState, setCouponState] = useState<SourceState<CouponStats>>({ status: 'loading' });
  const [contentState, setContentState] = useState<SourceState<ContentStats>>({ status: 'loading' });
  const couponSequence = useRef(0);
  const contentSequence = useRef(0);
  const couponRequest = useRef<AbortController | null>(null);
  const contentRequest = useRef<AbortController | null>(null);

  const loadCouponStats = useCallback(async () => {
    couponRequest.current?.abort();
    const controller = new AbortController();
    couponRequest.current = controller;
    const requestId = ++couponSequence.current;
    setCouponState({ status: 'loading' });

    try {
      const response = await api.get('/coupons/stats', { signal: controller.signal });
      const stats = response.data?.success === true
        ? parseCouponStats(response.data.data)
        : null;
      if (!stats) throw new Error('Invalid coupon stats response');
      if (!controller.signal.aborted && requestId === couponSequence.current) {
        setCouponState({ status: 'success', data: stats });
      }
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return;
      if (requestId === couponSequence.current) {
        setCouponState({
          status: 'error',
          message: 'Coupon activity could not be loaded. Confirm your Admin session and try again.'
        });
      }
    } finally {
      if (couponRequest.current === controller) couponRequest.current = null;
    }
  }, []);

  const loadContentStats = useCallback(async () => {
    contentRequest.current?.abort();
    const controller = new AbortController();
    contentRequest.current = controller;
    const requestId = ++contentSequence.current;
    setContentState({ status: 'loading' });

    try {
      const response = await api.get('/content/stats', { signal: controller.signal });
      const stats = response.data?.success === true
        ? parseContentStats(response.data.data)
        : null;
      if (!stats) throw new Error('Invalid content stats response');
      if (!controller.signal.aborted && requestId === contentSequence.current) {
        setContentState({ status: 'success', data: stats });
      }
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return;
      if (requestId === contentSequence.current) {
        setContentState({
          status: 'error',
          message: 'Content activity could not be loaded. Confirm your Admin session and try again.'
        });
      }
    } finally {
      if (contentRequest.current === controller) contentRequest.current = null;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCouponStats();
      void loadContentStats();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      couponRequest.current?.abort();
      contentRequest.current?.abort();
      couponSequence.current += 1;
      contentSequence.current += 1;
    };
  }, [loadContentStats, loadCouponStats]);

  const failedSources = [couponState, contentState].filter((state) => state.status === 'error').length;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '26px' }}>
        <h1 style={{ color: 'var(--text-primary)', fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', marginBottom: '8px' }}>Marketing Operations</h1>
        <p style={{ maxWidth: '780px', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>A cross-domain view of real coupon and content activity, with direct access to the existing operational tools. This page does not create a separate campaign domain.</p>
      </header>

      <section aria-labelledby="marketing-tools-title" style={{ marginBottom: '28px' }}>
        <h2 id="marketing-tools-title" style={{ color: 'var(--text-primary)', fontSize: '17px', fontWeight: '800', marginBottom: '13px' }}>Marketing workspaces</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="marketing-action marketing-focus" key={item.href} href={item.href} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '13px', padding: '17px', color: 'var(--text-primary)', textDecoration: 'none' }}>
                <span style={{ width: '42px', height: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--accent-text)' }}><Icon size={21} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: '13px', fontWeight: '800', marginBottom: '4px' }}>{item.label}</span><span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.5 }}>{item.description}</span></span>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </Link>
            );
          })}
        </div>
      </section>

      {failedSources > 0 && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 14px', marginBottom: '18px', border: '1px solid var(--warning-text)', borderRadius: '9px', background: 'var(--warning-light)', color: 'var(--warning-text)', fontSize: '12px', fontWeight: '700' }}>
          <Tag size={17} /> {failedSources === 2 ? 'Marketing metrics are currently unavailable. Retry each source below.' : 'Some marketing metrics are unavailable. Successful data remains visible below.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: '20px' }}>
        <section aria-labelledby="coupon-activity-title" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '17px 19px', borderBottom: '1px solid var(--border-color)' }}><h2 id="coupon-activity-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '17px', fontWeight: '800', marginBottom: '4px' }}><BadgePercent size={19} color="var(--accent-text)" /> Coupon activity</h2><p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Protected totals from the existing coupon statistics contract.</p></div>
          {couponState.status === 'loading' ? (
            <div style={{ minHeight: '170px', display: 'grid', placeItems: 'center' }}><Loader className="animate-spin" size={27} color="var(--accent-text)" aria-label="Loading coupon activity" /></div>
          ) : couponState.status === 'error' ? (
            <SourceError message={couponState.message} retry={() => void loadCouponStats()} />
          ) : (
            <div style={{ padding: '18px' }}>
              {couponState.data.total === 0 && <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--text-secondary)', fontSize: '12px' }}><BadgePercent size={16} /> No coupons are currently stored.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                <MetricCard label="Total coupons" value={couponState.data.total} icon={BadgePercent} />
                <MetricCard label="Active now" value={couponState.data.active} icon={CheckCircle2} />
                <MetricCard label="Upcoming" value={couponState.data.upcoming} icon={CalendarClock} />
                <MetricCard label="Expired" value={couponState.data.expired} icon={Tag} />
                <MetricCard label="Recorded usage" value={couponState.data.totalUsage} icon={BarChart3} />
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="content-activity-title" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '17px 19px', borderBottom: '1px solid var(--border-color)' }}><h2 id="content-activity-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '17px', fontWeight: '800', marginBottom: '4px' }}><FileText size={19} color="var(--accent-text)" /> Content activity</h2><p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Protected totals for the four content types supported by the Content model.</p></div>
          {contentState.status === 'loading' ? (
            <div style={{ minHeight: '170px', display: 'grid', placeItems: 'center' }}><Loader className="animate-spin" size={27} color="var(--accent-text)" aria-label="Loading content activity" /></div>
          ) : contentState.status === 'error' ? (
            <SourceError message={contentState.message} retry={() => void loadContentStats()} />
          ) : (
            <div style={{ padding: '18px' }}>
              {contentState.data.totalContent === 0 && <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--text-secondary)', fontSize: '12px' }}><FileText size={16} /> No content records are currently stored.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                <MetricCard label="Total content" value={contentState.data.totalContent} icon={FileText} />
                <MetricCard label="Active content" value={contentState.data.activeContent} icon={CheckCircle2} />
                <MetricCard label="Banners" value={contentState.data.banners} icon={ImageIcon} />
                <MetricCard label="Sliders" value={contentState.data.sliders} icon={LayoutPanelTop} />
                <MetricCard label="Pages" value={contentState.data.pages} icon={FileText} />
                <MetricCard label="Blogs" value={contentState.data.blogs} icon={BookOpen} />
              </div>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .marketing-action {
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .marketing-action:hover {
          border-color: var(--primary);
          transform: translateY(-1px);
        }
        .marketing-focus:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 3px;
        }
      `}</style>
    </div>
  );
}
