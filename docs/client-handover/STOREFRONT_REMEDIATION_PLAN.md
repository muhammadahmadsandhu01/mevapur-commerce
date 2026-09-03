# STOREFRONT REMEDIATION PLAN — Phase-by-Phase Handover Roadmap

**Repository**: `C:\Projects\mevaPur-Commerce`  
**Target Release Branch**: `release/storefront-client-handover`  
**Base Checkpoint Commit**: `c2d59c32353382a31dfc95f7ecffb838b3fd8c06`  
**Date**: September 3, 2026  
**Estimated Overall Storefront Readiness**: **~85%** (strong architectural foundation; requires targeted contract alignment, security hardening, accessibility closure, and test automation).

---

## 1. Executive Summary & Strategy

This remediation plan organizes the remaining Storefront handover work into **10 bounded, evidence-driven execution phases**. Each phase is self-contained with clear entry/exit criteria, explicit file lists, test definitions, risk ratings, and rollback plans.

---

## 2. Phase-by-Phase Execution Roadmap

### Phase 1: Authentication, Session & Password Recovery Hardening
- **Objective**: Ensure seamless customer login, registration, token refresh, and complete the missing public customer password reset flow.
- **Scope of Changes**:
  - Storefront: `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx` (new route), `src/store/authStore.ts`, `src/lib/authSession.ts`.
  - Backend: Zero schema migrations required (backend endpoints already exist).
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Customer registration validation and duplicate prevention.
  - Customer login with CSRF token and HTTP-only refresh cookie rotation.
  - Forgot password anti-enumeration response and email token receipt.
  - Reset password page token extraction and password policy validation.
- **Risk Level**: Low.
- **Rollback Strategy**: Revert client auth store and route additions.

---

### Phase 2: Catalog, Faceted Search, Variants & Media Resilience
- **Objective**: Harden product catalog browsing, variant selection, price updates, and media fallbacks.
- **Scope of Changes**:
  - Storefront: `src/app/products/page.tsx`, `src/app/products/[id]/page.tsx`, `src/app/search/page.tsx`, `src/components/products/ProductCard.tsx`, `src/components/products/ProductFilters.tsx`, `src/components/ImageFallback.tsx`, `src/services/commerce.service.ts`.
  - Backend: Unchanged.
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Filter by category, brand, and price range.
  - Select variant attributes and assert dynamic price/stock/SKU update.
  - Broken image fallback rendering.
  - Sanitized search query execution without ReDoS vulnerability.
- **Risk Level**: Low.
- **Rollback Strategy**: Revert component and service changes.

---

