# P6B — HARZAAR Customer Commerce Implementation

## Result

P6B adds an authenticated customer-account boundary without changing P6A shipping, order-total, payment-provider, or authentication contracts. All P6B application, test, and documentation paths are listed in `docs/P6B_CHANGED_FILES.txt`.

## Customer contracts

- **Profile:** `GET/PATCH /api/account/profile`. Only `fullName`, `phone`, and an optional safe avatar URL are accepted; identity comes from the sealed session middleware.
- **Addresses:** `GET/POST/PATCH/DELETE /api/account/addresses`. Addresses belong only to the session user; enabled market-country validation runs before storage. Default address handling is server-side. Checkout can select a saved address or retain a one-time address.
- **Wishlist:** `GET`, `POST`, and `DELETE /api/account/wishlist/:productId`. `Wishlist` is a new account-backed persistence model with a user/product unique index. Anonymous local state remains temporary only; authenticated UI uses the account contract.
- **Reviews:** approved, unflagged public reviews are available from `GET /api/account/reviews/product/:productId`. Customers submit/edit/delete only their own review. Submission requires a delivered order containing that product; all new/edited reviews require moderation before public display. Review flagging is now admin-only.
- **Returns and refunds:** customer return requests are limited to their own delivered order inside the 30-day `RETURN_POLICY` boundary, with order-item/quantity validation. Customer routes cannot approve, refund, or restock. Customer return/refund lists expose only sanitized owner-scoped fields.
- **Return inventory safety:** `Return.inventoryRestockedAt` plus `ReturnInventoryService.restockOnce()` make admin operational restock transactional and replay-safe. The marker is explicitly selected in the service to prevent duplicate restock.
- **Invoice and tracking:** `GET /api/account/orders/:id/invoice` derives a printable receipt from stored order snapshots only. `GET /api/account/orders/:id/tracking` exposes actual status-history and configured courier/tracking fields only. The storefront provides a print-friendly invoice route and actual return-item links from delivered orders.
- **Notifications:** customer list, unread count, mark-one, and mark-all-read are owner-scoped through `/api/account/notifications`. Existing notification creation now requires admin.
- **Coupon UX:** checkout calls the existing non-reserving server preview endpoint for pending/valid/invalid/minimum-spend feedback. The preview is labelled non-final; `CouponService.validateAndReserve()` remains the only final order authority.

## Ownership and security rules

- Browser-supplied user IDs are never accepted as authority.
- Every new mutation has a strict Zod validator, bounded request fields, and authenticated server-side ownership filtering.
- Invoice, tracking, refund, address, wishlist, review, return, and notification records return `404` when not owned, avoiding cross-customer disclosure.
- No token or authoritative address/wishlist state is persisted by the P6B browser paths.
- No provider was activated or rewritten; no external database, payment, email, AI, SMS, or deployed service was accessed.

## Focused verification

| Check | Result |
|---|---|
| `npx.cmd jest tests/integration/customer-commerce.integration.test.js --runInBand --watchAll=false` | PASS — 1 suite, 7 tests, isolated MongoDB Memory ReplSet only. Covers profile mass-assignment rejection; address CRUD/default/country/ownership; wishlist duplicate/isolation; review eligibility/public moderation/ownership; return ownership/state/no customer restock; refund/invoice/tracking/notification isolation; coupon server feedback; and idempotent operational restock. |
| P6B changed backend `node --check` | PASS — all changed first-party backend JavaScript files. |
| `app.js` import under non-secret `NODE_ENV=test` | PASS — imports without opening a port. |
| Storefront `npx.cmd tsc --noEmit --incremental false` | PASS — 0 errors. |
| Storefront `npm.cmd run lint` | PASS — 0 errors, 27 historical warnings. P6B introduced no warnings; the count is lower than the P6A 31-warning baseline. |
| Static preservation | PASS — raw payment webhook remains before `express.json()`; no P6B sensitive browser storage; no package or lock-file diff. |

The known pre-P6B trailing whitespace at `frontend/src/app/products/[id]/page.tsx:9` remains unchanged.

## Remaining P6C work

P6C may improve visual hierarchy, responsive polish, account navigation presentation, accessibility, and broader storefront/admin operations. It must not replace the P6B ownership, invoice, return, market/shipping, or order-total contracts.

P6B HARZAAR CUSTOMER COMMERCE PASSED —
CORE CUSTOMER ACCOUNT, WISHLIST, REVIEWS, RETURNS AND INVOICE FLOWS READY
