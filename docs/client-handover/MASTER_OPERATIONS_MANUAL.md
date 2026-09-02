# MevaPur / Harzaar Commerce — Master Operations Manual

**Document Version**: 2.0.0  
**Target Audience**: Store Administrators, Business Operations, Engineering Staff & Client Stakeholders

---

## 1. System Architecture & Topology

MevaPur Commerce is a high-performance, modular multi-category commerce platform structured in two primary sub-systems:
1. **Backend API (`backend/`)**:
   - **Framework**: Node.js 20.x LTS + Express 4.x
   - **Database**: MongoDB 7.x/8.x (Mongoose 8.x ODM)
   - **Security**: Strict CORS, JWT session rotation, AES-256-GCM encrypted MFA, Helmet CSP headers, rate-limiting, and SHA-256 password hashing.
   - **Payment Engine**: Modular adapter architecture supporting COD, Stripe, Bank Transfer, and Raast (instant clearing).
2. **Admin Panel (`admin-panel/`)**:
   - **Framework**: Next.js 16.x App Router + React 19 + TypeScript
   - **Design System**: Accessible WCAG 2.1 AA compliant UI primitives with light/dark adaptive theming.
   - **State Management**: Zustand with persistent secure cookie session bridge.

---

## 2. Core Operational Workflows

### 2.1 Staff & Access Management
- **Inviting Staff**: SuperAdmins navigate to **Staff Management** (`/users`), click **Invite Staff Member**, enter the recipient's corporate email, and select an authoritative role (`support`, `inventory`, `manager`, `admin`, `super_admin`).
- **Activation**: The invitee receives a single-use cryptographically signed token valid for 48 hours. Upon visiting the link, they configure their legal name and strong password.
- **Two-Factor Authentication**: Privileged roles (`admin`, `super_admin`) are required to enroll in TOTP MFA via their Profile settings using standard authenticator apps (Google Authenticator, 1Password, Authy). Single-use recovery codes are issued upon enrollment.

### 2.2 Product Catalog & Inventory Replenishment
- **Adding Products**: Navigate to **Products** (`/products`). Specify SKU, barcode, price, compare-at price, categories, brand, weight, dimensions, and image gallery.
- **Stock Adjustments**: Go to **Inventory** (`/inventory`). Adjust stock levels with recorded reasons (`RESTOCK`, `DAMAGE`, `CYCLE_COUNT`). All adjustments generate immutable ledger audit entries.

### 2.3 Orders & Fulfilment Lifecycle
- **Order States**: `pending` → `processing` → `shipped` → `delivered` (or `cancelled` / `refunded`).
- **Tracking**: Assign courier name and tracking code upon changing status to `shipped`.
- **Payment Reconciliation**: Review payment status (`unpaid`, `paid`, `refunded`, `failed`) and view associated payment transactions in the financial ledger.

### 2.4 Promotions & Coupon Integrity
- **Coupons**: Create percentage or fixed discount codes with usage limits, minimum spend, expiry dates, and product/category restrictions.
- **Concurrency & Reservation**: Checkout holds a 15-minute temporary reservation lock. If checkout is abandoned, automated cron reconciliation safely releases reserved redemptions without leaking discounts.

### 2.5 Review & UGC Moderation
- **Moderation Queue**: Incoming customer reviews appear under **Reviews** (`/reviews`) with AI sentiment scoring.
- **Actions**: Approve, reject, flag for fraud investigation, or post verified staff replies.
