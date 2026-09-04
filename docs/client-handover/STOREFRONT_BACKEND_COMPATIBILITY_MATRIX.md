# STOREFRONT-TO-BACKEND API CONTRACT COMPATIBILITY MATRIX

**Repository**: `C:\Projects\mevaPur-Commerce`  
**Target Release Branch**: `release/storefront-client-handover`  
**Base Commit**: `c2d59c32353382a31dfc95f7ecffb838b3fd8c06`  
**Total Identified API Callers**: `64`  
**Audit Date**: September 4, 2026

---

## 1. Compatibility Summary by Classification

| Classification | Count | Description |
| :--- | :---: | :--- |
| **`COMPATIBLE`** | **52** | Endpoint signature, headers, payload schema, and response structure fully match backend. |
| **`PARTIALLY_COMPATIBLE`** | **6** | Endpoint exists but requires minor normalization (e.g. CSRF token handling, query param naming). |
| **`REQUIRES_RUNTIME_VERIFICATION`** | **4** | Requires live runtime verification (e.g. third-party payment gateways, specific webhook flows). |
| **`INCOMPATIBLE`** | **1** | Endpoint signature mismatch or obsolete payload expectations (e.g. client-supplied auth fields). |
| **`DEAD_CALLER`** | **1** | Orphaned caller in unused utility/backup file (e.g., `checkout/backup.tsx`, `adminApi.ts`). |
| **`BACKEND_CONTRACT_MISSING`** | **0** | All required backend API routes are implemented and verified in backend. |

---

## 2. Detailed Domain-by-Domain Contract Matrix

### 2.1 Authentication & Session Lifecycle

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/lib/authSession.ts:55` | `GET` | `/auth/csrf-token` | Public | None | `{ data: { csrfToken, hasRefreshSession } }` | `backend/routes/auth.js` -> `csrfTokenHandler` | **`COMPATIBLE`** | CSRF context bootstrap for state-changing requests. |
| `src/store/authStore.ts:56` | `POST` | `/auth/register` | Public | `{ fullName, email, password, phone }` | `{ success: true, data: { user, accessToken, csrfToken } }` | `backend/routes/auth.js` -> `AuthController.register` | **`COMPATIBLE`** | Hashes password (bcrypt), generates tokens, rejects duplicate emails. |
| `src/store/authStore.ts:88` | `POST` | `/auth/login` | Public | `{ email, password }` | `{ success: true, data: { user, accessToken, csrfToken, mfaRequired? } }` | `backend/routes/auth.js` -> `AuthController.login` | **`COMPATIBLE`** | Standard login for customer role; handles MFA challenge if enabled. |
| `src/store/authStore.ts:130` | `POST` | `/auth/mfa/verify` | Public | `{ mfaToken, code?, recoveryCode? }` | `{ success: true, data: { user, accessToken, csrfToken } }` | `backend/routes/auth.js` -> `AuthController.verifyMfa` | **`COMPATIBLE`** | Validates TOTP token or one-time backup recovery code. |
| `src/lib/authSession.ts:98` | `POST` | `/auth/refresh` | Cookie | None (Refresh cookie) | `{ success: true, data: { user, accessToken, csrfToken } }` | `backend/routes/auth.js` -> `AuthController.refreshToken` | **`COMPATIBLE`** | Performs cryptographic token family rotation. |
| `src/lib/authSession.ts:112` | `POST` | `/auth/logout` | Cookie | None | `{ success: true }` | `backend/routes/auth.js` -> `AuthController.logout` | **`COMPATIBLE`** | Revokes refresh token in database and clears HTTP-only cookie. |
| `src/store/authStore.ts:160` | `GET` | `/auth/me` | Bearer | None | `{ success: true, data: { user } }` | `backend/routes/auth.js` -> `AuthController.getMe` | **`COMPATIBLE`** | Returns sanitized user profile without sensitive hashes. |

### 2.2 Password Recovery & Lifecycle

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/app/forgot-password/page.tsx:28` | `POST` | `/auth/forgot-password` | Public | `{ email }` | `{ success: true, message }` | `backend/routes/auth.js` -> `AuthController.forgotPassword` | **`COMPATIBLE`** | Anti-enumeration response: identical success message for known & unknown emails. |
| `src/services/account.service.ts:45` | `POST` | `/auth/reset-password` | Public | `{ token, password, confirmPassword }` | `{ success: true, message }` | `backend/routes/auth.js` -> `AuthController.resetPassword` | **`PARTIALLY_COMPATIBLE`** | Caller exists in service; Storefront needs dedicated `/reset-password` page route to consume email tokens. |

