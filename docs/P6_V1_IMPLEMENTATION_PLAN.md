# HARZAAR P6 — Bounded v1 Implementation Plan

## Guardrails

This is an implementation plan, not implementation. It preserves the sealed P0–P5E baseline, raw payment-webhook ordering, auth/token contract, server-side order totals, order reservation/idempotency, provider enablement gates, and buyer-configurable HARZAAR brand boundary. No new framework, provider activation, broad rewrite, or real external call is needed for P6 v1.

## Delivery sequence

`P6A → focused tests → P6B → focused tests → P6C → focused tests → P6D full regression`.

Each stream is a separately reviewable change set. Do not combine shipping/market schema changes with unrelated visual rewrites.

## P6A — Catalog + Inventory + Markets + Shipping

**Capabilities**

- Align product search/filter identifier contracts and persist only validated catalog fields.
- Repair inventory adjustment and order-tracking route contracts; make adjustments transaction-safe and variant-aware where the existing product variant model permits.
- Add a minimal configuration-driven market/shipping domain: home country, selling mode, enabled countries, default currency, zones, remote classification, rates, thresholds, delivery windows, and payment-method visibility context.
- Seed/configure the Pakistan demo defaults as data: below PKR 5,000 = PKR 250; at/above PKR 5,000 = free; remote default = PKR 350; city/other/remote windows = 2–4/3–5/4–7 business days. They must be editable defaults, not universal source constants.
- Replace duplicate backend/storefront shipping calculation with a single server quote contract.

**Likely active modules/pages**

- `backend/models/Product.js`, `backend/models/Order.js`, and new narrowly scoped market/shipping persistence only if the existing `Setting` singleton cannot safely model zone rules.
- `backend/controllers/productController.js`, `inventoryController.js`, `backend/services/order/ShippingService.js`, `InventoryService.js`, `OrderService.js` and their validators/routes.
- `backend/routes/inventoryRoutes.js`, `orderRoutes.js`, setting/market/shipping routes.
- `frontend/src/app/products/page.tsx`, `frontend/src/app/search/page.tsx`, `frontend/src/components/products/ProductFilters.tsx`, `frontend/src/lib/checkout/pricing.ts`, checkout payment/quote client.
- `admin-panel/src/app/inventory/page.tsx`, `admin-panel/src/app/orders/[id]/page.tsx`, settings plus new bounded shipping/market admin pages.

**Focused tests**

- Product keyword/category/brand/filter query validation and ID/slug contract tests.
- Atomic adjustment, variant adjustment, low-stock and inventory history tests.
- Shipping-zone threshold/remote/country quote tests; no client-provided total can override the quote.
- Admin route-contract tests for inventory adjustment and tracking update.

**Acceptance criteria**

- All P6A UI calls resolve to active routes; no `PUT /inventory/:id` or unsupported order tracking call remains.
- A configured zone quote is authoritative at order creation; unconfigured countries cannot checkout.
- Pakistan defaults yield exactly 250/0/350 as configured, and modifying configuration changes quotes without code edits.
- Existing order inventory reservation/cancellation tests stay green; no payment provider is called.

**Dependencies**: existing product/order/setting services and sealed P0–P2 contracts.

## P6B — Search + Promotions + Customer Commerce

**Capabilities**

- Make global search/autocomplete/filter state use one validated API contract; remove UI-only filters or implement only fields actually supported by catalogue data.
- Complete the customer commerce loop: saved profile/addresses, account-backed wishlist, order tracking timeline, customer review submission/display, return request/refund visibility, and invoice/receipt access.
- Improve coupon feedback while preserving server-side CouponService as final authority.
- Add only the smallest automatic-promotion rule model if time remains; it is P2 and must not delay P0/P1 flows.

**Likely active modules/pages**

- `backend/models/User.js`, `Review.js`, `Return.js`, `Refund.js`, optional invoice artifact/service; customer-facing routes/controllers/validators.
- `backend/services/order/CouponService.js`, order/read models and notification API where customer events are required.
- `frontend/src/app/search/page.tsx`, products/PDP/cart/checkout, `store/cartStore.ts`, wishlist, orders/order-detail, and new account/address/returns views.

