/**
 * Canonical Storefront Order Navigation and Route Helper
 *
 * Identifier Contracts:
 * - Invoice routes MUST be built exclusively with canonical database `_id` (24-hex ObjectId)
 *   to match backend `GET /api/account/orders/:id/invoice` which strictly validates `schemas.idParam`.
 * - Invoice routes MUST NOT fall back to public `orderId` (`ORD-...`).
 * - If `_id` is missing/empty, `buildInvoiceRoute` returns null to prevent generating broken URLs.
 * - Order Details routes preserve public `orderId` or canonical `_id` as supported by
 *   backend `GET /api/orders/:id` via `orderReferenceSchema`.
 */

export function buildInvoiceRoute(orderId: string | null | undefined): string | null {
  if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
    return null;
  }
  return `/orders/${encodeURIComponent(orderId.trim())}/invoice`;
}

export function buildOrderDetailsRoute(
  order: { _id?: string | null; orderId?: string | null } | null | undefined
): string | null {
  if (!order) return null;
  const ref = order.orderId?.trim() || order._id?.trim();
  if (!ref) return null;
  return `/orders/${encodeURIComponent(ref)}`;
}
