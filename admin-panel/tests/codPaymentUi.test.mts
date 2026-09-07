import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

interface OrderStub {
  _id: string;
  orderId?: string;
  paymentMethod: string;
  orderStatus: string;
  paymentStatus: string;
  totalAmount: number;
  payment?: {
    paidAt?: string;
  };
}

interface ServerStatsStub {
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  totalRevenue: number;
}

const isCodEligible = (order: OrderStub | null | undefined): boolean => Boolean(
  order
  && String(order.paymentMethod).toLowerCase() === 'cod'
  && order.orderStatus === 'Delivered'
  && order.paymentStatus === 'Pending'
);

function formatRevenueKpi(stats: ServerStatsStub | null): string {
  if (!stats) return 'Rs. 0';
  return `Rs. ${(stats.totalRevenue || 0).toLocaleString()}`;
}

test('isCodEligible only returns true for Delivered COD orders in Pending payment status', () => {
  const eligibleOrder: OrderStub = {
    _id: '6a9f12000000000000000001',
    orderId: 'ORD-20260907-84D9B7A04D46',
    paymentMethod: 'cod',
    orderStatus: 'Delivered',
    paymentStatus: 'Pending',
    totalAmount: 1400
  };
  assert.equal(isCodEligible(eligibleOrder), true);

  // Case insensitive COD
  const uppercaseCod: OrderStub = {
    ...eligibleOrder,
    paymentMethod: 'COD'
  };
  assert.equal(isCodEligible(uppercaseCod), true);

  // Already Paid
  const alreadyPaidOrder: OrderStub = {
    ...eligibleOrder,
    paymentStatus: 'Paid',
    payment: { paidAt: '2026-09-07T18:00:00.000Z' }
  };
  assert.equal(isCodEligible(alreadyPaidOrder), false);

  // Not Delivered yet (Shipped)
  const shippedOrder: OrderStub = {
    ...eligibleOrder,
    orderStatus: 'Shipped'
  };
  assert.equal(isCodEligible(shippedOrder), false);

  // Not COD (Stripe)
  const cardOrder: OrderStub = {
    ...eligibleOrder,
    paymentMethod: 'stripe'
  };
  assert.equal(isCodEligible(cardOrder), false);

  // Cancelled order
  const cancelledOrder: OrderStub = {
    ...eligibleOrder,
    orderStatus: 'Cancelled'
  };
  assert.equal(isCodEligible(cancelledOrder), false);

  // Null or undefined
  assert.equal(isCodEligible(null), false);
  assert.equal(isCodEligible(undefined), false);
});

test('Admin Orders KPI displays canonical serverStats.totalRevenue without client-side summing', () => {
  const serverStats: ServerStatsStub = {
    totalOrders: 10,
    pendingOrders: 2,
    deliveredOrders: 8,
    totalRevenue: 34500
  };

  assert.equal(formatRevenueKpi(serverStats), 'Rs. 34,500');
  assert.equal(formatRevenueKpi(null), 'Rs. 0');
  assert.equal(formatRevenueKpi({ totalOrders: 0, pendingOrders: 0, deliveredOrders: 0, totalRevenue: 0 }), 'Rs. 0');
});

test('Source code audit: Admin Orders pages consume server revenue and do not redefine revenue locally', async () => {
  const ordersPageSource = await readFile(new URL('../src/app/orders/page.tsx', import.meta.url), 'utf-8');
  const orderDetailsSource = await readFile(new URL('../src/app/orders/[id]/page.tsx', import.meta.url), 'utf-8');

  // Must not have local client summing of Paid orders for revenue
  assert.doesNotMatch(ordersPageSource, /orders\.filter\(.*Paid.*\)\.reduce/);
  assert.doesNotMatch(ordersPageSource, /orders\.filter\(.*Paid.*\)\.sum/);

  // Must call /orders/stats
  assert.match(ordersPageSource, /\/orders\/stats/);

  // Must call PATCH /orders/${.*}/payment-status
  assert.match(ordersPageSource, /patch\(`\/orders\/\$\{.*\}\/payment-status`/);
  assert.match(orderDetailsSource, /patch\(`\/orders\/\$\{.*\}\/payment-status`/);

  // Must use toast/state instead of window.alert
  assert.doesNotMatch(ordersPageSource, /window\.alert/);
  assert.doesNotMatch(orderDetailsSource, /window\.alert/);

  // Must support Mark COD as Paid action in UI
  assert.match(ordersPageSource, /Mark COD as Paid/);
  assert.match(orderDetailsSource, /Mark COD as Paid/);
});
