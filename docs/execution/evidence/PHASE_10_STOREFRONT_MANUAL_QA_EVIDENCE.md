# Phase 10 — Batch 10C Storefront Manual QA and Accessibility Evidence Ledger

> **Notice**: Automated preparation harness output only. In accordance with the Phase 10 human-QA boundary, automated observations are labeled `AUTOMATED_SUPPORTING_EVIDENCE`. All human evaluation cases remain `PENDING_HUMAN_REVIEW` until an authorized human reviewer inspects visual rendering, keyboard usability, and assistive technology behavior.

---

## 1. Execution & Environment Metadata

| Metadata Field | Recorded Value |
|---|---|
| **Target Commit SHA** | `d520b8669340cf83fc0f3cd02f522a29268c221c` |
| **Parent Commit SHA** | `050ee06f269e039f5fd71c36b19f2a29f251bad8` |
| **Execution Timestamp (UTC)** | `2026-09-22T11:50:00Z` |
| **Environment / Build ID** | `LOCAL-UAT-STANDALONE-PORT-3528` |
| **Operating System** | `Windows 11 Pro (win32 10.0.26100)` |
| **Browser Engine & Version** | `Google Chrome 153.0.8010.50 (Playwright Chromium Launcher)` |
| **Storefront Base URL** | `http://127.0.0.1:3528` (disposable standalone build) |
| **Backend API Base URL** | `http://127.0.0.1:5000` (secrets redacted; intercepted via deterministic UAT mock router) |
| **UAT Fixture Namespace** | `mevapur_uat_phase10_v1` (Batch 10B deterministic manifest) |
| **Automated Harness Status** | `AUTOMATED_SUPPORTING_EVIDENCE_CAPTURED` |
| **Human Sign-off Status** | `PENDING_HUMAN_REVIEW` (Human acceptance closure strictly reserved for owner) |

---

## 2. Fixture Coverage Audit & Classification

Before executing automation, all Batch 10B fixtures were audited against manual test requirements:

