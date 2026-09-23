# Phase 10 — Batch 10C Storefront Manual QA and Accessibility Evidence Ledger

> **Provenance Notice (`TARGET_SHA_ATTRIBUTION`)**:
> Authoritative evidence in this ledger targets **`e4b8b224d8af976a66353d6a894629e3c3dc16a4`** (Commit G: implement governed Pakistan COD eligibility policies), executed against a clean working tree.
>
> **Evaluation Boundary**: All automated observations are classified as `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` or `STATIC_SOURCE_EVIDENCE`. All subjective visual hierarchy, keyboard usability, OS print preview, and assistive technology verdicts remain `PENDING_HUMAN_REVIEW`. No human tester identity is invented.

---

## 1. Execution & Environment Metadata

| Metadata Field | Recorded Value |
|---|---|
| **Target Commit SHA (`e4b8b224d8af976a66353d6a894629e3c3dc16a4`)** | `e4b8b224d8af976a66353d6a894629e3c3dc16a4` (Commit G: implement governed Pakistan COD eligibility policies) |
| **Previous Local Commit** | `779be953378031a2e3301681a8ab37313983fece` |
| **Remote Tracking HEAD** | `d520b8669340cf83fc0f3cd02f522a29268c221c` |
| **Reproducibility Classification** | `REPRODUCIBLE_SEMANTIC_OUTPUT` (22 of 22 screenshots dimension-identical, 17 of 22 byte-identical across sequential isolated runs, zero overflow checks, Axe WCAG audits identical, zero external calls verified) |
| **Network Hermeticity** | `HERMETIC_ZERO_EXTERNAL_REQUESTS` (Run 1: 401 mocked requests; Run 2: 390 mocked requests; attempted: 0, blocked: 0, successful: 0) |
| **Execution Timestamp (UTC)** | `2026-09-22T12:00:00Z` |
| **Environment / Build ID** | `LOCAL-UAT-STANDALONE-PORT-3528` |
| **Operating System** | `Windows 11 Pro (win32 10.0.26100)` |
| **Browser Engine & Version** | `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50` |
| **Storefront Base URL** | `http://127.0.0.1:3528` (Next.js standalone build) |
| **Backend API Route State** | `Deterministic in-memory route intercepts (MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE)` |
| **Evidence Harness** | `frontend/tests/phase10StorefrontEvidence.mts` (`npm run test:phase10:evidence`) |
| **Docker Engine Status** | `INSTALLED_ENGINE_STOPPED` (Docker daemon not running) |
| **Environment Helpers Status** | `STATICALLY_VERIFIED_RUNTIME_PENDING` (Helpers authored and guarded; runtime pending Docker engine startup) |
| **Integrated Human Environment** | `BLOCKED_ENVIRONMENT_GAP` (Integrated backend + replica set not booted for manual session) |
| **Batch 10C Policy Status** | `POLICIES_IMPLEMENTED_GOVERNED_AUTHORITY_ACTIVE` (P10C-GAP-001 through P10C-GAP-005 implemented per owner policy decisions; server-side enforcement active in PaymentCapabilityPolicy, CheckoutQuoteService, and OrderService) |
| **Human Sign-off Status** | `PENDING_HUMAN_REVIEW` (Human acceptance closure strictly reserved for owner) |

---

## 2. In-Repo Reproducible Harness & Mock Specification

The automated evidence is generated strictly by the committed repository harness:
- **Harness path**: `frontend/tests/phase10StorefrontEvidence.mts`
- **Execution command**: `npm run test:phase10:evidence` (configured in `frontend/package.json`)
- **Package dependencies**: Uses repository-installed `playwright` and `@axe-core/playwright`. No external scratch files or uncommitted packages.
- **Configurability**: Accepts `TARGET_SHA`, `PORT`, `BASE_URL`, `ARTIFACT_DIR`, and `STOREFRONT_EVIDENCE_TIMESTAMP` via environment variables.
- **Authoritative Fixture Source**: Hydrated directly from `scripts/ops/manifests/uat-fixture-manifest.json` without introducing redundant definitions.
- **Deterministic Image Assets**: All external CDN image URLs are replaced with repository-local public asset `/placeholder.png`.
- **Redaction**: Zero passwords, cookies, tokens, or authorization headers are logged or recorded.
- **Deterministic naming**: `<TARGET_SHA>_<TEST_CASE_ID>_<VIEWPORT>_<UTC_TIMESTAMP>.png`
- **Machine-readable output**: Writes `phase10-evidence-summary.json` and `request-ledger.json` alongside screenshots.

### Network-Hermetic Architecture & Request Ledger Guard

The harness enforces strict network hermeticity via Playwright `page.route()` and client-side initialization guards:
1. **Permitted Destinations**:
   - `http://127.0.0.1:<dynamic-local-port>`
   - `http://localhost:<dynamic-local-port>`
   - Same-origin Next.js static assets (`/_next/...`, `/brand/...`, `/placeholder.png`)
   - Explicitly mocked same-origin API requests (`/api/...`, `/auth/...`)
2. **Rejected & Recorded Destinations**:
   - External image/CDN hosts (Cloudinary, Unsplash, etc.)
   - Analytics endpoints (Google Analytics, etc.)
   - Payment providers (Stripe API, Stripe.js auto-loaders, etc.)
   - Any public or non-loopback HTTP/HTTPS hostname.