**Focused tests**

- Search/filter API integration and input-limit tests.
- Ownership tests for addresses, wishlist, reviews, returns/refunds, and invoice downloads.
- Coupon preview versus server final-total tests.
- Return state/refund/restock idempotency tests; customer cannot view another customer's artifacts.

**Acceptance criteria**

- Browser storage holds no auth token and no authoritative account wishlist/address state.
- Customer may safely manage addresses and view only their orders, returns, refunds, tracking and receipts.
- Reviews/returns have validated, ownership-safe flows; no customer action can mutate inventory/payment directly.
- All checkout totals remain derived server-side.

**Dependencies**: P6A market/shipping quote contract; sealed authentication/session middleware.

## P6C — Modern Storefront UX + Admin Operational Polish

**Capabilities**

- Convert the active storefront, not a parallel redesign: prominent search, coherent category discovery, configurable multi-category homepage, polished cards/grids/PDP, one checkout path, account/order surfaces, responsive navigation, clear loading/empty/error recovery and accessible forms/focus behaviour.
- Replace static PDP delivery/return/trust text with configured content; hide unavailable capabilities rather than implying universal availability.
- Finish operational admin: dashboard summaries, product/media/variant forms aligned to schemas, inventory/order/return/refund/coupon workflows, settings, shipping/market/currency controls, activity-log export or removal of its unavailable action.

**Likely active modules/pages**

- `frontend/src/components/layout/*`, `components/products/*`, `app/page.tsx`, product/PDP/cart/checkout/search/orders/wishlist/account routes, global styles and existing HARZAAR brand components.
- `admin-panel/src/components/layout/*`, dashboard, product, inventory, orders, settings, activity-log and operations pages.
- Only the already-defined API contracts from P6A/P6B; do not invent client-only business rules.

**Focused tests**

- Component/API contract tests for disabled/unavailable states, quote display and error recovery.
- Keyboard/focus, labels, empty/loading/error tests for highest-traffic journeys.
- Admin request tests for each mutating operation and role denial.

**Acceptance criteria**

- No legacy direct order creation remains outside the supported checkout service.
- Mobile customer flows work at narrow widths without hidden critical actions.
- Every displayed shipping/payment/delivery/return promise is configured or explicitly unavailable.
- Admin operations do not expose controls with missing endpoints.

**Dependencies**: P6A and P6B API contracts; P5E branding tokens/components remain authoritative.

## P6D — Final hardening + v1 regression

**Capabilities**

- Re-run the sealed baseline plus new focused suites; audit active imports/routes/error codes; test all configured payment editions without external provider calls.
- Recheck raw payment webhook before `express.json()`, app import without listener, session/token behaviour, no browser token persistence, server-authoritative totals, inventory concurrency, market/shipping eligibility, and customer ownership boundaries.
- Run storefront/admin type checking, lint and builds once the implementation streams are complete; record exact failures rather than weakening rules.

**Likely active modules/pages**: test suites under `backend/tests`, active API clients, and only P6A–P6C changed files.

**Focused tests**

- Unit/integration coverage for quote selection, order placement, inventory adjustment, provider eligibility, customer isolation, returns/refunds, and admin permissions.
- Browser/static scan for retired endpoints, unsupported admin endpoints, local token storage and static commerce claims.

**Acceptance criteria**

- P0–P6 tests/checks pass without using a live production database or external provider.
- All changed client routes map to active backend contracts; all non-configured methods/states are safely unavailable.
- P6 implementation diff contains no unrelated order/payment provider rewrite and preserves raw webhook ordering.

**Dependencies**: completed P6A–P6C and a deliberately captured pre-P6D baseline.

## Start recommendation

Implementation may start immediately with **P6A only**. Its first change should be a small, reviewed API contract inventory for active inventory/order tracking/search/shipping calls, followed by the market/shipping quote domain. Do not start P6B/P6C until that contract is settled.