| Persona / Condition | Fixture ID / Attribute | Classification | Audit Details |
|---|---|---|---|
| **Pakistan COD Customer** | `customer-pk-cod@mevapur.test` (`69a000000000000000000001`) | `FIXTURE_READY` | Domestic PK delivery address, domestic PKR quote, COD eligible. |
| **Pakistan Mock-Prepaid Customer** | `customer-pk-prepaid@mevapur.test` (`69a000000000000000000002`) | `FIXTURE_READY` | Domestic PK delivery address, prepaid/card payment flow. |
| **Transient Guest Persona** | `guestCheckoutPersona` | `FIXTURE_READY` | Anonymous session, transient address input, guest COD/card checkout. |
| **International-Disabled Persona (AE)** | `customer-ae-disabled@mevapur.test` (`69a000000000000000000003`) | `FIXTURE_READY` | Cross-border address; COD strictly prohibited by policy; card payment only. |
| **International-Disabled Persona (GB)** | `customer-gb-disabled@mevapur.test` (`69a000000000000000000004`) | `FIXTURE_READY` | Cross-border destination; governed policy blocks COD. |
| **In Stock Product** | `SKU-ALM-500G` / `prod-almonds-001` | `FIXTURE_READY` | ATP 100, price PKR 1,500, active published catalog status. |
| **Low Stock Product** | `SKU-PIS-250G` / `prod-pistachios-002` | `FIXTURE_READY` | ATP 5, price PKR 1,200, low inventory warning threshold active. |
| **Out of Stock Product** | `SKU-CHIL-250G` / `prod-chilgoza-003` | `FIXTURE_READY` | ATP 0, price PKR 4,500, add-to-cart controls disabled. |
| **Active Promotion / Variants** | `SKU-WAL-500G` / `prod-walnuts-004` | `FIXTURE_READY` | Multiple weight variants (500g, 1kg), promotional sale prices. |
| **COD Serviceable (PK)** | Domestic Pakistan destinations | `FIXTURE_READY` | `PaymentCapabilityPolicy.js` evaluates `available: true`. |
| **COD Unserviceable (Int'l)** | Destinations outside PK (AE, GB, US) | `FIXTURE_READY` | `PaymentCapabilityPolicy.js` strictly restricts COD to destination `PK`. |
| **COD Ineligible Product** | Per-product COD restriction | `POLICY_NOT_IMPLEMENTED` | No product-level COD blacklist exists in backend capability policy. |
| **COD Order-Value Limit** | Maximum order total ceiling | `POLICY_NOT_IMPLEMENTED` | No order amount ceiling is enforced in `PaymentCapabilityPolicy.js`. |
| **COD High-Risk / Blocked User** | Customer blacklist / risk tiering | `POLICY_NOT_IMPLEMENTED` | Risk score / fraud blacklist is not implemented in current policy. |
| **COD Prepaid-Only Promotion** | Coupon forcing prepaid payment | `POLICY_NOT_IMPLEMENTED` | Promotion engine does not contain prepaid-only tender restriction. |
| **COD All Rules Pass Control** | Domestic PK, PKR currency, valid stock | `FIXTURE_READY` | All active backend capability policy checks pass simultaneously. |

---

## 3. Viewport Matrix Specifications

Screenshots were captured across all 5 mandatory viewports:

1. **320 × 800**: Mobile Mini (narrow portrait smartphone)
2. **375 × 812**: Mobile Standard (contemporary smartphone portrait)
3. **768 × 1024**: Tablet Portrait (iPad / medium touchscreen)
4. **1024 × 768**: Desktop Standard (small laptop / landscape tablet)
5. **1440 × 900**: Desktop HD (standard desktop monitor)

---

## 4. Test Case Evidence Ledger (13 Standard Fields per Case)

### Case 1: NAV-01 — Homepage, Navigation, Mega-Menu, Category Routing, Mobile Drawer
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW` (Automated supporting pass by Antigravity Harness)
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)` & `375x812 (Mobile Standard)`
7. **Test-case ID**: `NAV-01`
8. **Expected result**: Header navbar renders brand logo, mega-menu category navigation, search bar, and cart trigger. On mobile (375x812), hamburger toggle opens sliding drawer, traps focus, locks body scroll, and provides accessible close action.
9. **Actual result**: Header rendered cleanly at 1440x900 with visible category links. At 375x812, mobile menu button toggled navigation drawer; body scroll lock confirmed; close button restored focus.
10. **Screenshot artifact paths**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_NAV-01_1440x900_20260922T115000Z.png`
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_NAV-01_375x812_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Zero console errors; touch target size >= 40px verified.

---

### Case 2: CAT-01 — Category / Search / Filter / Sort and URL Query Synchronization
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CAT-01`
8. **Expected result**: Navigating to `/products?search=almonds&sort=price_asc` renders matching catalog products, sets search input value, synchronizes URL query parameters, and provides sort options.
9. **Actual result**: Catalog grid loaded filtered products, search query was reflected in URL state, category filters and sort dropdown displayed without layout shifts.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_CAT-01_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Axe audit on `/products` found 0 critical/serious violations; 18 passed rules.

---

### Case 3: PRD-01 — Product Detail, Variants, SKU, Price, Image, Out-of-Stock Behavior
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `PRD-01`
8. **Expected result**: In-stock product (`SKU-ALM-500G`, ATP 100) displays formatted price (PKR 1,500), SKU, origin, and enabled "Add to Cart" button. Switching weight variant updates SKU and price. Out-of-stock product (`SKU-CHIL-250G`, ATP 0) displays "Out of Stock" badge and disabled purchase button.
9. **Actual result**: Both in-stock and out-of-stock states rendered accurately. In-stock allowed purchase actions; out-of-stock clearly prohibited adding to cart.
10. **Screenshot artifact paths**:
    - In-stock: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_PRD-01-instock_1440x900_20260922T115000Z.png`
    - Out-of-stock: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_PRD-01-outofstock_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Axe audit on product detail found 0 critical/serious violations; 18 passed rules.

---

### Case 4: CRT-01 — Cart Add/Remove/Quantity/Subtotal/Refresh Persistence
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CRT-01`
8. **Expected result**: Cart displays line items, quantities, unit prices, subtotal (2 × PKR 1,500 = PKR 3,000), and checkout CTA. Items persist across page reload in `localStorage` (`storefront-cart-storage`).
9. **Actual result**: Cart rendered California Almonds 500g (qty 2), computed exact subtotal PKR 3,000, and preserved item state upon page navigation.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_CRT-01_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Reconcile logic and store persistence verified; 0 Axe violations on `/cart`.

---

### Case 5: CHK-01 — Eligible Pakistan COD Checkout
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CHK-01`
8. **Expected result**: Entering a valid Pakistan delivery address generates an authoritative shipping quote (PKR 200), presents Cash on Delivery (COD) as an eligible payment method, and allows COD submission.
9. **Actual result**: Domestic PK destination evaluated quote (PKR 3,200 total), offered COD radio button, and pre-selected domestic payment method.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_CHK-01_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Zero form-level ARIA errors; 0 Axe critical/serious violations on `/checkout`.

---

### Case 6: CHK-02 — Mock Prepaid Modal, Lease Timer and Mock Completion/Recovery
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `CHK-02`
8. **Expected result**: Selecting Card payment triggers two-phase prepaid checkout, mounts `<PrepaidPaymentModal>`, displays real-time countdown lease timer, traps focus, and supports status recovery.
9. **Actual result**: Card payment option activated two-phase coordinator; lease expiration watchdog and recovery mechanisms initialized cleanly.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_CHK-02_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Verified against 20 unit tests in `prepaidCheckoutPolling.unit.test.ts`.

---

### Case 7: ORD-01 — Customer Order List and Timeline
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `ORD-01`
8. **Expected result**: `/orders` lists customer historical orders (`ORD-PHASE10-001`). `/orders/[id]` renders status timeline (Order Placed, Payment Verified, Processing, Dispatched, Delivered), shipping address, items, and return action.
9. **Actual result**: Order list displayed order cards with badges. Order detail page loaded delivery timeline, address, line items, and active "Request Return" action link for delivered item.
10. **Screenshot artifact paths**:
    - Order list: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_ORD-01-list_1440x900_20260922T115000Z.png`
    - Timeline: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_ORD-01-timeline_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: 0 Axe critical/serious violations on `/orders/[id]`.

---

### Case 8: DOC-01 — Receipt / Invoice Page and Print Layout Preparation
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `DOC-01`
8. **Expected result**: Route `/orders/[id]/invoice` renders printable document sheet. Paid order without merchant tax registration truthfully displays `Official Payment Receipt` (`PAYMENT_RECEIPT`) with `Payment Confirmed` badge. Paid order with tax registration displays `Official Tax Invoice` (`TAX_INVOICE`) with `Tax Compliant` badge. No unexpected scrollbars; print action bar included.
9. **Actual result**: Both document variants rendered with exact authoritative badges and titles. Print layout element (`[data-testid="invoice-print-root"]`) conformed to standard page bounds with zero overflow.
10. **Screenshot artifact paths**:
    - Payment Receipt: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_DOC-01-receipt_1440x900_20260922T115000Z.png`
    - Tax Invoice: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_DOC-01-taxinvoice_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Classification rules verified against Phase 8 document truthfulness test suite (100% pass).

---

### Case 9: RET-01 — Customer Return-Request Flow
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `RET-01`
8. **Expected result**: Route `/account?tab=returns` renders the `<ReturnRequestForm>`. Form supports entering an order number, selecting eligible order lines, selecting standard return reasons (`damaged`, `wrong_item`, `not_as_described`, `not_satisfied`, `duplicate`, `other`), specifying quantity, and entering explanation details.
9. **Actual result**: Return Request form rendered cleanly inside the Orders & Returns tab; reason dropdown and input fields accessible and reactive.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_RET-01_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Account tab navigation verified; return payload builder contracts confirmed.

---

### Case 10: A11Y-01 — Keyboard Navigation, Focus Visibility, Dialogs and Skip Link
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `A11Y-01`
8. **Expected result**: Initial Tab keypress reveals "Skip to main content" link at top of page. Pressing Enter moves keyboard focus directly to `#main-content` landmark. Interactive elements exhibit visible outline/ring. Dialogs trap keyboard focus and dismiss on Escape.
9. **Actual result**: Skip link displayed on initial Tab and moved focus to `<main id="main-content">`. Mobile drawer focus trap and Escape dismissal verified. Focus indicators visible.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_A11Y-01-skiplink_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: All 6 gates in `browserPhase7AccessibilityAcceptance.test.mts` passed without failure.

---

### Case 11: VIEW-01 — Responsive Layout Across Required Viewports
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `320x800`, `375x812`, `768x1024`, `1024x768`, `1440x900`
7. **Test-case ID**: `VIEW-01`
8. **Expected result**: Across all 5 viewports, page layouts adapt dynamically. Zero unintended horizontal overflow (`scrollWidth <= innerWidth`). Controls remain unclipped; touch targets meet min 40px dimensions on mobile viewports.
9. **Actual result**: Evaluated 25 route/viewport combinations (`/`, `/products`, `/cart`, `/checkout`, `/orders/[id]`). Horizontal overflow check: `hasOverflow = false` across 100% of tested viewports.
10. **Screenshot artifact paths**:
    - 320x800: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_VIEW-01-320x800_320x800_20260922T115000Z.png`
    - 375x812: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_VIEW-01-375x812_375x812_20260922T115000Z.png`
    - 768x1024: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_VIEW-01-768x1024_768x1024_20260922T115000Z.png`
    - 1024x768: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_VIEW-01-1024x768_1024x768_20260922T115000Z.png`
    - 1440x900: `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_VIEW-01-1440x900_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated status: `AUTOMATED_SUPPORTING_EVIDENCE`)
13. **Retest evidence**: Automated responsive check confirmed 0 overflow conditions across all 5 resolutions.

---

### Case 12: COD-ACC-01 — Serviceable Pakistan Destination
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-01`
8. **Expected result**: Domestic destination in Pakistan (`PK`) evaluates COD capability as available; COD option is displayed and selectable.
9. **Actual result**: COD payment option displayed with title "Cash on Delivery", description "Pay in cash when order arrives", and radio selector selectable.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_COD-ACC-01_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated classification: `FIXTURE_READY`)
13. **Retest evidence**: Backend capability policy unit tests confirmed.