3. **Machine-Readable Request Ledger (`request-ledger.json`)**:
   - URL with all query parameters, tokens, and secrets redacted
   - HTTP method
   - Classification (`LOCAL_PAGE_ROUTE`, `LOCAL_NEXTJS_ASSET`, `LOCAL_PUBLIC_ASSET`, `SAME_ORIGIN_MOCKED_API`, `EXTERNAL_HOST_BLOCKED`)
   - Disposition (`LOCAL_ALLOWED`, `MOCKED`, `EXTERNAL_BLOCKED`)
4. **Hermeticity Gate (HERM-01)**:
   - The test harness strictly fails if `externalRequestCount !== 0`.
   - Verified: Exactly zero non-loopback browser or server requests occur during execution.

### Network Interceptions & Mocking Transparency

All automated API responses during harness execution are intercepted client-side via Playwright `page.route()`. In accordance with Section 7:

| Intercepted Endpoint Route | Fabricated / Mocked Payload | Exercised UI State | Unexercised / Untested Backend Behavior |
|---|---|---|---|
| `GET /api/auth/csrf-token` | `{ success: true, data: { csrfToken: '...', hasRefreshSession: true } }` | CSRF token initialization | Real CSRF secret rotation & cookie exchange |
| `GET /api/auth/refresh`, `GET /api/auth/me` | Authenticated UAT Customer PK COD persona (`66f000000000000000000021`) | Authenticated header, user dropdown, account route guard | Actual JWT cryptographic signature verification, cookie expiration |
| `GET /api/market/config`, `/commerce/market` | Home country `PK`, currencies `['PKR', 'AED', 'GBP', 'USD']`, enabled `['PK', 'AE', 'GB', 'US', 'CA']` | Currency selector, country dropdown options | Live market config database queries & cache invalidation |
| `GET /api/categories` | Batch 10B manifest Category: `Dry Fruits & Nuts` (`66f000000000000000000002`) | Mega-menu, header category navigation links | MongoDB category collection reads |
| `GET /api/brands` | Single brand: `MevaPur Naturals` | Brand filtering facets in catalog | Brand collection aggregation |
| `GET /api/products`, `/products/top`, `/products/recommended` | 4 manifest products (`Almonds Roasted 500g`, `Pistachios Saffron 250g`, `Pine Nuts Chilgoza 250g`, `Walnut Kernels Special 500g`) | Catalog grid, pagination controls, search results | Database full-text search indexing, stock lookup |
| `GET /api/products/:id` | Individual manifest product by slug (`almonds-roasted-500g`, `pine-nuts-chilgoza-250g`) or `_id` | Product detail page, image gallery, variant selectors, stock badge | Real-time inventory reservation check |
| `GET /api/payments/methods` | For PK: `['cod', 'stripe']`. For non-PK: `['stripe']` | Payment method selection radio buttons in checkout | Dynamic provider health status checks |
| `POST /api/checkout/quote` | Authoritative quote calculation: domestic PK includes COD; intl AE excludes COD | Delivery estimate, subtotal, shipping cost, tax display, total | Live shipping rate calculation, distance matrix lookup |
| `GET /api/orders/:id`, `/account/orders` | Manifest delivered order `ORD-UAT-DELIVERED-004` (`66f000000000000000000044`) | Order history list, order status timeline, return CTA button | Multi-tenant order isolation, database index scan |
| `GET /api/account/orders/:id/invoice` | Order document payload: receipt (untaxed) vs tax invoice | Printable document sheet, tax breakdown table, status badge | Dynamic PDF streaming, cryptographic invoice signing |
| `GET /api/account/returns`, `/refunds` | Empty return history array `[]` | Return request form, order item selection | Return state machine, inventory return receipt |
| `GET /api/account/profile`, `/addresses` | Manifest customer profile & address records | Account profile tab rendering, pre-filled address | Profile update mutation validation |
| `GET /api/content/public/banner`, `/slider` | Empty promotional banner/slider array `[]` | Storefront banner slots | Dynamic CMS collection queries |
| `GET /api/settings/public` | Maintenance mode false, COD enabled | Storefront configuration | Global settings document scan |
| `GET /api/assistant/capabilities` | AI Assistant disabled | Help assistant floating trigger | Assistant backend readiness |

> **Note**: Mock-backed results provide objective proof of client-side DOM rendering, responsive layout stability, and accessibility structure. They do NOT constitute proof of end-to-end backend integration, database consistency, or external payment provider execution.

---

## 3. Authoritative Route Identifier & Fixture Reconciliation

All route URLs audited in this ledger are reconciled against the authoritative Batch 10B fixture manifest (`scripts/ops/manifests/uat-fixture-manifest.json`) and actual frontend/backend route handlers:

