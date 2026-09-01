'use client';

import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Box,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Loader,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users
} from 'lucide-react';
import api from '@/lib/api';
import {
  initialReportState,
  isReportTab,
  reportForTab,
  reportLoadReducer,
  validateReportData,
  type ReportTab,
  type ValidatedReport
} from './reportData';

const reportTabs: Array<{
  value: ReportTab;
  label: string;
  icon: typeof BarChart3;
}> = [
  { value: 'sales', label: 'Sales', icon: TrendingUp },
  { value: 'products', label: 'Products', icon: Package },
  { value: 'customers', label: 'Customers', icon: Users },
  { value: 'orders', label: 'Orders', icon: ShoppingCart }
];

const exportableTabs = new Set<ReportTab>(['products', 'customers', 'orders']);

const numberFormatter = new Intl.NumberFormat('en-PK');
const currencyFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0
});
const dateFormatter = new Intl.DateTimeFormat('en-PK', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const cardStyle = {
  padding: '18px',
  border: '1px solid var(--border-color)',
  borderRadius: '11px',
  background: 'var(--card-bg)'
};

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof BarChart3 }) {
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '13px' }}>
      <span style={{ width: '42px', height: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9px', background: 'var(--primary-light)', color: 'var(--accent-text)', flexShrink: 0 }}><Icon size={21} /></span>
      <span><span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>{label}</span><span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '20px', fontWeight: '800' }}>{value}</span></span>
    </div>
  );
}

function EmptyReport({ message }: { message: string }) {
  return <div style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}><FileSpreadsheet size={34} style={{ opacity: 0.4, margin: '0 auto 10px' }} />{message}</div>;
}

function ReportsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: ReportTab = isReportTab(requestedTab) ? requestedTab : 'sales';
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const [reportState, dispatchReport] = useReducer(
    reportLoadReducer,
    activeTab,
    initialReportState
  );
  const [filterError, setFilterError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [salesPeriod, setSalesPeriod] = useState('daily');
  const [productSort, setProductSort] = useState('soldCount');
  const [productLimit, setProductLimit] = useState('10');
  const [customerPeriod, setCustomerPeriod] = useState('30');
  const [orderStartDate, setOrderStartDate] = useState('');
  const [orderEndDate, setOrderEndDate] = useState('');

  useEffect(() => {
    if (!isReportTab(requestedTab)) router.replace('/reports?tab=sales', { scroll: false });
  }, [requestedTab, router]);

  const loadReport = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++requestSequence.current;
    const tab = activeTab;
    const params: Record<string, string> = {};
    dispatchReport({ type: 'request', tab, requestId });
    setExportMessage('');

    if (tab === 'sales') params.period = salesPeriod;
    if (tab === 'products') {
      params.sortBy = productSort;
      params.limit = productLimit;
    }
    if (tab === 'customers') params.period = customerPeriod;
    if (tab === 'orders') {
      if (Boolean(orderStartDate) !== Boolean(orderEndDate)) {
        setFilterError('Choose both an order start date and end date, or clear both.');
        dispatchReport({ type: 'idle', tab, requestId });
        if (activeRequest.current === controller) activeRequest.current = null;
        return;
      }
      if (orderStartDate && orderEndDate && orderStartDate > orderEndDate) {
        setFilterError('Order end date must not be earlier than the start date.');
        dispatchReport({ type: 'idle', tab, requestId });
        if (activeRequest.current === controller) activeRequest.current = null;
        return;
      }
      if (orderStartDate && orderEndDate) {
        params.startDate = `${orderStartDate}T00:00:00.000Z`;
        params.endDate = `${orderEndDate}T23:59:59.999Z`;
      }
    }

    setFilterError('');

    try {
      const response = await api.get(`/reports/${tab}`, {
        params,
        signal: controller.signal
      });
      if (response.data?.success !== true || !response.data.data) {
        throw new Error('Unexpected report response');
      }
      const report = validateReportData(tab, response.data.data);
      if (!report) throw new Error('Invalid report response');
      dispatchReport({ type: 'success', report, requestId });
    } catch (requestError) {
      if (axios.isCancel(requestError) || controller.signal.aborted) return;
      dispatchReport({
        type: 'error',
        tab,
        requestId,
        message: 'The selected report could not be loaded. Confirm your Admin session and try again.'
      });
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [activeTab, customerPeriod, orderEndDate, orderStartDate, productLimit, productSort, salesPeriod]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 0);
    return () => {
      window.clearTimeout(timer);
      activeRequest.current?.abort();
    };
  }, [loadReport]);

  const selectTab = (tab: ReportTab) => {
    if (tab === activeTab) return;
    activeRequest.current?.abort();
    const requestId = ++requestSequence.current;
    dispatchReport({ type: 'request', tab, requestId });
    setFilterError('');
    setExportMessage('');
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`/reports?${params.toString()}`, { scroll: false });
  };

  const exportReport = async () => {
    if (exporting || !exportableTabs.has(activeTab)) return;
    setExporting(true);
    setExportMessage('');

    try {
      const response = await api.get(`/reports/export/${activeTab}`, {
        responseType: 'blob'
      });
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'text/csv' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${activeTab}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setExportMessage('Export downloaded.');
    } catch {
      setExportMessage('Export matches too many records or is unavailable. Please narrow your date range or filters.');
    } finally {
      setExporting(false);
    }
  };

  const renderControls = () => {
    if (activeTab === 'sales') return <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Group sales by<select value={salesPeriod} onChange={(event) => setSalesPeriod(event.target.value)} style={{ marginLeft: '8px', padding: '9px 11px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text-primary)' }}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>;
    if (activeTab === 'products') return <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}><label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Sort products by<select value={productSort} onChange={(event) => setProductSort(event.target.value)} style={{ marginLeft: '8px', padding: '9px 11px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text-primary)' }}><option value="soldCount">Units sold</option><option value="stock">Stock</option><option value="price">Price</option></select></label><label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Limit<select value={productLimit} onChange={(event) => setProductLimit(event.target.value)} style={{ marginLeft: '8px', padding: '9px 11px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text-primary)' }}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label></div>;
    if (activeTab === 'customers') return <label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>New-customer period<select value={customerPeriod} onChange={(event) => setCustomerPeriod(event.target.value)} style={{ marginLeft: '8px', padding: '9px 11px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text-primary)' }}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>;
    return <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}><label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>Start date<input type="date" value={orderStartDate} onChange={(event) => setOrderStartDate(event.target.value)} style={{ marginLeft: '8px', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text-primary)' }} /></label><label style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800' }}>End date<input type="date" value={orderEndDate} onChange={(event) => setOrderEndDate(event.target.value)} style={{ marginLeft: '8px', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text-primary)' }} /></label></div>;
  };

  const renderData = (validatedReport: ValidatedReport) => {
    if (validatedReport.tab === 'sales') {
      const report = validatedReport.data;
      return <><section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '18px' }}><KpiCard label="Revenue" value={currencyFormatter.format(report.summary.totalRevenue)} icon={TrendingUp} /><KpiCard label="Orders" value={numberFormatter.format(report.summary.totalOrders)} icon={ShoppingCart} /><KpiCard label="Average order value" value={currencyFormatter.format(report.summary.averageOrderValue)} icon={BarChart3} /><KpiCard label="Payment methods" value={numberFormatter.format(report.paymentMethods.length)} icon={FileSpreadsheet} /></section><section style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}><div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}><h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '800' }}>Sales by period</h2></div>{report.chartData.length === 0 ? <EmptyReport message="No non-cancelled sales were recorded for this report period." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse' }}><thead><tr style={{ background: 'var(--bg-primary)' }}>{['Period', 'Orders', 'Revenue'].map((heading) => <th key={heading} style={{ padding: '12px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px' }}>{heading}</th>)}</tr></thead><tbody>{report.chartData.map((row) => <tr key={row.date} style={{ borderTop: '1px solid var(--border-color)' }}><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '700' }}>{row.date}</td><td style={{ padding: '13px 15px', color: 'var(--text-secondary)' }}>{numberFormatter.format(row.orders)}</td><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '800' }}>{currencyFormatter.format(row.revenue)}</td></tr>)}</tbody></table></div>}</section></>;
    }

    if (validatedReport.tab === 'products') {
      const report = validatedReport.data;
      return <><section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '18px' }}><KpiCard label="Total products" value={numberFormatter.format(report.totalProducts)} icon={Package} /><KpiCard label="Out of stock" value={numberFormatter.format(report.outOfStockCount)} icon={AlertCircle} /><KpiCard label="Low-stock records" value={numberFormatter.format(report.lowStockProducts.length)} icon={Box} /><KpiCard label="Reported categories" value={numberFormatter.format(report.categoryStats.length)} icon={BarChart3} /></section><section style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}><div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}><h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '800' }}>Product performance</h2></div>{report.topProducts.length === 0 ? <EmptyReport message="No products are available for this report." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse' }}><thead><tr style={{ background: 'var(--bg-primary)' }}>{['Product', 'Price', 'Stock', 'Units sold'].map((heading) => <th key={heading} style={{ padding: '12px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px' }}>{heading}</th>)}</tr></thead><tbody>{report.topProducts.map((product) => <tr key={product._id} style={{ borderTop: '1px solid var(--border-color)' }}><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '700' }}>{product.name}</td><td style={{ padding: '13px 15px', color: 'var(--text-primary)' }}>{currencyFormatter.format(product.price)}</td><td style={{ padding: '13px 15px', color: 'var(--text-secondary)' }}>{numberFormatter.format(product.stock)}</td><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '800' }}>{numberFormatter.format(product.soldCount)}</td></tr>)}</tbody></table></div>}</section></>;
    }

    if (validatedReport.tab === 'customers') {
      const report = validatedReport.data;
      const growth = Number(report.summary.growthRate);
      return <><section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '18px' }}><KpiCard label="Total customers" value={numberFormatter.format(report.summary.totalCustomers)} icon={Users} /><KpiCard label={`New in ${customerPeriod} days`} value={numberFormatter.format(report.summary.newCustomers)} icon={TrendingUp} /><KpiCard label="New / total" value={`${Number.isFinite(growth) ? growth.toFixed(2) : '0.00'}%`} icon={BarChart3} /><KpiCard label="Top spenders shown" value={numberFormatter.format(report.topSpenders.length)} icon={FileSpreadsheet} /></section><section style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}><div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}><h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '800' }}>Top customers by spend</h2></div>{report.topSpenders.length === 0 ? <EmptyReport message="No customer spending is available for this report." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}><thead><tr style={{ background: 'var(--bg-primary)' }}>{['Customer', 'Email', 'Orders', 'Total spent'].map((heading) => <th key={heading} style={{ padding: '12px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px' }}>{heading}</th>)}</tr></thead><tbody>{report.topSpenders.map((customer) => <tr key={customer.userId} style={{ borderTop: '1px solid var(--border-color)' }}><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '700' }}>{customer.fullName}</td><td style={{ padding: '13px 15px', color: 'var(--text-secondary)' }}>{customer.email}</td><td style={{ padding: '13px 15px', color: 'var(--text-secondary)' }}>{numberFormatter.format(customer.orderCount)}</td><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '800' }}>{currencyFormatter.format(customer.totalSpent)}</td></tr>)}</tbody></table></div>}</section></>;
    }

    const report = validatedReport.data;
    return <><section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '18px' }}><KpiCard label="Total orders" value={numberFormatter.format(report.totalOrders)} icon={ShoppingCart} /><KpiCard label="Average processing" value={report.avgProcessingTime} icon={CalendarDays} /><KpiCard label="Statuses represented" value={numberFormatter.format(report.statusBreakdown.length)} icon={BarChart3} /><KpiCard label="Recent orders shown" value={numberFormatter.format(report.recentOrders.length)} icon={FileSpreadsheet} /></section><section style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}><div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}><h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '800' }}>Recent orders</h2></div>{report.recentOrders.length === 0 ? <EmptyReport message="No orders are available for this report period." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse' }}><thead><tr style={{ background: 'var(--bg-primary)' }}>{['Order', 'Customer', 'Status', 'Total', 'Created'].map((heading) => <th key={heading} style={{ padding: '12px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px' }}>{heading}</th>)}</tr></thead><tbody>{report.recentOrders.map((order) => <tr key={order._id} style={{ borderTop: '1px solid var(--border-color)' }}><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '700' }}>{order.orderId || order._id}</td><td style={{ padding: '13px 15px', color: 'var(--text-secondary)' }}>{order.user?.fullName || 'Guest or unavailable'}</td><td style={{ padding: '13px 15px', color: 'var(--text-primary)' }}>{order.orderStatus}</td><td style={{ padding: '13px 15px', color: 'var(--text-primary)', fontWeight: '800' }}>{currencyFormatter.format(order.totalAmount)}</td><td style={{ padding: '13px 15px', color: 'var(--text-secondary)' }}>{dateFormatter.format(new Date(order.createdAt))}</td></tr>)}</tbody></table></div>}</section></>;
  };

  const visibleReport = reportForTab(reportState, activeTab);
  const loading = reportState.tab !== activeTab || reportState.status === 'loading';
  const error = reportState.tab === activeTab && reportState.status === 'error'
    ? reportState.message
    : '';

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div><h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Reports</h1><p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Operational reporting from the protected report endpoints.</p></div>
        <div style={{ textAlign: 'right' }}><button type="button" onClick={() => void exportReport()} disabled={exporting || !exportableTabs.has(activeTab)} title={activeTab === 'sales' ? 'Sales export is not supported by the backend.' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 15px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg)', color: exportableTabs.has(activeTab) ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: '800', cursor: exporting || !exportableTabs.has(activeTab) ? 'not-allowed' : 'pointer', opacity: exportableTabs.has(activeTab) ? 1 : 0.65 }}>{exporting ? <Loader className="animate-spin" size={16} /> : <Download size={16} />} {exporting ? 'Exporting…' : 'Export CSV'}</button>{activeTab === 'sales' && <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '5px' }}>Sales CSV is not available from the current API.</p>}{exportMessage && <p role="status" style={{ color: exportMessage.includes('downloaded') ? 'var(--success-text)' : 'var(--danger-text)', fontSize: '11px', marginTop: '5px' }}>{exportMessage}</p>}</div>
      </header>

      <div role="tablist" aria-label="Report types" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '18px' }}>{reportTabs.map((tab) => { const Icon = tab.icon; const selected = activeTab === tab.value; return <button key={tab.value} type="button" role="tab" aria-selected={selected} onClick={() => selectTab(tab.value)} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', padding: '10px 14px', border: selected ? '1px solid var(--primary)' : '1px solid var(--border-color)', borderRadius: '8px', background: selected ? 'var(--primary-light)' : 'var(--card-bg)', color: selected ? 'var(--accent-text)' : 'var(--text-secondary)', fontWeight: '800', cursor: 'pointer' }}><Icon size={16} /> {tab.label}</button>; })}</div>

      <section style={{ ...cardStyle, marginBottom: '18px' }}>{renderControls()}{filterError && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--danger-text)', fontSize: '12px', fontWeight: '700', marginTop: '10px' }}><AlertCircle size={15} /> {filterError}</div>}</section>

      {loading ? <div style={{ minHeight: '300px', display: 'grid', placeItems: 'center', ...cardStyle }}><Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading report" /></div> : error ? <div role="alert" style={{ padding: '42px 20px', textAlign: 'center', border: '1px solid var(--danger-text)', borderRadius: '12px', background: 'var(--card-bg)' }}><AlertCircle size={38} color="var(--danger-text)" style={{ margin: '0 auto 12px' }} /><h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Report unavailable</h2><p style={{ color: 'var(--danger-text)', fontSize: '13px', marginBottom: '16px' }}>{error}</p><button type="button" onClick={() => void loadReport()} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 14px', border: 0, borderRadius: '8px', background: 'var(--primary)', color: '#0B132B', fontWeight: '800', cursor: 'pointer' }}><RefreshCw size={16} /> Retry</button></div> : filterError ? null : visibleReport ? renderData(visibleReport) : null}
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<div style={{ minHeight: '300px', display: 'grid', placeItems: 'center' }}><Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading reports view" /></div>}><ReportsView /></Suspense>;
}