---

### Case 13: COD-ACC-02 — Unserviceable Destination (International)
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-02`
8. **Expected result**: Setting destination to United Arab Emirates (`AE`) or other non-PK territory excludes COD from available payment methods.
9. **Actual result**: COD radio button was removed from checkout view; only card payment (Stripe) offered.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_COD-ACC-02_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated classification: `FIXTURE_READY`)
13. **Retest evidence**: Frontend filter strictly removes COD when `quote.isDomestic === false`.

---

### Case 14: COD-ACC-03 — COD-Ineligible Product
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-03`
8. **Expected result**: If a product is restricted from COD, cart containing that item should suppress COD option.
9. **Actual result**: `POLICY_NOT_IMPLEMENTED`. In the current codebase (`PaymentCapabilityPolicy.js`), COD capability is evaluated solely based on country code (`PK`) and settlement currency (`PKR`). No per-product COD blacklist exists in data models or backend policy.
10. **Screenshot artifact path**: `N/A (Policy not implemented in current codebase)`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated classification: `POLICY_NOT_IMPLEMENTED`)
13. **Retest evidence**: Truthful recording; no synthetic or unbacked policy invented.

---

### Case 15: COD-ACC-04 — Order-Value Limit
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-04`
8. **Expected result**: Orders exceeding a maximum order-value threshold should disallow COD.
9. **Actual result**: `POLICY_NOT_IMPLEMENTED`. `PaymentCapabilityPolicy.js` does not enforce a maximum order ceiling for COD.
10. **Screenshot artifact path**: `N/A (Policy not implemented in current codebase)`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated classification: `POLICY_NOT_IMPLEMENTED`)
13. **Retest evidence**: Source code audit of `backend/services/payment/PaymentCapabilityPolicy.js` confirmed.

---

### Case 16: COD-ACC-05 — Blocked / High-Risk Customer
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-05`
8. **Expected result**: High-risk or flagged users should be denied COD tender.
9. **Actual result**: `POLICY_NOT_IMPLEMENTED`. Customer risk scoring or COD blacklisting is not implemented in the current payment capability policy.
10. **Screenshot artifact path**: `N/A (Policy not implemented in current codebase)`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated classification: `POLICY_NOT_IMPLEMENTED`)
13. **Retest evidence**: Documented truthfully as an unimplemented business policy.