### Phase 3: Cart Integrity, Coupon Engine & Checkout Flow
- **Objective**: Align Zustand cart storage with backend pricing rules, validate coupons, and prevent checkout submission race conditions.
- **Scope of Changes**:
  - Storefront: `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `src/store/cartStore.ts`, `src/hooks/useCheckout.ts`, `src/lib/checkout/pricing.ts`, `src/lib/checkout/secure-validation.ts`, `src/app/checkout/backup.tsx` (remove dead backup).
  - Backend: Unchanged.
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Add/remove items and update quantities with stock bounds.
  - Coupon code validation (percentage, fixed, min order threshold, expired).
  - Multi-click prevention and double-submit idempotency key generation.
- **Risk Level**: Medium (financial calculations).
- **Rollback Strategy**: Revert cart and checkout logic.

---

### Phase 4: Payment Providers, Order Lifecycle & Invoices
- **Objective**: Support multi-channel payments (COD, Stripe, Bank Transfer, Raast, JazzCash/EasyPaisa) and provide transparent order tracking and invoice rendering.
- **Scope of Changes**:
  - Storefront: `src/modules/payments/`, `src/services/payment.service.ts`, `src/services/order.service.ts`, `src/app/orders/`, `src/app/orders/[id]/page.tsx`, `src/app/orders/[id]/invoice/page.tsx`, `src/app/order-success/page.tsx`.
  - Backend: Unchanged.
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Cash on delivery order creation and immediate pending status.
  - Stripe payment intent creation and client-side confirmation.
  - Order details timeline rendering.
  - Print invoice rendering with dynamic brand name (elimination of hardcoded strings).
- **Risk Level**: Medium (payment handling).
- **Rollback Strategy**: Revert payment module changes.

---

### Phase 5: Verified Reviews, Ratings & Recommendations
- **Objective**: Ensure verified-purchase review submission, reporting, and legitimate product recommendations.
- **Scope of Changes**:
  - Storefront: `src/components/products/ProductReviews.tsx`, `src/components/products/RecommendedProducts.tsx`, `src/components/products/RecentlyViewed.tsx`, `src/services/commerce.service.ts`.
  - Backend: Unchanged.
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Verified purchase badge display.
  - Review form validation (1–5 stars, minimum length, pending status acknowledgment).
  - Admin reply rendering under approved review.
  - Dynamic brand name in review reply attribution.
- **Risk Level**: Low.
- **Rollback Strategy**: Revert review component updates.

---

### Phase 6: Admin Content Control Plane & Dynamic CMS Pages
- **Objective**: Connect Storefront homepage hero sliders, promotional banners, policy pages (About, FAQ, Shipping, Privacy), and announcements to Admin-controlled backend models.
- **Scope of Changes**:
  - Storefront: `src/components/Hero.tsx`, `src/components/products/PromotionalBanner.tsx`, `src/components/Footer.tsx`, `src/components/Navbar.tsx`, `src/components/layout/MegaMenu.tsx`.
  - Backend: Unchanged.
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Active sliders and banners fetched and rendered dynamically.
  - Footer policy links navigate to published CMS pages.
  - Announcement bar text updates dynamically based on public settings.
- **Risk Level**: Low.
- **Rollback Strategy**: Revert layout and CMS consumer components.

---

### Phase 7: Responsive Layouts & WCAG AA Accessibility Closure
- **Objective**: Deliver flawless mobile (320px–375px), tablet (768px–1024px), and desktop (1440px) UX with zero horizontal overflow and full keyboard/screen-reader compliance.
- **Scope of Changes**:
  - Storefront: `src/app/globals.css`, `src/components/Navbar.tsx`, `src/components/Footer.tsx`, `src/components/ui/`, all modals and drawers.
  - Backend: Unchanged.
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Mobile drawer open/close, focus containment, and Escape key restoration.
  - Modal focus trap and body-scroll lock.
  - Touch target sizing (>= 44×44px for essential mobile buttons).
  - Automated Axe accessibility audit: 0 critical, 0 serious violations.
- **Risk Level**: Low.
- **Rollback Strategy**: Revert CSS and modal component adjustments.

---

### Phase 8: Performance, SEO, Dynamic Metadata & Security Headers
- **Objective**: Upgrade Next.js to 16.3.4 (resolving dependency advisories), apply nonce-backed CSP, and configure dynamic Open Graph and sitemap metadata.
- **Scope of Changes**:
  - Storefront: `package.json`, `next.config.ts`, `src/middleware.ts` (nonce generation), `src/app/layout.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`.
  - Backend: Unchanged.
  - Admin: Unchanged.
- **Behavioral Tests**:
  - Production build succeeds without `NEXT_PUBLIC_SITE_URL` runtime crash.
  - CSP script-src authorizes nonced Next.js scripts with zero console violations.
  - Sitemap and robots.txt serve valid XML and crawler directives.
  - `npm audit --omit=dev` reports 0 vulnerabilities.
- **Risk Level**: Medium (Next.js version alignment).
- **Rollback Strategy**: Revert `package.json` and middleware updates.

---

### Phase 9: White-Label Isolation & Dead Code Elimination
- **Objective**: Remove hardcoded brand strings, eliminate orphaned Admin files from Storefront, and enforce the environment-driven branding contract.
- **Scope of Changes**:
  - Storefront: `src/config/branding.ts`, `src/config/publicConfig.ts`, delete `src/components/admin/AdminGuard.tsx`, delete `src/lib/adminApi.ts`, delete `src/app/checkout/backup.tsx`.
  - Clean all 4 identified `HARZAAR` occurrences.
- **Behavioral Tests**:
  - Storefront displays customized `NEXT_PUBLIC_SITE_NAME` across title, header, footer, invoice, and reviews.
  - Zero leftover Admin code inside `frontend/src`.
- **Risk Level**: Low.
- **Rollback Strategy**: Revert branding and deletion commits.

---

### Phase 10: Complete Storefront Playwright & Axe Acceptance Suite
- **Objective**: Implement and execute a full headless Chromium browser test suite verifying all customer flows and accessibility standards.
- **Scope of Changes**:
  - Storefront: `tests/storefrontAcceptance.test.mts`, Playwright & `@axe-core/playwright` in `devDependencies`.
- **Behavioral Tests**:
  - Guest and authenticated user catalog browsing, filtering, and search.
  - Cart addition, coupon application, and checkout step machine.
  - Modal focus traps, mobile drawer behaviors, and responsive overflow safety.
  - Automated Axe audits across 8 key Storefront routes (0 critical, 0 serious violations).
- **Risk Level**: Low.
- **Rollback Strategy**: Revert test suite files.

---

## 3. Handover Acceptance Gate Matrix

| Workstream / Gate | Requirement for Sign-off | Target Phase |
| :--- | :--- | :---: |
| **Dependency Security** | `npm audit --omit=dev` reports 0 vulnerabilities under Next.js 16.3.4 | Phase 8 |
| **Authentication & Recovery** | Full registration, login, refresh rotation, and token password reset verified | Phase 1 |
| **Commerce & Checkout** | Backend-authoritative order math, inventory reservation, and payment state machine | Phase 3 & 4 |
| **Admin Control Plane** | Verified dynamic sync between Admin CMS updates and Storefront presentation | Phase 6 |
| **Accessibility & UX** | WCAG AA compliance (0 critical, 0 serious Axe findings, 320px–1440px safety) | Phase 7 & 10 |
| **White-Label Integrity** | 0 hardcoded brand strings; 100% environment-driven configuration | Phase 9 |
| **Local Browser Suite** | Complete automated Playwright & Axe suite passing in Chrome Chromium | Phase 10 |
