import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialReportState,
  isReportTab,
  reportForTab,
  reportLoadReducer,
  validateReportData,
  type ReportLoadState,
  type ReportTab,
  type ValidatedReport
} from '../src/app/reports/reportData.ts';

const emptyPayloads = {
  sales: {
    summary: {
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      period: '30 days ago to today'
    },
    chartData: [],
    paymentMethods: []
  },
  products: {
    topProducts: [],
    categoryStats: [],
    lowStockProducts: [],
    outOfStockCount: 0,
    totalProducts: 0
  },
  customers: {
    summary: { totalCustomers: 0, newCustomers: 0, growthRate: 0 },
    topSpenders: [],
    customerGrowth: []
  },
  orders: {
    statusBreakdown: [],
    recentOrders: [],
    avgProcessingTime: '0 days',
    totalOrders: 0
  }
} as const;

const validated = (tab: ReportTab): ValidatedReport => {
  const report = validateReportData(tab, emptyPayloads[tab]);
  assert.ok(report);
  return report;
};

test('accepts every valid direct report tab and empty backend response', () => {
  for (const tab of ['sales', 'products', 'customers', 'orders'] as const) {
    assert.equal(isReportTab(tab), true);
    assert.deepEqual(validateReportData(tab, emptyPayloads[tab]), {
      tab,
      data: emptyPayloads[tab]
    });
  }
  assert.equal(isReportTab('inventory'), false);
});

test('rejects malformed runtime responses instead of exposing them to render code', () => {
  assert.equal(validateReportData('sales', { summary: {}, chartData: [] }), null);
  assert.equal(validateReportData('products', { ...emptyPayloads.products, lowStockProducts: undefined }), null);
  assert.equal(validateReportData('customers', { ...emptyPayloads.customers, topSpenders: null }), null);
  assert.equal(validateReportData('orders', {
    ...emptyPayloads.orders,
    recentOrders: [{
      _id: 'order-1',
      totalAmount: 100,
      orderStatus: 'Pending',
      createdAt: 'not-a-date'
    }]
  }), null);
});

test('Sales data is cleared from presentation as soon as Products is selected', () => {
  let state: ReportLoadState = initialReportState('sales');
  state = reportLoadReducer(state, { type: 'request', tab: 'sales', requestId: 1 });
  state = reportLoadReducer(state, { type: 'success', report: validated('sales'), requestId: 1 });
  assert.equal(reportForTab(state, 'sales')?.tab, 'sales');

  state = reportLoadReducer(state, { type: 'request', tab: 'products', requestId: 2 });
  assert.equal(state.status, 'loading');
  assert.equal(reportForTab(state, 'products'), null);
  assert.equal(reportForTab(state, 'sales'), null);

  state = reportLoadReducer(state, { type: 'success', report: validated('sales'), requestId: 1 });
  assert.equal(state.status, 'loading');
  assert.equal(state.tab, 'products');

  state = reportLoadReducer(state, { type: 'success', report: validated('products'), requestId: 2 });
  assert.equal(reportForTab(state, 'products')?.tab, 'products');
});

test('rapid tab changes ignore every late response except the selected tab', () => {
  let state: ReportLoadState = initialReportState('sales');
  const tabs = ['sales', 'products', 'customers', 'orders'] as const;

  tabs.forEach((tab, index) => {
    state = reportLoadReducer(state, { type: 'request', tab, requestId: index + 1 });
  });

  tabs.slice(0, -1).forEach((tab, index) => {
    state = reportLoadReducer(state, {
      type: 'success',
      report: validated(tab),
      requestId: index + 1
    });
    assert.equal(state.tab, 'orders');
    assert.equal(state.status, 'loading');
  });

  state = reportLoadReducer(state, {
    type: 'success',
    report: validated('orders'),
    requestId: 4
  });
  assert.equal(reportForTab(state, 'orders')?.tab, 'orders');
});

test('API failure stays inline and retry targets the same selected tab', () => {
  let state: ReportLoadState = initialReportState('customers');
  state = reportLoadReducer(state, { type: 'request', tab: 'customers', requestId: 1 });
  state = reportLoadReducer(state, {
    type: 'error',
    tab: 'customers',
    requestId: 1,
    message: 'Report unavailable'
  });
  assert.deepEqual(state, {
    status: 'error',
    tab: 'customers',
    requestId: 1,
    message: 'Report unavailable'
  });

  state = reportLoadReducer(state, { type: 'request', tab: 'customers', requestId: 2 });
  assert.equal(state.status, 'loading');
  assert.equal(state.tab, 'customers');
  state = reportLoadReducer(state, {
    type: 'success',
    report: validated('customers'),
    requestId: 2
  });
  assert.equal(reportForTab(state, 'customers')?.tab, 'customers');
});
