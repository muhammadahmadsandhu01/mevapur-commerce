# HARZAAR P6 — Feature Gap Matrix

## Scope and method

P6 Task 1 is a current-code audit only. No application source, configuration, package, test, provider, database, build, or deployment action was performed. `P5E_FINAL_VERIFICATION_RESULTS.md` is the baseline: the sealed regression passed, but it does not prove the feature set below.

Each row is one capability group. A group is **COMPLETE** only where its active customer/admin path, backend behaviour, and persistence/validation are all present. Counts therefore count rows, not individual UI controls. `EXTERNAL_PROVIDER_BLOCKED` means the internal architecture is present but real provider enablement is intentionally unavailable without approved external configuration.

| Status | Count |
|---|---:|
| COMPLETE | 18 |
| PARTIAL | 48 |
| UI_ONLY | 3 |
| BACKEND_ONLY | 4 |
| MISSING | 14 |
| EXTERNAL_PROVIDER_BLOCKED | 3 |

## A — Catalog

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Categories and nested/subcategories | PARTIAL | P1 | Self-reference exists in `backend/models/Category.js`; public category listing is flat in `backend/controllers/categoryController.js` and the customer journey does not expose a nested browse contract. |
| Brands | COMPLETE | — | Persistent brand model and active public/admin routes: `backend/models/Brand.js`, `backend/routes/brandRoutes.js`. |
| Product base, category/brand associations, status | PARTIAL | P1 | `backend/models/Product.js` stores associations and `isActive`; public listing/controller filtering is legacy-style and create/update accepts raw bodies in `backend/controllers/productController.js`. |
| Product media/gallery and SKU | PARTIAL | P1 | Product images/gallery/SKU are persisted (`backend/models/Product.js`); no verified media lifecycle, validation, or admin upload workflow. |
| Attributes, specifications, configurable variants | PARTIAL | P1 | Product has attribute/variant subdocuments, but storefront filters use sample attributes and admin-field contracts are inconsistent: `frontend/src/components/products/ProductFilters.tsx`, `admin-panel/src/app/products/add/page.tsx`. |
| Variant price and variant inventory | PARTIAL | P1 | Variant price/salePrice/stock persist in `backend/models/Product.js`; operational adjustment targets product-level stock, not a selected variant (`backend/controllers/inventoryController.js`). |
| Sale price, featured/trending, related products | PARTIAL | P1 | Fields/endpoints exist (`backend/models/Product.js`, `backend/routes/productRoutes.js`), but sale presentation and related ranking are not a coherent managed commerce workflow. |
| Inventory-aware availability | COMPLETE | — | Order creation resolves active product/variant and atomically rejects insufficient stock in `backend/services/order/OrderService.js` and `InventoryService.js`. |

## B — Inventory

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Stock quantity and sold count | COMPLETE | — | Product root/variant `stock` and `soldCount` are persisted; order reservation updates them in `backend/models/Product.js`, `backend/services/order/InventoryService.js`. |
| Reserved-stock visibility | MISSING | P1 | No reserved quantity field exists in `backend/models/Product.js`; reservation is represented as immediate stock decrement. |
| Oversell protection and atomic order reservation | COMPLETE | — | Conditional `findOneAndUpdate` stock checks and transaction operation keys are in `backend/services/order/InventoryService.js:40-62`. |
| Cancellation/restock | COMPLETE | — | Reversal is implemented with an idempotent cancellation operation key in `backend/services/order/InventoryService.js:100-122`. |
| Refund/return restock; manual adjustment history | PARTIAL | P1 | `InventoryTransaction` exists, but manual adjustment reads/saves separately and return/refund restock is not one verified transaction: `backend/controllers/inventoryController.js:137`, `backend/models/InventoryTransaction.js`. |
| Low/out-of-stock state and admin controls | PARTIAL | P0 | Low-stock endpoint exists, but admin calls unsupported `PUT /inventory/:id` while active routes expose only `POST /adjust`/`POST /bulk-update`: `admin-panel/src/app/inventory/page.tsx:66`, `backend/routes/inventoryRoutes.js:23-24`. |

