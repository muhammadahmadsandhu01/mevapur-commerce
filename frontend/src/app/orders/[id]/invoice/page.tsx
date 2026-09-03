'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { accountService } from '@/services/account.service';
import { branding } from '@/config/branding';

type Invoice = { orderNumber: string; date: string; customer: { fullName: string }; shippingAddress: { fullName: string; address: string; addressLine2?: string; city: string; province?: string; postalCode?: string; country: string }; items: Array<{ name: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }>; subtotal: number; discount: number; shipping: number; tax: number; total: number; currency: string; paymentMethod: string; paymentStatus: string };
export default function InvoicePage() {
  const params = useParams<{ id: string }>(); const [invoice, setInvoice] = useState<Invoice | null>(null); const [error, setError] = useState('');
  const load = useCallback(async () => { try { const result = await accountService.invoice(params.id) as { invoice: Invoice }; setInvoice(result.invoice); } catch { setError('This invoice is unavailable.'); } }, [params.id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  if (error) return <main style={{ padding: 32 }}><p role="alert">{error}</p><Link href="/orders">Back to orders</Link></main>;
  if (!invoice) return <main style={{ padding: 32 }}>Loading invoice…</main>;
  const money = (value: number) => `${invoice.currency} ${Number(value || 0).toFixed(2)}`;
  return <main style={{ maxWidth: 850, margin: '0 auto', padding: 32 }}><div className="print-hidden"><Link href={`/orders/${params.id}`}>Back to order</Link> <button onClick={() => window.print()}>Print invoice</button></div><header><h1>{branding.siteName} Receipt</h1><p>Order {invoice.orderNumber}</p><p>{new Date(invoice.date).toLocaleDateString()}</p></header><section><h2>Customer & shipping</h2><p><strong>{invoice.customer.fullName}</strong><br />{invoice.shippingAddress.address}<br />{invoice.shippingAddress.addressLine2}<br />{invoice.shippingAddress.city}, {invoice.shippingAddress.province} {invoice.shippingAddress.postalCode}<br />{invoice.shippingAddress.country}</p></section><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th align="left">Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>{invoice.items.map((item) => <tr key={`${item.sku}-${item.name}`}><td>{item.name}</td><td align="center">{item.quantity}</td><td align="right">{money(item.unitPrice)}</td><td align="right">{money(item.lineTotal)}</td></tr>)}</tbody></table><section style={{ marginTop: 24, textAlign: 'right' }}><p>Subtotal: {money(invoice.subtotal)}</p><p>Discount: {money(invoice.discount)}</p><p>Shipping: {money(invoice.shipping)}</p><p>Tax: {money(invoice.tax)}</p><h2>Total: {money(invoice.total)}</h2><p>Payment: {invoice.paymentMethod} — {invoice.paymentStatus}</p></section><style>{'@media print { .print-hidden { display: none; } }'}</style></main>;
}