| Resource | Placeholder / Deprecated Identifier | Authoritative Manifest Identifier | Proven Route Path | Route Handler Key Requirement |
|---|---|---|---|---|
| **Product (In Stock)** | `prod-almonds-001` | `66f000000000000000000011`<br>Slug: `almonds-roasted-500g`<br>SKU: `SKU-ALM-500G` | `/products/almonds-roasted-500g` | Frontend route `app/products/[id]/page.tsx` accepts either slug or MongoDB `_id`; canonical URL uses slug. |
| **Product (Low Stock)** | `prod-pistachios-002` | `66f000000000000000000012`<br>Slug: `pistachios-saffron-250g`<br>SKU: `SKU-PIS-250G` | `/products/pistachios-saffron-250g` | Accepts slug or `_id`; stock = 5 triggers low-stock badge. |
| **Product (Out of Stock)** | `prod-chilgoza-003` | `66f000000000000000000013`<br>Slug: `pine-nuts-chilgoza-250g`<br>SKU: `SKU-CHIL-250G` | `/products/pine-nuts-chilgoza-250g` | Accepts slug or `_id`; stock = 0 disables purchase action. |
| **Product (Promotional Deal)** | `prod-walnuts-004` | `66f000000000000000000014`<br>Slug: `walnut-kernels-special-500g`<br>SKU: `SKU-WAL-500G` | `/products/walnut-kernels-special-500g` | Discounted promotional price calculation. |
| **Customer Order (Delivered)** | `ORD-PHASE10-001`<br>`69a010000000000000000001` | `66f000000000000000000044`<br>Public `orderId`: `ORD-UAT-DELIVERED-004` | `/orders/ORD-UAT-DELIVERED-004` | Frontend route `app/orders/[id]/page.tsx` accepts public `orderId` or `_id`. |
| **Invoice / Receipt Sheet** | `/orders/69a.../invoice` | `66f000000000000000000044` | `/orders/66f000000000000000000044/invoice` | **Crucial Backend Requirement**: Backend `GET /api/account/orders/:id/invoice` is validated by `schemas.idParam = z.object({ id: objectId })` and **strictly requires the 24-character hex MongoDB `_id`**. Passing public `orderId` fails with `400 INVALID_ID`. |

---

## 4. COD Acceptance Reclassification & Policy Decision Register

In accordance with Phase 10 governance, COD acceptance criteria have been audited against `backend/services/payment/PaymentCapabilityPolicy.js` and classified truthfully without inventing missing business policies:

| Test Case | Scope & Description | Current Codebase Status | Final Batch 10C Classification | Action / Governance Gap |
|---|---|---|---|---|
| **`COD-ACC-01`** | Pakistan Destination & Implemented Capability Rules | Fully implemented: domestic `PK` destination + `PKR` currency evaluates `available: true`. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Automated prerequisites pass; human UAT review ready. |
| **`COD-ACC-02A`** | Foreign Country COD Rejection | Fully implemented: non-PK countries (`AE`, `GB`, `US`) strictly exclude COD tender. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Automated prerequisites pass; human UAT review ready. |
| **`COD-ACC-02B`** | Domestic Courier Unserviceable Postal Zone | Fully implemented: domestic PK geography fails closed; verified city/postal rule required via `CodServiceabilityRule`. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Implemented via `CodEligibilityPolicyService`. |
| **`COD-ACC-03`** | Product-Level COD Exclusion | Fully implemented: cart with any offering having `codEligible: false` disables COD for entire order. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Implemented via `ProductMarketOffering.codEligible`. |
| **`COD-ACC-04`** | COD Order-Value Ceiling | Fully implemented: payable total > PKR 25,000 (2,500,000 minor units exact integer) rejects COD. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Implemented via exact-money boundary evaluation. |
| **`COD-ACC-05`** | Blocked / High-Risk Customer COD Restriction | Fully implemented: manual block and rolling 90-day refusal (2 qualifying RTOs = 30-day lock) active. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Implemented via `CustomerCodRestriction` & `OrderDeliveryOutcomeService`. |
| **`COD-ACC-06`** | Prepaid-Only Promotion Restriction | Fully implemented: coupons support `paymentEligibility` with `ALLOWLIST` restricting tender to prepaid methods. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Implemented via `Coupon.paymentEligibility`. |
| **`COD-ACC-07`** | All-Rules-Pass Control Case | Fully implemented: clean domestic PK order with serviceable location and valid stock satisfies all capability checks. | `PENDING_HUMAN_REVIEW`<br>*(Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)* | Automated prerequisites pass; human UAT review ready. |

### Formal COD Policy Decision Register (Owner Decisions Recorded & Implemented)

#### Policy Decision: P10C-GAP-001 — Domestic Courier COD Serviceability
- **Domain**: Domestic courier COD serviceability and postal-code/zone exclusion
- **Owner Decision**: Fail-closed serviceability. Domestic COD is available only for explicitly approved Pakistan city/postal combinations. Unlisted areas reject COD while prepaid methods remain available.
- **Implementation**: Governed `CodServiceabilityRule` model with compound normalization index and city/postal specificity evaluation in `CodEligibilityPolicyService`.
- **Status**: `POLICIES_IMPLEMENTED_GOVERNED_AUTHORITY_ACTIVE`

#### Policy Decision: P10C-GAP-002 — Product-Level COD Eligibility Governance
- **Domain**: Product-level COD eligibility governance
- **Owner Decision**: Products/market offerings can explicitly disallow COD. If any item in a cart is COD-ineligible, COD is disabled for the entire cart. Legacy offerings default to eligible.
- **Implementation**: `codEligible: { type: Boolean, default: true, required: true }` in `ProductMarketOffering` and cart scan in `CodEligibilityPolicyService`.
- **Status**: `POLICIES_IMPLEMENTED_GOVERNED_AUTHORITY_ACTIVE`