## C — Customer discovery

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Global search | PARTIAL | P0 | Backend supports `keyword`, but active search page sends `search`: `backend/controllers/productController.js:16-20`, `frontend/src/app/search/page.tsx:28`. |
| Autocomplete/suggestions | COMPLETE | — | `autocomplete=true` is handled by product listing (`backend/controllers/productController.js:90`) and Navbar uses the supported helper in `frontend/src/lib/api.ts`. |
| Category/brand discovery and server filters | PARTIAL | P1 | Backend expects association ObjectIds; the separate search page uses category strings, creating a slug/ID contract split. |
| Price, availability, sorting and pagination | PARTIAL | P1 | Server supports these in `productController`; client filter surface includes controls with no matching backend contract. |
| Dynamic attributes; discount/delivery filters | UI_ONLY | P1 | Sample attributes and extra filters are rendered client-side without a usable API contract: `frontend/src/components/products/ProductFilters.tsx:372-373`. |
| Typo tolerance and synonyms | MISSING | P2 | No synonym dictionary, normalized search strategy, or typo service is referenced by active search code. |
| Recently viewed, recommendations and wishlist | PARTIAL | P1 | Recommendation/recent endpoints exist, while viewed/wishlist state is browser-local in `frontend/src/store/cartStore.ts`; no account synchronisation exists. |

## D — Product detail experience

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Gallery, title/brand, price/sale, stock, variant/specification display | PARTIAL | P1 | PDP consumes product/variant image data (`frontend/src/app/products/[id]/page.tsx`), but no verified sale-price/specification contract is consistently presented. |
| Quantity and add-to-cart | COMPLETE | — | PDP quantity and cart-store path are active; final order stock validation remains server authoritative. |
| Wishlist and related/recommended products | PARTIAL | P1 | Wishlist is local-only; recommendations are simple endpoint ranking rather than product-managed relations. |
| Delivery, return and trust information | UI_ONLY | P0 | PDP presents static informational claims without consuming shipping/return configuration: `frontend/src/app/products/[id]/page.tsx`. |
| Reviews and ratings | BACKEND_ONLY | P1 | Review persistence/admin moderation exists (`backend/models/Review.js`, `backend/routes/reviewRoutes.js`); customer creation and public PDP rendering are not active. |
| Responsive mobile PDP | PARTIAL | P1 | Responsive layout exists, but the journey lacks tested delivery/returns/review states and modern accessibility evidence. |

## E — Cart and checkout

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Cart and quantity control | COMPLETE | — | Persisted cart state is in `frontend/src/store/cartStore.ts`; checkout builds an order payload through active services. |
| Final stock revalidation | COMPLETE | — | Server-side order transaction resolves current products and reserves stock: `backend/services/order/OrderService.js`, `InventoryService.js`. |
| Coupon and shipping calculation | PARTIAL | P0 | Coupon is revalidated server-side, but pricing UI duplicates different hardcoded shipping rules: `backend/services/order/ShippingService.js`, `frontend/src/lib/checkout/pricing.ts:12-31`. |
| Address and country selection | PARTIAL | P0 | Address is collected, but storefront payment service defaults country/currency to Pakistan/PKR and no market configuration drives it. |
| Billing-versus-shipping distinction | MISSING | P1 | Order schema/request flow contains shipping address only: `backend/models/Order.js`, `backend/validators/orderValidator.js`. |
| Payment-method eligibility | PARTIAL | P0 | Registry supports eligibility concepts, but order/payment client sends PKR/Pakistan defaults: `backend/services/order/OrderService.js:270`, `frontend/src/services/payment.service.ts`. |
| Order review, final totals and tax abstraction | PARTIAL | P0 | Final order totals are server calculated, but checkout preview is local and tax service is a zero-value stub: `backend/services/order/OrderService.js:255-289`, `frontend/src/lib/checkout/pricing.ts`. |
| Idempotent placement and success flow | COMPLETE | — | Idempotency header/model/service path is active in `backend/routes/orderRoutes.js` and `backend/services/order/OrderService.js`. |
| Mobile checkout | PARTIAL | P0 | One checkout screen exists, but its desktop-like two-column/local-pricing structure has no market-aware mobile contract. |

## F — Markets and international commerce

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Home country; Domestic/International/Hybrid modes | PARTIAL | P0 | Pakistan defaults and payment editions exist, but no persisted market/selling-mode model exists: `backend/models/Setting.js`, `backend/modules/payments/core/providerConfig.js`. |
| Selling countries and additional currencies | MISSING | P0 | Order payment currency is PKR-only and no country/currency configuration collection is active: `backend/models/Order.js`, `backend/services/order/OrderService.js:270`. |
| Timezone and locale/language readiness | MISSING | P2 | No market locale/timezone configuration or customer locale selection was found in active routes/models. |
| Market-specific availability and country shipping eligibility | MISSING | P0 | Product and shipping services have no market/country eligibility data model. |
| Market-specific payment visibility | PARTIAL | P0 | Provider manifests/feature gates exist, but are not fed by a persisted market/currency context: `backend/modules/payments/core/providerConfig.js`. |
| Tax/customs configuration boundary | MISSING | P1 | `TaxService` returns zero and has no market/rule configuration. |