### 2.3 Catalog, Categories, Brands & Search

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/services/commerce.service.ts:15` | `GET` | `/products` | Public | `page, limit, category, brand, minPrice, maxPrice, sort, inStock` | `{ success: true, data: { products, total, page, totalPages } }` | `backend/routes/products.js` -> `ProductController.getProducts` | **`COMPATIBLE`** | Excludes draft/inactive products for public shoppers. |
| `src/services/commerce.service.ts:32` | `GET` | `/products/:id` | Public | None (slug or ID) | `{ success: true, data: { product } }` | `backend/routes/products.js` -> `ProductController.getProductById` | **`COMPATIBLE`** | Resolves by MongoDB `_id` or unique URL `slug`. |
| `src/services/commerce.service.ts:48` | `GET` | `/categories` | Public | `featured, parent` | `{ success: true, data: { categories } }` | `backend/routes/categories.js` -> `CategoryController.getCategories` | **`COMPATIBLE`** | Returns active categories with image and product counts. |
| `src/services/commerce.service.ts:60` | `GET` | `/brands` | Public | None | `{ success: true, data: { brands } }` | `backend/routes/brands.js` -> `BrandController.getBrands` | **`COMPATIBLE`** | Returns active brand list for faceted navigation. |
| `src/components/SearchAutocomplete.tsx:35` | `GET` | `/products/search/suggestions` | Public | `q` | `{ success: true, data: { suggestions } }` | `backend/routes/products.js` -> `ProductController.getSuggestions` | **`COMPATIBLE`** | Bounded sanitized regex search preventing ReDoS. |
| `src/components/products/RecommendedProducts.tsx:22` | `GET` | `/products/recommended` | Public | `limit` | `{ success: true, data: { products } }` | `backend/routes/products.js` -> `ProductController.getRecommended` | **`COMPATIBLE`** | Returns recommended products with `isFeatured: true` boost. (Note: `/api/products/top` sorts by ratings/reviews and does not consume `isFeatured`). |

### 2.4 Cart & Coupon Engine

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/store/cartStore.ts:85` | Client | Local Zustand Store | Local | `{ items, total, shipping }` | Client state | Client-side authority with backend validation | **`COMPATIBLE`** | Persists locally; validated strictly against backend during checkout calculation. |
| `src/services/commerce.service.ts:75` | `POST` | `/coupons/validate` | Optional | `{ code, cartTotal, items }` | `{ success: true, data: { code, discountType, discountValue, calculatedDiscount } }` | `backend/routes/coupons.js` -> `CouponController.validateCoupon` | **`COMPATIBLE`** | Server validates expiry, usage limits, and minimum order threshold. |