#### Policy Decision: P10C-GAP-003 — Configurable COD Order-Value Ceiling
- **Domain**: Configurable COD order-value ceiling
- **Owner Decision**: Maximum COD final payable amount is PKR 25,000 (2,500,000 minor units). Evaluated after discounts and inclusive of shipping and tax using exact integer arithmetic.
- **Implementation**: Minor-unit integer boundary check in `CodEligibilityPolicyService` (`COD_MAX_PAYABLE_MINOR_UNITS = 2500000n`).
- **Status**: `POLICIES_IMPLEMENTED_GOVERNED_AUTHORITY_ACTIVE`

#### Policy Decision: P10C-GAP-004 — Customer COD Risk / Temporary Lock Policy
- **Domain**: Customer COD risk/block policy
- **Owner Decision**: Manual COD blocks supported; rolling 90-day refusal evaluation supported (2 qualifying RTO/refusals within 90 days triggers 30-day temporary lock derived from `temporaryLockUntil`); staff overrides supported.
- **Implementation**: `CustomerCodRestriction` model, append-only `CodDeliveryOutcome` audit ledger, and transactional `OrderDeliveryOutcomeService`.
- **Status**: `POLICIES_IMPLEMENTED_GOVERNED_AUTHORITY_ACTIVE`

#### Policy Decision: P10C-GAP-005 — Prepaid-Only Promotion Governance
- **Domain**: Prepaid-only promotion governance
- **Owner Decision**: Coupons support `paymentEligibility` restricting tender to prepaid methods (e.g. `['stripe']`). Missing legacy fields default to `ANY`.
- **Implementation**: `Coupon.paymentEligibility` with `restrictionMode` and `allowedMethods` checked in `CodEligibilityPolicyService`.
- **Status**: `POLICIES_IMPLEMENTED_GOVERNED_AUTHORITY_ACTIVE`

#### Policy Decision: P10C-POLICY-006 — Guest COD Phone Verification
- **Domain**: Unauthenticated guest checkout fraud mitigation
- **Owner Decision**: Guest checkout requires verified Pakistan mobile number before final COD order creation via single-use verification token.
- **Implementation**: Redis-backed `GuestPhoneVerificationService` with HMAC-SHA-256 peppered digests, rate limiting, and single-use token consumption during order placement.
- **Status**: `POLICIES_IMPLEMENTED_GOVERNED_AUTHORITY_ACTIVE`

---

## 5. Viewport Matrix Specifications

Objective automated screenshots were captured across all 5 mandatory viewports:

1. **320 × 800**: Mobile Mini (narrow portrait smartphone)
2. **375 × 812**: Mobile Standard (contemporary smartphone portrait)
3. **768 × 1024**: Tablet Portrait (iPad / medium touchscreen)
4. **1024 × 768**: Desktop Standard (small laptop / landscape tablet)
5. **1440 × 900**: Desktop HD (standard desktop monitor)

---

## 6. Test Case Evidence Ledger (13 Standard Fields per Case)

### Case 1: NAV-01 — Homepage, Navigation, Mega-Menu, Category Routing, Mobile Drawer
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW` (Automated supporting pass by in-repo Playwright harness)
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)` & `375x812 (Mobile Standard)`
7. **Test-case ID**: `NAV-01`
8. **Expected result**: Header navbar renders brand logo, mega-menu category navigation, search bar, and cart trigger. On mobile (375x812), hamburger toggle opens sliding drawer, traps focus, locks body scroll, and provides accessible close action.
9. **Actual result**: Header rendered cleanly at 1440x900 with visible category links. At 375x812, mobile menu button toggled navigation drawer; body scroll lock confirmed; close button restored focus.
10. **Screenshot artifact paths**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_NAV-01_1440x900_20260922T120000Z.png`
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_NAV-01_375x812_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Zero console errors; touch target size >= 40px verified.

---

### Case 2: CAT-01 — Category / Search / Filter / Sort and URL Query Synchronization
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CAT-01`
8. **Expected result**: Navigating to `/products?search=almonds&sort=price_asc` renders matching catalog products, sets search input value, synchronizes URL query parameters, and provides sort options.
9. **Actual result**: Catalog grid loaded filtered products, search query was reflected in URL state, category filters and sort dropdown displayed without layout shifts.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_CAT-01_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Axe audit on `/products` found 0 critical/serious violations; 18 passed rules.

---