## G — Shipping

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Shipping zones and countries/regions | MISSING | P0 | No shipping-zone model/service or API route exists; generic settings are not a zone engine. |
| Fixed rate and free-shipping threshold | PARTIAL | P0 | Backend hardcodes PKR 150/1500 logic while settings contain a separate legacy value; desired 250/5000 is not configuration data: `backend/services/order/ShippingService.js`, `backend/models/Setting.js`. |
| Configurable remote-area rate | MISSING | P0 | No zone/remote rule or address classification exists. |
| Delivery estimates | UI_ONLY | P0 | Customer text is static rather than quote/zone derived. |
| Shipping status/tracking and admin shipping configuration | PARTIAL | P1 | Order includes courier/tracking fields, but admin tracking edit calls an unsupported route and settings do not drive checkout: `admin-panel/src/app/orders/[id]/page.tsx:133`, `backend/routes/orderRoutes.js`. |

## H — Payments

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| COD, Bank Transfer and Raast | COMPLETE | — | Active registry/manual payment contracts and routes exist: `backend/modules/payments/core/providerConfig.js`, `backend/routes/paymentRoutes.js`. |
| Provider abstraction and enable/disable gates | COMPLETE | — | Manifest, edition and feature-flag checks are centralized in `backend/modules/payments/core/providerConfig.js`. |
| Stripe | EXTERNAL_PROVIDER_BLOCKED | P1 | Provider contract exists, but enablement/configuration is intentionally disabled; no provider activation was attempted. |
| JazzCash | EXTERNAL_PROVIDER_BLOCKED | P1 | Provider contract exists, but enablement/configuration is intentionally disabled. |
| Easypaisa | EXTERNAL_PROVIDER_BLOCKED | P1 | Provider contract exists, but enablement/configuration is intentionally disabled. |
| Country/market/currency eligibility | PARTIAL | P0 | Registry accepts context but active checkout/order code is PKR/Pakistan-centric. |

## I — Promotions

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Coupon percentage/fixed/minimum/expiry/usage/customer/product/category rules | COMPLETE | — | `backend/services/order/CouponService.js` enforces these server-side and atomically reserves usage. |
| Customer coupon experience | PARTIAL | P1 | Preview and server finalisation are separate, and checkout pricing remains locally duplicated. |
| Automatic promotions | MISSING | P2 | No promotion/rule model, route, or service is active. |
| Admin coupon controls | PARTIAL | P1 | CRUD exists (`backend/routes/couponRoutes.js`), but it uses legacy controller contracts rather than the order-service validation boundary. |

## J — Customer account

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Profile and saved addresses | BACKEND_ONLY | P1 | User model has address data (`backend/models/User.js`), but no active storefront profile/address journey or customer endpoint set was found. |
| Orders, detail and cancellation | COMPLETE | — | Customer order routes `/my-orders`, read and cancellation are active in `backend/routes/orderRoutes.js`. |
| Tracking and wishlist | PARTIAL | P1 | Tracking fields exist; wishlist is browser-local rather than account data. |
| Customer reviews | BACKEND_ONLY | P1 | Review model/admin path exists without customer submit/public display flow. |
| Return requests and refund visibility | MISSING | P1 | Active return/refund routes are administrative; no customer ownership workflow exists. |
| Notifications | PARTIAL | P1 | Authenticated notification API exists, but no verified storefront notification centre and route guard is not admin-specific for creation. |
| Account security | COMPLETE | — | Sealed P0 auth validation is evidenced by `docs/P5E_FINAL_VERIFICATION_RESULTS.md`. |

## K — Returns, refunds and invoices

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Return request | BACKEND_ONLY | P1 | Return route is admin-protected globally: `backend/routes/returnRoutes.js`. |
| Category-specific return eligibility | MISSING | P1 | Neither product/category nor return service contains eligibility rules. |
| Return state/admin decision and restock interaction | PARTIAL | P1 | Return states exist in `backend/models/Return.js`; a transaction-safe operational/restock coupling is not verified. |
| Refund state | COMPLETE | — | Refund persistence/status/idempotency exists in `backend/models/Refund.js` and payment refund routes. |
| Customer visibility; invoice/printable receipt | MISSING | P1 | No customer return/refund portal or invoice generation/download route was found. |