---

### Case 17: COD-ACC-06 — Prepaid-Only Promotion
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-06`
8. **Expected result**: Applying a prepaid-only coupon code disables COD payment.
9. **Actual result**: `POLICY_NOT_IMPLEMENTED`. The coupon/promotion engine does not currently contain payment method exclusivity rules.
10. **Screenshot artifact path**: `N/A (Policy not implemented in current codebase)`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated classification: `POLICY_NOT_IMPLEMENTED`)
13. **Retest evidence**: Documented as an unimplemented policy feature.

---

### Case 18: COD-ACC-07 — All Capability Rules Pass Simultaneously (Control Case)
1. **Tester name/identity**: `PENDING_HUMAN_REVIEW`
2. **Execution timestamp**: `2026-09-22T11:50:00Z`
3. **Target commit SHA**: `d520b8669340cf83fc0f3cd02f522a29268c221c`
4. **Environment/build ID**: `LOCAL-UAT-STANDALONE-PORT-3528`
5. **Browser/version**: `Google Chrome 153.0.8010.50`
6. **Viewport/device**: `1440x900 (Desktop HD)`
7. **Test-case ID**: `COD-ACC-07`
8. **Expected result**: In domestic Pakistan with PKR currency and valid stock, all active capability checks pass and COD is offered cleanly.
9. **Actual result**: Control case passed with 100% policy compliance. COD option appeared as primary selection.
10. **Screenshot artifact path**:
    - `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/d520b8669340cf83fc0f3cd02f522a29268c221c_COD-ACC-07_1440x900_20260922T115000Z.png`
11. **Defect ID**: `NONE`
12. **Verdict**: `PENDING_HUMAN_REVIEW` (Automated classification: `FIXTURE_READY`)
13. **Retest evidence**: Verified across all 5 responsive viewports.

---

## 5. Automated Axe WCAG 2.2 AA Accessibility Audits

An automated audit using Axe (`@axe-core/playwright`) checking WCAG 2.0, 2.1, and 2.2 Level A/AA rules was executed across all key storefront routes:

| Route Path | Route Description | Total Rules Evaluated | Critical / Serious Violations | Automated Result |
|---|---|---|---|---|
| `/` | Storefront Homepage | 18 rules | 0 | `AUTOMATED_PASS` |
| `/products` | Catalog & Filters | 18 rules | 0 | `AUTOMATED_PASS` |
| `/products/prod-almonds-001` | Product Detail & Variants | 18 rules | 0 | `AUTOMATED_PASS` |
| `/cart` | Cart & Line Quantities | 18 rules | 0 | `AUTOMATED_PASS` |
| `/checkout` | Checkout Form & Quote | 18 rules | 0 | `AUTOMATED_PASS` |
| `/orders/[id]` | Order Detail & Timeline | 18 rules | 0 | `AUTOMATED_PASS` |
| `/orders/[id]/invoice` | Invoice / Receipt Sheet | 18 rules | 0 | `AUTOMATED_PASS` |
| `/account` | Account Dashboard & Returns | 18 rules | 0 | `AUTOMATED_PASS` |
| `/login` | Customer Login Form | 18 rules | 0 | `AUTOMATED_PASS` |
| `/register` | Registration Form | 18 rules | 0 | `AUTOMATED_PASS` |
| `/forgot-password` | Password Recovery Form | 18 rules | 0 | `AUTOMATED_PASS` |

---

## 6. Discovered Defect Log & Remediation

| Defect ID | Severity | Route & Component | Description | Resolution Status |
|---|---|---|---|---|
| **`P10C-DEF-001`** | Serious | Global (`Toast.tsx`), observed on `/account` | Error toast notification rendered text `#DC2626` on background `#FEE2E2`, giving a contrast ratio of 3.95:1 (failing WCAG 2.2 AA minimum threshold of 4.5:1). | **RESOLVED (Batch 10C)**: Minimal color adjustment in `frontend/src/components/Toast.tsx` from `#DC2626` to `#991B1B` (contrast ratio 6.80:1 on `#FEE2E2`). All 383 unit tests, postbuild tests, and Axe audits rerun and confirmed passing. |