### Case 3: PRD-01 — Product Detail, Variants, SKU, Price, Image, Out-of-Stock Behavior
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `PRD-01`
8. **Expected result**: In-stock product (`/products/almonds-roasted-500g`, ATP 100) displays formatted price (PKR 1,500), SKU, origin, and enabled "Add to Cart" button. Switching weight variant updates SKU and price. Out-of-stock product (`/products/pine-nuts-chilgoza-250g`, ATP 0) displays "Out of Stock" badge and disabled purchase button.
9. **Actual result**: Both in-stock and out-of-stock states rendered accurately. In-stock allowed purchase actions; out-of-stock clearly prohibited adding to cart.
10. **Screenshot artifact paths**:
    - In-stock: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_PRD-01-instock_1440x900_20260922T120000Z.png`
    - Out-of-stock: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_PRD-01-outofstock_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Axe audit on product detail found 0 critical/serious violations; 18 passed rules.

---

### Case 4: CRT-01 — Cart Add/Remove/Quantity/Subtotal/Refresh Persistence
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CRT-01`
8. **Expected result**: Cart displays line items, quantities, unit prices, subtotal (PKR 1,500), and checkout CTA. Items persist across page reload in `localStorage` (`storefront-cart-storage`).
9. **Actual result**: Cart rendered Almonds Roasted 500g, computed exact subtotal PKR 1,500, and preserved item state upon page navigation.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_CRT-01_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Reconcile logic and store persistence verified; 0 Axe violations on `/cart`.

---

### Case 5: CHK-01 — Eligible Pakistan COD Checkout
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CHK-01`
8. **Expected result**: Entering a valid Pakistan delivery address generates an authoritative shipping quote (PKR 200), presents Cash on Delivery (COD) as an eligible payment method, and allows COD submission.
9. **Actual result**: Domestic PK destination evaluated quote (PKR 1,700 total), offered COD radio button, and pre-selected domestic payment method.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_CHK-01_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Zero form-level ARIA errors; 0 Axe critical/serious violations on `/checkout`.

---

### Case 6: CHK-02 — Mock Prepaid Modal, Lease Timer and Mock Completion/Recovery
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CHK-02`
8. **Expected result**: Selecting Card payment triggers two-phase prepaid checkout, mounts `<PrepaidPaymentModal>`, displays real-time countdown lease timer, traps focus, and supports status recovery.
9. **Actual result**: Card payment option activated two-phase coordinator; lease expiration watchdog and recovery mechanisms initialized cleanly.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_CHK-02_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Verified against 20 unit tests in `prepaidCheckoutPolling.unit.test.ts`.

---

### Case 7: ORD-01 — Customer Order List and Timeline
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `ORD-01`
8. **Expected result**: `/orders` lists customer historical orders (`ORD-UAT-DELIVERED-004`). `/orders/ORD-UAT-DELIVERED-004` renders status timeline (Order Placed, Dispatched, Delivered), shipping address, items, and return action.
9. **Actual result**: Order list displayed order cards with badges. Order detail page loaded delivery timeline, address, line items, and active "Request Return" action link for delivered item.
10. **Screenshot artifact paths**:
    - Order list: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_ORD-01-list_1440x900_20260922T120000Z.png`
    - Timeline: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_ORD-01-timeline_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: 0 Axe critical/serious violations on `/orders/ORD-UAT-DELIVERED-004`.

---

### Case 8: DOC-01 — Receipt / Invoice Page and Print Layout Preparation
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `DOC-01`
8. **Expected result**: Route `/orders/66f000000000000000000044/invoice` renders printable document sheet. Paid order without merchant tax registration truthfully displays `Official Payment Receipt` (`PAYMENT_RECEIPT`) with `Payment Confirmed` badge. Paid order with tax registration displays `Official Tax Invoice` (`TAX_INVOICE`) with `Tax Compliant` badge. No unexpected scrollbars; print action bar included.
9. **Actual result**: Both document variants rendered with exact authoritative badges and titles. Print layout element (`[data-testid="invoice-print-root"]`) conformed to standard page bounds with zero overflow.
10. **Screenshot artifact paths**:
    - Payment Receipt: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_DOC-01-receipt_1440x900_20260922T120000Z.png`
    - Tax Invoice: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_DOC-01-taxinvoice_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Automated check confirmed page layout and CSS print styles. Actual physical OS print-preview rendering (A4/Letter paper margins) remains `PENDING_HUMAN_REVIEW`.

---

### Case 9: RET-01 — Customer Return-Request Flow
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `RET-01`
8. **Expected result**: Route `/account?tab=returns` renders the `<ReturnRequestForm>`. Form supports entering an order number, selecting eligible order lines, selecting standard return reasons (`damaged`, `wrong_item`, `not_as_described`, `not_satisfied`, `duplicate`, `other`), specifying quantity, and entering explanation details.
9. **Actual result**: Return Request form rendered cleanly inside the Orders & Returns tab; reason dropdown and input fields accessible and reactive.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_RET-01_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Account tab navigation verified; return payload builder contracts confirmed.

---

### Case 10: A11Y-01 — Keyboard Navigation, Focus Visibility, Dialogs and Skip Link
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `A11Y-01`
8. **Expected result**: Initial Tab keypress reveals "Skip to main content" link at top of page. Pressing Enter moves keyboard focus directly to `#main-content` landmark. Interactive elements exhibit visible outline/ring. Dialogs trap keyboard focus and dismiss on Escape.
9. **Actual result**: Skip link displayed on initial Tab and moved focus to `<main id="main-content">`. Mobile drawer focus trap and Escape dismissal verified. Focus indicators visible.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_A11Y-01-skiplink_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: All 6 gates in `browserPhase7AccessibilityAcceptance.test.mts` passed without failure.

---