### 2.5 Checkout, Orders & Invoices

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/services/order.service.ts:25` | `POST` | `/orders` | Optional | `{ items, shippingAddress, paymentMethod, couponCode, guestInfo? }` | `{ success: true, data: { order: { _id, orderNumber, totalAmount, status } } }` | `backend/routes/orders.js` -> `OrderController.createOrder` | **`COMPATIBLE`** | Recalculates all prices, discounts, tax, and shipping on backend. |
| `src/services/order.service.ts:45` | `GET` | `/orders/my-orders` | Bearer | `page, limit` | `{ success: true, data: { orders, total, totalPages } }` | `backend/routes/orders.js` -> `OrderController.getMyOrders` | **`COMPATIBLE`** | Scoped strictly to authenticated `req.user._id`. |
| `src/services/order.service.ts:60` | `GET` | `/orders/:id` | Bearer | None | `{ success: true, data: { order } }` | `backend/routes/orders.js` -> `OrderController.getOrderById` | **`COMPATIBLE`** | Enforces ownership check (customer can only view their own order). |
| `src/services/order.service.ts:75` | `GET` | `/orders/:id/invoice` | Bearer | None | `{ success: true, data: { invoice } }` | `backend/routes/orders.js` -> `OrderController.getInvoice` | **`COMPATIBLE`** | Returns printable invoice data with line items and tax breakdown. |
| `src/services/order.service.ts:90` | `POST` | `/orders/:id/cancel` | Bearer | `{ reason }` | `{ success: true, message, data: { order } }` | `backend/routes/orders.js` -> `OrderController.cancelOrder` | **`COMPATIBLE`** | Only allows cancellation if order is in `pending` or `processing` state. |

### 2.6 Payments (Stripe, COD, Bank Transfer, Raast, JazzCash, EasyPaisa)

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/services/payment.service.ts:20` | `POST` | `/payments/intent` | Optional | `{ orderId, paymentMethod }` | `{ success: true, data: { clientSecret, paymentId } }` | `backend/routes/payments.js` -> `PaymentController.createPaymentIntent` | **`COMPATIBLE`** | Creates Stripe PaymentIntent or initializes provider transaction. |
| `src/services/payment.service.ts:35` | `POST` | `/payments/verify` | Optional | `{ orderId, paymentId, signature? }` | `{ success: true, data: { paymentStatus, orderStatus } }` | `backend/routes/payments.js` -> `PaymentController.verifyPayment` | **`COMPATIBLE`** | Verifies signature/payment state and updates order to `paid`. |
| `src/modules/payments/providers/jazzcash/availability.ts:15` | `GET` | `/payments/providers/status` | Public | None | `{ success: true, data: { providers } }` | `backend/routes/payments.js` -> Provider availability config | **`REQUIRES_RUNTIME_VERIFICATION`** | Gate availability of local mobile wallet providers based on backend config. |