---

## 7. Automated Regression Suite Verification Summary

| Test Suite / Command | Scope | Suite Count | Test Count | Result | Exit Code |
|---|---|---|---|---|---|
| `frontend: npm run lint` | Frontend ESLint | 1 | All rules | PASSED | 0 |
| `frontend: npx tsc --noEmit` | TypeScript Strict Check | 1 | Entire app | PASSED | 0 |
| `frontend: npm test` | Storefront Unit & Component Tests | 52 | 383 | PASSED | 0 |
| `frontend: npm run build` | Next.js Standalone Build | 1 | 23 routes | PASSED | 0 |
| `frontend: npm run test:postbuild` | CMS Semantics & CSP Smoke | 2 | 15 | PASSED | 0 |
| `frontend: browserPhase7AccessibilityAcceptance` | Playwright 6-Gate Acceptance | 1 | 6 | PASSED | 0 |
| `backend: npm run test:phase10` | UAT Fixtures & Safety Integration | 1 | 31 | PASSED | 0 |
| `backend: npm run test:phase8` | Document Truthfulness & Notifications | 11 | 57 | PASSED | 0 |
| `backend: npm run lint` | Backend ESLint | 1 | All rules | PASSED (0 warnings) | 0 |
| `backend: npm audit --omit=dev` | Dependency Vulnerability Audit | N/A | 0 vulnerabilities | PASSED | 0 |
| `git diff --check` | Whitespace & Conflict Markers | Workspace | Entire repo | PASSED | 0 |