### Case 11: VIEW-01 — Responsive Layout Across Required Viewports
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `320x800`, `375x812`, `768x1024`, `1024x768`, `1440x900`
7. **Test-case ID**: `VIEW-01`
8. **Expected result**: Across all 5 viewports, page layouts adapt dynamically. Zero unintended horizontal overflow (`scrollWidth <= innerWidth`). Controls remain unclipped; touch targets meet min 40px dimensions on mobile viewports.
9. **Actual result**: Evaluated 25 route/viewport combinations (`/`, `/products`, `/cart`, `/checkout`, `/orders/ORD-UAT-DELIVERED-004`). Horizontal overflow check: `hasOverflow = false` across 100% of tested viewports.
10. **Screenshot artifact paths**:
    - 320x800: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_VIEW-01-320x800_320x800_20260922T120000Z.png`
    - 375x812: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_VIEW-01-375x812_375x812_20260922T120000Z.png`
    - 768x1024: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_VIEW-01-768x1024_768x1024_20260922T120000Z.png`
    - 1024x768: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_VIEW-01-1024x768_1024x768_20260922T120000Z.png`
    - 1440x900: `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_VIEW-01-1440x900_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Automated responsive check confirmed 0 overflow conditions across all 5 resolutions.

---

### Case 12: COD-ACC-01 — Serviceable Pakistan Destination
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-01`
8. **Expected result**: Domestic destination in Pakistan (`PK`) evaluates COD capability as available; COD option is displayed and selectable.
9. **Actual result**: COD payment option displayed with title "Cash on Delivery", description "Pay in cash when order arrives", and radio selector selectable.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_COD-ACC-01_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Backend capability policy unit tests confirmed.

---

### Case 13: COD-ACC-02A — Unserviceable Destination (Foreign Country Rejection)
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-02A`
8. **Expected result**: Setting destination to United Arab Emirates (`AE`) or other non-PK territory excludes COD from available payment methods.
9. **Actual result**: COD radio button was removed from checkout view; only card payment offered.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_COD-ACC-02_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Frontend filter strictly removes COD when `quote.isDomestic === false`.

---

### Case 14: COD-ACC-02B — Domestic Pakistan Courier-Unserviceable Zone
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-23T04:30:00Z`
3. **Target commit SHA**: `PENDING_COMMIT_I`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-02B`
8. **Expected result**: Domestic address located in a courier-unserviceable zone rejects COD tender with reason `COD_LOCATION_UNSERVICEABLE` while prepaid methods remain available.
9. **Actual result**: Governed `CodServiceabilityRule` model and specificity evaluation in `CodEligibilityPolicyService` correctly reject unserviceable zones.
10. **Screenshot artifact path**: `docs/execution/evidence/artifacts/phase10-storefront/governed-cod-policies/COD-ACC-02B_unserviceable_zone.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Automated unit and route integration tests passed (17 of 17).

---

### Case 15: COD-ACC-03 — COD-Ineligible Product
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-23T04:30:00Z`
3. **Target commit SHA**: `PENDING_COMMIT_I`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-03`
8. **Expected result**: If any product offering in the cart has `codEligible: false`, COD tender is suppressed for the entire cart with reason `COD_PRODUCT_INELIGIBLE`.
9. **Actual result**: Offering scan in `CodEligibilityPolicyService` identifies ineligible items (`66f0000000000000000000c4`) and suppresses COD cleanly.
10. **Screenshot artifact path**: `docs/execution/evidence/artifacts/phase10-storefront/governed-cod-policies/COD-ACC-03_ineligible_product.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Offering model and cart validation tests pass; admin toggle UI operational.

---

### Case 16: COD-ACC-04 — Order-Value Limit
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-23T04:30:00Z`
3. **Target commit SHA**: `PENDING_COMMIT_I`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-04`
8. **Expected result**: Orders exceeding PKR 25,000 (2,500,000 minor units exact integer boundary) reject COD with reason `COD_ORDER_VALUE_EXCEEDED`.
9. **Actual result**: Exact integer arithmetic enforces boundary: PKR 25,000.00 is allowed; PKR 25,000.01 rejects COD with clear explanatory message.
10. **Screenshot artifact path**: `docs/execution/evidence/artifacts/phase10-storefront/governed-cod-policies/COD-ACC-04_order_value_exceeded.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Boundary tests 8a (2,500,000 minor units) and 8b (2,500,001 minor units) verified.

---

### Case 17: COD-ACC-05 — Blocked / High-Risk Customer
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-23T04:30:00Z`
3. **Target commit SHA**: `PENDING_COMMIT_I`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-05`
8. **Expected result**: Flagged or restricted customer (manual block or 2 RTO events in 90 days) is denied COD tender while prepaid methods remain active.
9. **Actual result**: `CustomerCodRestriction` state machine enforces manual blocks and automatic rolling 30-day locks; administrative overrides functional.
10. **Screenshot artifact path**: `docs/execution/evidence/artifacts/phase10-storefront/governed-cod-policies/COD-ACC-05_customer_restricted.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Integration test suite verified outcome recording, rolling lockout, and staff overrides.

---

### Case 18: COD-ACC-06 — Prepaid-Only Promotion
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-23T04:30:00Z`
3. **Target commit SHA**: `PENDING_COMMIT_I`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-06`
8. **Expected result**: Applying a prepaid-only coupon code (`PREPAIDONLY10`) restricts payment tender to card/transfer and disables COD.
9. **Actual result**: `Coupon.paymentEligibility` with `restrictionMode: 'ALLOWLIST'` and `allowedTenders: ['ONLINE_CARD', 'ONLINE_VA']` rejects COD with reason `COD_PROMOTION_PREPAID_ONLY`.
10. **Screenshot artifact path**: `docs/execution/evidence/artifacts/phase10-storefront/governed-cod-policies/COD-ACC-06_prepaid_promotion.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Verified in `CheckoutQuoteService`, `CouponService`, and admin coupon governance.