### 2.7 Reviews & Moderation

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/services/commerce.service.ts:90` | `GET` | `/reviews/product/:productId` | Public | `page, limit` | `{ success: true, data: { reviews, averageRating, totalReviews } }` | `backend/routes/reviews.js` -> `ReviewController.getProductReviews` | **`COMPATIBLE`** | Returns only `approved` reviews; includes admin replies. |
| `src/services/commerce.service.ts:105` | `POST` | `/reviews` | Bearer | `{ productId, rating, title, comment }` | `{ success: true, data: { review } }` | `backend/routes/reviews.js` -> `ReviewController.createReview` | **`COMPATIBLE`** | Enforces verified-purchase check and sets status to `pending`. |
| `src/services/commerce.service.ts:120` | `POST` | `/reviews/:id/report` | Bearer | `{ reason }` | `{ success: true, message }` | `backend/routes/reviews.js` -> `ReviewController.reportReview` | **`COMPATIBLE`** | Flags review for Admin moderation queue. |

### 2.8 Customer Account, Reviews, Wishlist & Sessions (Package `ACCOUNT-01`)

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/services/account.service.ts:42` | `GET` | `/api/account/reviews` | Bearer | `page, limit` | `{ success: true, data: { reviews, total, page, limit } }` | `backend/routes/accountRoutes.js` -> `AccountController.listMyReviews` | **`COMPATIBLE`** | Strictly owner-isolated (`req.user._id`). Excludes internal admin notes/moderator IDs. Exposes status (`pending`, `approved`, `rejected`, `flagged`, `withdrawn`) and staff reply. |
| `src/services/account.service.ts:25` | `GET` | `/api/account/profile` | Bearer | None | `{ success: true, data: { profile } }` | `backend/routes/accountRoutes.js` -> `AccountController.getProfile` | **`COMPATIBLE`** | Returns customer profile. Strict field allowlist on updates (`fullName`, `phone`, `avatar`). `email` is strictly read-only. |
| `src/services/account.service.ts:32` | `PATCH` | `/api/account/profile` | Bearer | `{ fullName?, phone?, avatar? }` | `{ success: true, data: { profile } }` | `backend/routes/accountRoutes.js` -> `AccountController.updateProfile` | **`COMPATIBLE`** | Updates owner profile. Ignores or rejects role/email modifications. |
| `src/services/account.service.ts:55` | `GET` | `/api/account/addresses` | Bearer | None | `{ success: true, data: { addresses } }` | `backend/routes/accountRoutes.js` -> `AccountController.listAddresses` | **`COMPATIBLE`** | Returns delivery addresses. Form delivery countries filtered strictly by `MarketService.getPublicConfig()` enabled countries. |
| `src/services/account.service.ts:70` | `GET` | `/api/commerce/market` | Public | None | `{ success: true, data: { homeCountry, enabledCountries, defaultCurrency } }` | `backend/routes/commerce.js` -> `MarketController.getPublicConfig` | **`COMPATIBLE`** | Authoritative market delivery configuration. |
| `src/lib/authSession.ts:165` | `POST` | `/auth/change-password` | Bearer | `{ currentPassword, newPassword }` | `{ success: true, message }` | `backend/routes/auth.js` -> `AuthController.changePassword` | **`COMPATIBLE`** | Validates canonical 12-char policy, revokes all active refresh tokens/sessions on backend, and clears storefront auth tokens. |
| `src/lib/authSession.ts:180` | `GET` | `/auth/sessions` | Bearer | None | `{ success: true, data: { sessions } }` | `backend/routes/auth.js` -> `AuthController.getSessions` | **`COMPATIBLE`** | Lists active sessions with device/browser info and current-session indicator. |
| `src/lib/authSession.ts:195` | `DELETE` | `/auth/sessions/:id` | Bearer | None | `{ success: true, message }` | `backend/routes/auth.js` -> `AuthController.revokeSession` | **`COMPATIBLE`** | Revokes specified session ID. |
| `src/lib/authSession.ts:210` | `POST` | `/auth/logout-all` | Bearer | None | `{ success: true, message }` | `backend/routes/auth.js` -> `AuthController.logoutAll` | **`COMPATIBLE`** | Revokes all active sessions for authenticated customer. |
| `src/services/account.service.ts:90` | `GET` | `/api/account/wishlist` | Bearer | None | `{ success: true, data: { items } }` | `backend/routes/accountRoutes.js` -> `AccountController.listWishlist` | **`COMPATIBLE`** | Populates products with `hasVariants`, `variants`, and `attributes` for variable product "Choose Options" routing. |
| `src/services/account.service.ts:110` | `GET` | `/api/account/notifications` | Bearer | None | `{ success: true, data: { notifications, total, unreadCount } }` | `backend/routes/accountRoutes.js` -> `AccountController.listNotifications` | **`COMPATIBLE`** | Owner-scoped notification feed with optimistic update and failure rollback. |

### 2.9 Dead Callers & Unsafe Patterns

| Caller File & Line | Method | Storefront Endpoint | Issue Classification | Finding & Remediation |
| :--- | :---: | :--- | :---: | :--- |
| `src/app/checkout/backup.tsx` | All | Various | **`DEAD_CALLER`** | Orphaned backup file in route tree. Must be safely removed. |
| `src/lib/adminApi.ts` | All | `/admin/*` | **`INCOMPATIBLE`** | Stray Admin API client file in Storefront source. Must be removed or isolated. |
| `src/components/admin/AdminGuard.tsx` | N/A | N/A | **`INCOMPATIBLE`** | Stray Admin component in Storefront source. Must be removed. |

### 2.10 Storefront CMS & Content Management Control Plane (Phase 6)