## L — Admin operations

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Dashboard | PARTIAL | P1 | Dashboard page exists; no verified permission-aware operational KPI contract was found. |
| Products and variants | PARTIAL | P1 | CRUD pages exist, but some form fields are not product-schema fields and variants lack a complete operational edit contract. |
| Categories and brands | COMPLETE | — | Active CRUD routes/pages and persistence exist. |
| Inventory and orders/tracking | PARTIAL | P0 | Inventory and order-track client endpoints diverge from active server routes: `admin-panel/src/app/inventory/page.tsx:66`, `admin-panel/src/app/orders/[id]/page.tsx:133`. |
| Customers, reviews, returns, refunds and coupons | PARTIAL | P1 | Operational pages/routes exist, but customer-side flows, validation consistency and return coupling remain incomplete. |
| Notifications, reports and content | PARTIAL | P1 | Pages/routes exist; activity export is requested by UI but absent from active routes: `admin-panel/src/app/activity-logs/page.tsx:122`. |
| Settings, staff/roles and audit logs | PARTIAL | P1 | Generic settings persist but do not govern shipping/markets; roles are coarse and audit export/append-only guarantees are absent. |
| Shipping, market and currency configuration | MISSING | P0 | Sidebar links/setting surface do not have active corresponding market/shipping configuration domains. |

## M — Modern UX/UI

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Header/navigation, prominent search and category discovery | PARTIAL | P0 | Brand/navigation is sealed, but search query and category identifier contracts disagree. |
| Homepage hierarchy, hero and product cards/grids | PARTIAL | P1 | Responsive product grid/skeleton exists in `frontend/src/app/products/page.tsx`; homepage hierarchy remains catalogue-specific rather than a complete configurable commerce landing journey. |
| PDP | PARTIAL | P1 | See D: strong basics, but static trust/delivery/returns and inactive review actions block a finished buying surface. |
| Cart and checkout | PARTIAL | P0 | Secure current checkout coexists with legacy direct order posting from cart: `frontend/src/app/cart/page.tsx:165`. |
| Account/orders and footer | PARTIAL | P1 | Order basics exist; profile, addresses, wishlist sync, returns and notification journeys are incomplete. |
| Mobile/navigation/responsive hierarchy | PARTIAL | P0 | Responsive classes exist, but discovery and checkout journeys have not been composed around mobile market/shipping states. |
| Loading, empty and recovery states; accessibility and interaction polish | PARTIAL | P1 | Product list has skeleton/empty states; no consistent cross-journey error/recovery, review, keyboard/focus or form-feedback contract is evidenced. |

## N — Professional platform quality

| Capability group | Status | Priority | Evidence |
|---|---|---|---|
| Role/permission enforcement, ownership isolation and audit trails | PARTIAL | P1 | P0 auth/session validation is sealed; commerce uses coarse role guards and some legacy routes/controllers bypass a consistent policy/audit boundary. |
| Idempotency | COMPLETE | — | Orders and inventory transitions use idempotency/request-operation keys in `backend/services/order/OrderService.js` and `InventoryService.js`. |
| Rate limits, validators and error consistency | PARTIAL | P0 | Critical newer paths validate, while product/coupon/inventory legacy controllers accept disparate raw input/error styles. |
| Pagination and performance risks | PARTIAL | P1 | Product/order inventories paginate, but search is regex-based and limits/filter contracts are inconsistent. |
| Money precision and inventory concurrency | PARTIAL | P0 | Order logic rounds and transactions correctly, but monetary fields are `Number` and manual inventory changes are non-transactional. |
| Production-safe configuration and buyer rebranding boundary | PARTIAL | P1 | P5E validated configurable branding and safe public configuration; markets/shipping/payment eligibility remain hardcoded or split from runtime settings. |

## P0 commercial-sale scope

P0 is deliberately limited to these bounded outcomes:

1. Make discovery contract-consistent: one supported global-search query, category/brand identifier contract, and server-backed filters.
2. Make inventory administration safe and usable: align inventory adjustment and order-tracking client/server contracts; transaction-wrap adjustments.
3. Introduce one runtime shipping/market configuration boundary: zones/country eligibility, Pakistan demo defaults (PKR 250 below 5,000; free at/above 5,000; configurable remote PKR 350), quote-driven delivery windows, and no universal hardcoding.
4. Wire checkout address/country/currency to that market/shipping quote and to payment-method eligibility; retain server-authoritative final totals.
5. Remove/redirect duplicate legacy cart order posting and present only the supported checkout path.
6. Replace static PDP delivery/return/trust claims with configuration-backed content or hide them until configured.
7. Add the minimum admin configuration surface/API for shipping, markets and currency defaults; do not activate external providers.
8. Close critical validation/money/manual-inventory consistency gaps without changing the sealed order/payment provider behaviour.

P1 comprises the non-P0 PARTIAL/BACKEND_ONLY/MISSING rows above: full account/address and wishlist sync, reviews, customer returns/refund visibility, invoice generation, variant/media operations, coupon UX, tracking timeline, role/audit improvements, locale/tax boundaries, and cross-journey accessibility/error polish. P2 is typo/synonym search, automatic promotions, and locale/timezone expansion.
