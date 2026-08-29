export type ReportTab = 'sales' | 'products' | 'customers' | 'orders';

export interface SalesReport {
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    period: string;
  };
  chartData: Array<{ date: string; revenue: number; orders: number }>;
  paymentMethods: Array<{ _id: string | null; count: number; total: number }>;
}

export interface ProductRecord {
  _id: string;
  name: string;
  price: number;
  stock: number;
  soldCount: number;
  category?: string;
}

export interface ProductReport {
  topProducts: ProductRecord[];
  categoryStats: Array<{
    _id: string | null;
    totalSales: number;
    totalRevenue: number;
    productCount: number;
  }>;
  lowStockProducts: ProductRecord[];
  outOfStockCount: number;
  totalProducts: number;
}

export interface CustomerReport {
  summary: {
    totalCustomers: number;
    newCustomers: number;
    growthRate: number | string;
  };
  topSpenders: Array<{
    userId: string;
    fullName: string;
    email: string;
    totalSpent: number;
    orderCount: number;
  }>;
  customerGrowth: Array<{ date: string; newCustomers: number }>;
}

export interface OrderReport {
  statusBreakdown: Array<{
    _id: string | null;
    count: number;
    totalValue: number;
  }>;
  recentOrders: Array<{
    _id: string;
    orderId?: string;
    user?: { fullName?: string; email?: string } | null;
    totalAmount: number;
    orderStatus: string;
    createdAt: string;
  }>;
  avgProcessingTime: string;
  totalOrders: number;
}

export type ValidatedReport =
  | { tab: 'sales'; data: SalesReport }
  | { tab: 'products'; data: ProductReport }
  | { tab: 'customers'; data: CustomerReport }
  | { tab: 'orders'; data: OrderReport };

export type ReportLoadState =
  | { status: 'idle' | 'loading'; tab: ReportTab; requestId: number }
  | { status: 'success'; tab: ReportTab; requestId: number; report: ValidatedReport }
  | { status: 'error'; tab: ReportTab; requestId: number; message: string };

export type ReportLoadAction =
  | { type: 'request'; tab: ReportTab; requestId: number }
  | { type: 'idle'; tab: ReportTab; requestId: number }
  | { type: 'success'; report: ValidatedReport; requestId: number }
  | { type: 'error'; tab: ReportTab; requestId: number; message: string };

const reportTabs: ReportTab[] = ['sales', 'products', 'customers', 'orders'];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null => (
  value === null || isString(value)
);
const isOptionalString = (value: unknown): value is string | undefined => (
  value === undefined || isString(value)
);
const isValidDateString = (value: unknown): value is string => (
  isString(value) && Number.isFinite(new Date(value).getTime())
);
const isArrayOf = <T>(
  value: unknown,
  validator: (entry: unknown) => entry is T
): value is T[] => Array.isArray(value) && value.every(validator);

export const isReportTab = (value: string | null): value is ReportTab => (
  reportTabs.some((tab) => tab === value)
);

const isProductRecord = (value: unknown): value is ProductRecord => (
  isRecord(value)
  && isString(value._id)
  && isString(value.name)
  && isFiniteNumber(value.price)
  && isFiniteNumber(value.stock)
  && isFiniteNumber(value.soldCount)
  && isOptionalString(value.category)
);

const isSalesReport = (value: unknown): value is SalesReport => {
  if (!isRecord(value) || !isRecord(value.summary)) return false;

  return isFiniteNumber(value.summary.totalRevenue)
    && isFiniteNumber(value.summary.totalOrders)
    && isFiniteNumber(value.summary.averageOrderValue)
    && isString(value.summary.period)
    && isArrayOf(value.chartData, (entry): entry is SalesReport['chartData'][number] => (
      isRecord(entry)
      && isString(entry.date)
      && isFiniteNumber(entry.revenue)
      && isFiniteNumber(entry.orders)
    ))
    && isArrayOf(value.paymentMethods, (entry): entry is SalesReport['paymentMethods'][number] => (
      isRecord(entry)
      && isNullableString(entry._id)
      && isFiniteNumber(entry.count)
      && isFiniteNumber(entry.total)
    ));
};