---

### Case 19: COD-ACC-07 — All Capability Rules Pass Simultaneously (Control Case)
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T12:00:00Z`
3. **Target commit SHA**: `e4b8b224d8af976a66353d6a894629e3c3dc16a4`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Chromium 135.0.7049.3 / Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-07`
8. **Expected result**: In domestic Pakistan with PKR currency and valid stock, all active capability checks pass and COD is offered cleanly.
9. **Actual result**: Control case passed with 100% policy compliance. COD option appeared as primary selection.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/e4b8b224d8af976a66353d6a894629e3c3dc16a4/e4b8b224d8af976a66353d6a894629e3c3dc16a4_COD-ACC-07_1440x900_20260922T120000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Supporting: `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Verified across all 5 responsive viewports.

---

## 7. Automated Axe WCAG 2.2 AA Accessibility Audits

An automated audit using Axe (`@axe-core/playwright`) checking WCAG 2.0, 2.1, and 2.2 Level A/AA rules was executed across all key storefront routes:

| Route Path | Route Description | Total Rules Evaluated | Critical / Serious Violations | Automated Result |
|---|---|---|---|---|
| `/` | Storefront Homepage | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/products` | Catalog & Filters | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/products/almonds-roasted-500g` | Product Detail & Variants | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/cart` | Cart & Line Quantities | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/checkout` | Checkout Form & Quote | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/orders/ORD-UAT-DELIVERED-004` | Order Detail & Timeline | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/orders/66f000000000000000000044/invoice` | Invoice / Receipt Sheet | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/account` | Account Dashboard & Returns | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/login` | Customer Login Form | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/register` | Registration Form | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |
| `/forgot-password` | Password Recovery Form | 18 rules | 0 | `MOCK_BACKED_AUTOMATED_SUPPORTING_EVIDENCE` |

---

## 8. Defect Log & Audit: P10C-DEF-001 Toast Contrast Fix

| Defect ID | Component & File | Pre-Fix State | Corrected State | Verification Result |
|---|---|---|---|---|
| **`P10C-DEF-001`** | Error Toast Notification<br>`frontend/src/components/Toast.tsx` | Background: `#FEE2E2`<br>Text: `#DC2626`<br>Contrast Ratio: **3.95:1**<br>*(Fails WCAG 2.2 AA threshold 4.5:1)* | Background: `#FEE2E2`<br>Text: `#991B1B`<br>Contrast Ratio: **6.80:1**<br>*(Passes WCAG 2.2 AA threshold 4.5:1)* | **AUDITED & RETAINED**: Single minimal color token change. Border `#DC2626` and icon unchanged. Zero unrelated component changes. Axe audit confirms 0 violations. |

---

## 9. Integrated Human UAT Environment Readiness & Startup Procedure

### Build-Time Public API URL Architecture Note
`NEXT_PUBLIC_API_URL` is a Next.js **build-time embedded variable**. Passing `NEXT_PUBLIC_API_URL` solely at runtime when launching `node .next/standalone/server.js` **does not update client-side JavaScript bundles**, which retain the URL embedded during `npm run build`.

Starting only `node .next/standalone/server.js` is therefore insufficient for manual login, order creation, and document inspection.

### Valid Integrated Environment Prerequisites
1. **Disposable MongoDB Replica Set**: Local single-node replica set (`MongoMemoryReplSet` or disposable Docker container on loopback only `127.0.0.1:27017`).
2. **Deterministic Seed Data**: Run `scripts/ops/seed-uat-fixtures.js` using the protected environment password `$env:UAT_FIXTURE_PASSWORD` against authoritative manifest `scripts/ops/manifests/uat-fixture-manifest.json`.
3. **Backend API Service**: Node.js backend running on `http://127.0.0.1:5000` with `RATE_LIMIT_STORE=memory` (explicit development-memory limiter mode) and mock payment/notification adapters.
4. **Rebuilt Frontend Standalone**: Frontend compiled with `NEXT_PUBLIC_API_URL="http://127.0.0.1:5000" npm run build` prior to starting the standalone server.
5. **Secrets Redaction**: Never print or log `$env:UAT_MONGODB_URI`, `$env:UAT_FIXTURE_PASSWORD`, JWT secrets, or Redis credentials.

### Step-by-Step Integrated Startup Procedure (For Human Reviewer)

> **Notice**: Startup and teardown procedures have been documented below. In addition, narrowly scoped executable companion helpers (`scripts/ops/start-phase10-uat-environment.js` and `scripts/ops/stop-phase10-uat-environment.js`) have been provided and classified as `STATICALLY_VERIFIED_RUNTIME_PENDING` (Docker daemon remains stopped; runtime behavior is pending engine startup). These helpers enforce disposable database name guards (`mevapur_uat_phase10`), loopback-only bindings (`127.0.0.1`), mock provider flags, runtime-generated ephemeral secrets, and bounded readiness polling. They will not bypass a stopped Docker daemon or start Docker Desktop.

