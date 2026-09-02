# White-Label Customization & Brand Identity Guide

**Version**: 1.0.0  
**Target**: Client Engineering & Brand Operations

---

## 1. Overview

The MevaPur / Harzaar Commerce suite is engineered for complete white-label independence. The brand name, corporate identities, logos, color themes, support contacts, and legal notices are driven entirely by environment variables and centralized configuration files without code alterations.

---

## 2. Configuration Matrix

### 2.1 Backend Environment Variables (`.env`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `BRAND_NAME` | `HARZAAR` | Default corporate/store brand name used in transactional emails and automated SMS |
| `SUPPORT_EMAIL` | `support@harzaar.com` | Customer and staff contact email listed in receipts and alerts |
| `FRONTEND_URL` | `https://harzaar.com` | Public storefront origin for customer redirects |
| `ADMIN_PANEL_URL` | `https://admin.harzaar.com` | Privileged operations console URL for staff invitation links |
| `COMPANY_LEGAL_NAME` | `Harzaar Commerce Pvt Ltd` | Legal entity displayed in invoice footers and tax documents |

### 2.2 Admin Panel Environment Variables (`admin-panel/.env.production`)

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_SITE_NAME` | Site title in browser tab header and top navigation |
| `NEXT_PUBLIC_ADMIN_ORIGIN` | Canonical admin domain |
| `NEXT_PUBLIC_API_URL` | Base REST API URL |

---

## 3. Brand Assets Customization

All visual brand assets reside in the public directory:
- `admin-panel/public/brand/`
  - `harzaar-logo-horizontal.svg`: Main header logo
  - `harzaar-symbol.svg`: Compact icon/symbol for collapsed sidebar and mobile viewports
  - `favicon.svg`: Browser favicon

To replace assets for a new brand, simply drop SVG or PNG replacements with the same file names into `admin-panel/public/brand/` or update paths in `admin-panel/src/config/branding.ts`.

---

## 4. Theme & Palette Customization

The color design system is defined in `admin-panel/src/config/branding.ts` and `admin-panel/src/app/globals.css`:
```ts
const BRAND_COLORS = Object.freeze({
  primary: '#0B132B',  // Deep navy brand primary
  accent: '#FF8A00',   // Vivid amber accent
  surface: '#F7F7F5',  // Neutral background canvas
  muted: '#6B7280',    // Secondary typography
});
```

Modifying these variables updates all button primitives, status badges, hero accents, and focus indicators globally.