const isProductReport = (value: unknown): value is ProductReport => (
  isRecord(value)
  && isArrayOf(value.topProducts, isProductRecord)
  && isArrayOf(value.lowStockProducts, isProductRecord)
  && isArrayOf(value.categoryStats, (entry): entry is ProductReport['categoryStats'][number] => (
    isRecord(entry)
    && isNullableString(entry._id)
    && isFiniteNumber(entry.totalSales)
    && isFiniteNumber(entry.totalRevenue)
    && isFiniteNumber(entry.productCount)
  ))
  && isFiniteNumber(value.outOfStockCount)
  && isFiniteNumber(value.totalProducts)
);

const isCustomerReport = (value: unknown): value is CustomerReport => {
  if (!isRecord(value) || !isRecord(value.summary)) return false;

  const growthRate = Number(value.summary.growthRate);
  return isFiniteNumber(value.summary.totalCustomers)
    && isFiniteNumber(value.summary.newCustomers)
    && (isString(value.summary.growthRate) || isFiniteNumber(value.summary.growthRate))
    && Number.isFinite(growthRate)
    && isArrayOf(value.topSpenders, (entry): entry is CustomerReport['topSpenders'][number] => (
      isRecord(entry)
      && isString(entry.userId)
      && isString(entry.fullName)
      && isString(entry.email)
      && isFiniteNumber(entry.totalSpent)
      && isFiniteNumber(entry.orderCount)
    ))
    && isArrayOf(value.customerGrowth, (entry): entry is CustomerReport['customerGrowth'][number] => (
      isRecord(entry)
      && isString(entry.date)
      && isFiniteNumber(entry.newCustomers)
    ));
};

const isOrderReport = (value: unknown): value is OrderReport => (
  isRecord(value)
  && isArrayOf(value.statusBreakdown, (entry): entry is OrderReport['statusBreakdown'][number] => (
    isRecord(entry)
    && isNullableString(entry._id)
    && isFiniteNumber(entry.count)
    && isFiniteNumber(entry.totalValue)
  ))
  && isArrayOf(value.recentOrders, (entry): entry is OrderReport['recentOrders'][number] => (
    isRecord(entry)
    && isString(entry._id)
    && isOptionalString(entry.orderId)
    && (
      entry.user === undefined
      || entry.user === null
      || (
        isRecord(entry.user)
        && isOptionalString(entry.user.fullName)
        && isOptionalString(entry.user.email)
      )
    )
    && isFiniteNumber(entry.totalAmount)
    && isString(entry.orderStatus)
    && isValidDateString(entry.createdAt)
  ))
  && isString(value.avgProcessingTime)
  && isFiniteNumber(value.totalOrders)
);

export const validateReportData = (
  tab: ReportTab,
  value: unknown
): ValidatedReport | null => {
  if (tab === 'sales' && isSalesReport(value)) return { tab, data: value };
  if (tab === 'products' && isProductReport(value)) return { tab, data: value };
  if (tab === 'customers' && isCustomerReport(value)) return { tab, data: value };
  if (tab === 'orders' && isOrderReport(value)) return { tab, data: value };
  return null;
};

export const initialReportState = (tab: ReportTab): ReportLoadState => ({
  status: 'loading',
  tab,
  requestId: 0
});

export const reportLoadReducer = (
  state: ReportLoadState,
  action: ReportLoadAction
): ReportLoadState => {
  if (action.type === 'request') {
    if (action.requestId < state.requestId) return state;
    return { status: 'loading', tab: action.tab, requestId: action.requestId };
  }

  const actionTab = action.type === 'success' ? action.report.tab : action.tab;
  if (action.requestId !== state.requestId || actionTab !== state.tab) return state;

  if (action.type === 'success') {
    return {
      status: 'success',
      tab: action.report.tab,
      requestId: action.requestId,
      report: action.report
    };
  }
  if (action.type === 'error') {
    return {
      status: 'error',
      tab: action.tab,
      requestId: action.requestId,
      message: action.message
    };
  }
  return { status: 'idle', tab: action.tab, requestId: action.requestId };
};

export const reportForTab = (
  state: ReportLoadState,
  tab: ReportTab
): ValidatedReport | null => (
  state.status === 'success'
  && state.tab === tab
  && state.report.tab === tab
    ? state.report
    : null
);