---

## 8. Owner Human Action Checklist (Manual QA Instructions)

To execute the manual visual, keyboard usability, and assistive technology review:

1. **Start Disposable Safe UAT Environment**:
   ```powershell
   # Terminal 1: Launch frontend standalone build
   cd C:\Projects\mevaPur-Commerce\frontend
   $env:PORT="3000"
   $env:NODE_ENV="production"
   $env:NEXT_PUBLIC_API_URL="http://127.0.0.1:5000"
   node .next/standalone/server.js
   ```

2. **Access Storefront URL**:
   Open browser at: `http://localhost:3000`

3. **Test Personas**:
   - Primary Pakistan COD Customer: `customer-pk-cod@mevapur.test`
   - Primary Pakistan Prepaid Customer: `customer-pk-prepaid@mevapur.test`
   - Password Retrieval: Securely retrieve the password from protected environment variable `$env:UAT_FIXTURE_PASSWORD` (do not commit or log).

4. **Sequence of Pages / Actions for Human Tester**:
   - Step 1: Open Homepage (`/`), verify visual hierarchy, inspect mega-menu on desktop, resize to mobile (375px) and verify mobile drawer.
   - Step 2: Open Catalog (`/products`), apply search and sort, verify query string synchronization.
   - Step 3: Open Product Detail (`/products/prod-almonds-001`), switch weight variant, verify price/SKU change, click Add to Cart.
   - Step 4: Open Out-of-Stock Product (`/products/prod-chilgoza-003`), verify disabled purchase state.
   - Step 5: Open Cart (`/cart`), verify line items, adjust quantities, verify subtotal recalculation.
   - Step 6: Proceed to Checkout (`/checkout`), enter domestic Pakistan address, select Cash on Delivery, inspect summary.
   - Step 7: Select Card Payment, inspect modal lease countdown timer and focus trap.
   - Step 8: View Orders list (`/orders`) and Order Detail timeline (`/orders/69a010000000000000000001`).
   - Step 9: View Invoice/Receipt (`/orders/69a010000000000000000001/invoice`), test Print dialog (`Ctrl+P`) and verify A4/Letter layout without text clipping.
   - Step 10: View Returns tab (`/account?tab=returns`), test Return Request submission form.

5. **Recorded Evidence Location**:
   Objective screenshot artifacts are preserved in:
   `docs/execution/evidence/artifacts/phase10-storefront/d520b8669340cf83fc0f3cd02f522a29268c221c/`

6. **Expected Human Response Format**:
   Record individual test case verdicts using:
   - `PASS`: Requirement satisfies all visual, keyboard, and functional acceptance criteria.
   - `FAIL`: Observable regression or unusable control detected.
   - `BLOCKED`: Precondition or external blocker prevents execution.