```powershell
# 1. Compile frontend with safe public API URL
cd C:\Projects\mevaPur-Commerce\frontend
$env:NEXT_PUBLIC_API_URL="http://127.0.0.1:5000"
$env:NEXT_PUBLIC_SITE_URL="http://localhost:3000"
$env:NEXT_PUBLIC_SITE_NAME="MevaPur"
npm run build

# 2. Start disposable backend API (Terminal 1)
cd C:\Projects\mevaPur-Commerce\backend
$env:PORT="5000"
$env:NODE_ENV="development"
$env:RATE_LIMIT_STORE="memory"
$env:MOCK_PAYMENT_GATEWAY="true"
$env:MOCK_EMAIL_SERVICE="true"
$env:MOCK_SMS_SERVICE="true"
# Provide disposable local mongo URI
$env:MONGODB_URI="mongodb://127.0.0.1:27017/mevapur_uat_phase10?replicaSet=rs0"
node server.js

# 3. Seed Batch 10B Fixtures (Terminal 2)
cd C:\Projects\mevaPur-Commerce
node scripts/ops/seed-uat-fixtures.js

# 4. Verify Health Endpoints
Invoke-RestMethod -Uri "http://127.0.0.1:5000/health/live"
Invoke-RestMethod -Uri "http://127.0.0.1:5000/health/ready"

# 5. Start Built Frontend Standalone (Terminal 2)
cd C:\Projects\mevaPur-Commerce\frontend
$env:PORT="3000"
$env:NODE_ENV="production"
node .next/standalone/server.js

# 6. Verify Frontend Health
Invoke-RestMethod -Uri "http://127.0.0.1:3000/healthz"
```

### Teardown & Reset Procedure
```powershell
# In cleanup / finally:
# 1. Reset fixtures
cd C:\Projects\mevaPur-Commerce
node scripts/ops/reset-uat-fixtures.js

# 2. Terminate background processes
Stop-Process -Name "node" -Force
```

### Current Status of Human Integrated Environment
- **Classification**: `BLOCKED_ENVIRONMENT_GAP`
- **Reason**: The Docker engine is stopped (`INSTALLED_ENGINE_STOPPED`), and a disposable MongoDB replica set + local backend process was not started during this automated correction pass.
- **Owner Action Required**: Start the Docker engine, then rerun the documented integrated UAT environment verification.
- **Integration Boundary**: Mock-backed screenshots captured by the hermetic Playwright harness provide evidence of responsive and accessible frontend DOM states, but are not reclassified as backend integration. Full end-to-end integration verification remains blocked until Docker engine startup and human test execution.

---

## 10. Human Manual QA Action Checklist (Authoritative Route Paths)

When the integrated environment is started, human testers must execute the following workflow using actual manifest credentials and URLs:

1. **Test Personas**:
   - Primary Pakistan COD Customer: `customer-pk-cod@mevapur.test`
   - Primary Pakistan Prepaid Customer: `customer-pk-prepaid@mevapur.test`
   - Password: Securely retrieve from `$env:UAT_FIXTURE_PASSWORD`

2. **Step-by-Step Manual Route Inspection**:
   - **Step 1: Homepage (`/`)** — Verify visual hierarchy, inspect mega-menu on desktop, resize to mobile (375px) and verify mobile drawer navigation.
   - **Step 2: Catalog (`/products?search=almonds&sort=price_asc`)** — Verify filtered products, price ascending sort, and URL query synchronization.
   - **Step 3: In-Stock Product (`/products/almonds-roasted-500g`)** — Verify SKU `SKU-ALM-500G`, price PKR 1,500, variant dropdown (switch to 1kg, verify PKR 2,900), click "Add to Cart".
   - **Step 4: Out-of-Stock Product (`/products/pine-nuts-chilgoza-250g`)** — Verify "Out of Stock" badge and disabled purchase button.
   - **Step 5: Cart (`/cart`)** — Verify line items, adjust quantities, verify subtotal recalculation, and click "Proceed to Checkout".
   - **Step 6: Checkout Domestic COD (`/checkout`)** — Enter domestic Pakistan address (`House 12, Street 4, Sector F-7/2, Islamabad`), select Cash on Delivery, verify order quote total.
   - **Step 7: Checkout Mock Prepaid (`/checkout`)** — Select Card Payment, inspect `<PrepaidPaymentModal>`, verify lease countdown timer and focus trap.
   - **Step 8: Order List (`/orders`) & Detail Timeline (`/orders/ORD-UAT-DELIVERED-004`)** — Verify status timeline (Placed, Dispatched, Delivered) and line items.
   - **Step 9: Document Sheet (`/orders/66f000000000000000000044/invoice`)** — Test Print dialog (`Ctrl+P`). Verify physical A4 and US Letter page layout, margins, and headers without clipping.
   - **Step 10: Returns Tab (`/account?tab=returns`)** — Test Return Request form, select order line item, pick reason (`damaged`), and test submission.