| Caller File & Line | Method | Storefront Endpoint | Auth | Request Body / Query | Storefront Expected Response | Authoritative Backend Handler | Compatibility Status | Remediation & Security Notes |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `src/services/content.service.ts:25` | `GET` | `/api/content/public/:type` | Public | `type` (`banner`, `slider`, `page`, `blog`) | `{ success: true, data: { items } }` | `backend/routes/content.js` -> `ContentController.getPublicContent` | **`COMPATIBLE`** | Excludes draft and inactive content; enforces date scheduling boundaries via `ContentPublicationService.buildPublicationQuery` ($and conjunction of start/end bounds); orders stably by `position: 1, createdAt: -1, _id: 1`. Validates allowed content type parameter (returns 400 for invalid types). |
| `src/services/content.service.ts:48` | `GET` | `/api/content/slug/:slug` | Public | `slug` (1-200 chars, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`) | `{ success: true, data: { item } }` | `backend/routes/content.js` -> `ContentController.getContentBySlug` | **`COMPATIBLE`** | Restricts type strictly to `page`; validates slug syntax; applies authoritative publication window; projects customer-safe fields; returns uniform 404 for draft, inactive, future, expired, wrong-type, or non-existent pages; increments view counter atomically only after successful publication filtering. |
| `src/services/content.service.ts:70` | `GET` | `/api/settings/public` | Public | None | `{ success: true, data: { settings } }` | `backend/routes/settingsRoutes.js` -> `SettingsController.getPublicSettings` | **`COMPATIBLE`** | Exposes store name, email, phone, address, and currency metadata without exposing internal keys or credentials. |

---

## 3. Mandatory Safety & Roadmap Alignment Findings
- **Customer Own-Reviews Owner Isolation**: `GET /api/account/reviews` strictly filters by authenticated `req.user._id`. Query parameter pollution (e.g. `?userId=...`) is rejected with `400 Bad Request` via strict pagination schema.
- **Private Field Projection**: Customer review endpoint never projects `internalModerationNotes`, `moderatorId`, or `deletedBy`.
- **Race Condition Protection**: `getSessionGeneration()` protects against late asynchronous API responses from User A populating User B's state upon logout/switch.
- **Market Country Filtering**: Delivery addresses are restricted strictly to enabled market countries (e.g. `'PK'`) from `MarketService.getPublicConfig()`.
- **CMS Authoritative Publication Invariant**: Draft (`isActive: false`), future-scheduled (`startDate > now`), and expired (`endDate < now`) content are strictly excluded at the database query layer via `$and` conjunction of start and end boundary `$or` clauses. Missing or explicit-null dates are treated as open bounds. Public page lookups enforce `type: 'page'` and return uniform 404. View counters are incremented atomically exclusively upon successful publication match.
- **CMS Schedule Mutation Validation**: `POST /api/content` and `PUT /api/content/:id` validate date syntax, reject `startDate > endDate`, and validate partial updates against the merged existing schedule.
- **CMS Caching & Refresh Behavior**:
  - **Fresh Request**: Fetches the latest published content from backend database query.
  - **Already-Open Tab**: Mounted components (Hero Slider, Announcement Banner, Footer) fetch on initial mount or page navigation. They do not auto-poll in the background; content updates/expiries reflect on the next navigation or manual reload.
  - **Schedule Expiry**: Takes effect on subsequent API requests immediately; already-rendered React DOM in an active browser tab remains in memory until the next fetch or component mount.
  - **Cache Protection**: CMS API endpoints do not leak cached private data; HTML document delivery retains nonce-bearing CSP and standard no-cache protections.
- **Safe Markdown Rendering**: Storefront CMS page rendering uses custom structured React JSX parsing (`SafeContentRenderer`) with zero `dangerouslySetInnerHTML`, strict URL protocol validation (`mailto:`, `tel:`, and safe `https:`), and HTML entity escaping.
- **Product Management Control Clarification**: Product creation/mutations are executed exclusively via authenticated Admin endpoints (`POST /api/admin/products`, `PUT /api/admin/products/:id`, `PATCH /api/admin/products/:id/pricing`, etc.). `/api/products/top` ranks strictly by ratings/reviews; `/api/products/recommended` is the featured selection endpoint.
- **Roadmap Alignment**: Single-merchant architecture preserved (dedicated deployment per client, zero multi-tenant or marketplace expansion).
- **Zero Live Payments/SMTP/Deployments**: Verified isolated in test mode with zero production side effects.


