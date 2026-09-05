# White-Label Configuration & Client Packaging Guide

**Version**: 2.0.0 (Storefront Phase 9 Handover Standard)  
**Audience**: Client Engineering, Brand Operations, Platform DevOps  
**Architecture Model**: Dedicated Single-Merchant Deployment per Client  

---

## 1. Architectural Principles & Identity Boundary

The Commerce platform is designed with a strictly enforced **Single-Merchant Dedicated Deployment** architecture:

1. **Dedicated Deployment per Client**: Each client receives an isolated, independent build and deployment instance. There is no multi-vendor, marketplace, or runtime multi-tenant switching mechanism.
2. **Immutable Runtime Identity Boundary**: Branding identity is exclusively sourced from deployment-controlled environment variables and static configuration. It is strictly forbidden to infer or switch branding from untrusted inputs such as `Host` headers, query parameters (e.g. `?brand=...`), cookies, local storage, or request payloads.
3. **Fail-Fast Production Validation**: In production builds (`NODE_ENV=production`), missing or invalid mandatory deployment parameters (such as `NEXT_PUBLIC_SITE_NAME` or `NEXT_PUBLIC_SITE_URL`) fail immediately at build/startup with clear, descriptive non-secret error diagnostics.
4. **Separation of Concerns**:
   - **Deployment-Controlled Values**: Site origin, canonical URLs, site name, legal entity name, core logo/favicon paths, and theme token palette.
   - **Admin-Controlled Public Content**: Operational merchant details updated dynamically in the Admin panel (such as support phone, email, physical store address, and allowlisted social links).
   - **Zero Secret Leakage**: Secrets, private API keys, payment gateway tokens, and internal microservice addresses are never exposed to browser bundles.

---

## 2. Configuration Matrix

### 2.1 Storefront Environment Variables (`frontend/.env.production`)

| Variable | Required (Prod) | Non-Prod Fallback | Description |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | `http://localhost:3000` | Canonical storefront HTTPS origin. Must be a valid HTTPS URL without paths, query strings, fragments, or credentials. |
| `NEXT_PUBLIC_SITE_NAME` | **Yes** | `Local Store` | Customer-visible store brand name (max 80 chars). Used in titles, navbar, structured data, and manifest. |
| `NEXT_PUBLIC_LEGAL_NAME` | No | Defaults to `NEXT_PUBLIC_SITE_NAME` | Full corporate/legal entity name (max 120 chars) used in invoice headers, tax notices, and copyright footers. |
| `NEXT_PUBLIC_TAGLINE` | No | `CHOOSE BEYOND.` | Brand tagline / slogan displayed in default hero banners, meta titles, and auth cards. |
| `NEXT_PUBLIC_SHORT_DESCRIPTION` | No | `A modern, configurable commerce platform.` | Brief description used in meta tags, Open Graph, Twitter cards, and footer brand summaries. |
| `NEXT_PUBLIC_API_URL` | **Yes** | `http://localhost:5000/api/v1` | Public REST API base URL. |
| `NEXT_PUBLIC_LOGO_PATH` | No | `/brand/logo.svg` | Root-relative path or HTTPS CDN URL for the primary brand logo. |
| `NEXT_PUBLIC_LOGO_LIGHT_PATH` | No | `/brand/logo-light.svg` | Logo variant optimized for dark backgrounds (used in Navbar / Footer). |
| `NEXT_PUBLIC_LOGO_DARK_PATH` | No | `/brand/logo-dark.svg` | Logo variant optimized for light backgrounds. |
| `NEXT_PUBLIC_SYMBOL_PATH` | No | `/brand/symbol.svg` | Square brand mark / app icon used in collapsed headers and manifest icons. |
| `NEXT_PUBLIC_FAVICON_PATH` | No | `/brand/favicon.svg` | Browser tab icon path. |
| `NEXT_PUBLIC_SOCIAL_IMAGE_PATH` | No | `/brand/logo.svg` | Default 1200x630 Open Graph / Twitter social preview image. |
| `NEXT_PUBLIC_THEME_PRIMARY_COLOR`| No | `#0B132B` | Primary brand color (strict hex format `#RGB` or `#RRGGBB`). |
| `NEXT_PUBLIC_THEME_ACCENT_COLOR` | No | `#FF8A00` | Accent / highlight color (strict hex format). |
| `NEXT_PUBLIC_THEME_SURFACE_COLOR`| No | `#F7F7F5` | Neutral surface canvas color. |
| `NEXT_PUBLIC_THEME_MUTED_COLOR`  | No | `#6B7280` | Muted typography / secondary border color. |
| `NEXT_PUBLIC_SEARCH_INDEXING_ENABLED` | No | `false` | When `true`, enables search engine indexing in robots.txt and sitemaps. |

### 2.2 Optional Static Fallback Contacts

| Variable | Type | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Email | Fallback customer support email if Admin API is unreachable. |
| `NEXT_PUBLIC_SUPPORT_PHONE` | String | Fallback customer phone number if Admin API is unreachable. |
| `NEXT_PUBLIC_STORE_ADDRESS` | String | Fallback physical store address. |
| `NEXT_PUBLIC_SOCIAL_FACEBOOK` | URL | Official Facebook URL (must use HTTPS). |
| `NEXT_PUBLIC_SOCIAL_INSTAGRAM`| URL | Official Instagram URL (must use HTTPS). |
| `NEXT_PUBLIC_SOCIAL_X`        | URL | Official X (Twitter) URL (must use HTTPS). |

---

## 3. Brand Asset Specifications & Guidelines

Place all client-specific static brand assets in `frontend/public/brand/`:

| Asset Role | Standard Filename | Recommended Format | Recommended Dimensions | Max File Size | Contrast Guidelines |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Logo** | `logo.svg` | SVG (Vector) | 280 × 56 px (5:1 aspect) | 50 KB | Crisp on light/transparent background |
| **Light Logo** | `logo-light.svg` | SVG (Vector) | 280 × 56 px (5:1 aspect) | 50 KB | High contrast on dark `#0B132B` navy |
| **Dark Logo** | `logo-dark.svg` | SVG (Vector) | 280 × 56 px (5:1 aspect) | 50 KB | High contrast on `#FFFFFF` canvas |
| **Brand Symbol** | `symbol.svg` | SVG (Vector) | 512 × 512 px (1:1 aspect) | 30 KB | Legible at 32 × 32 px mobile size |
| **Browser Favicon** | `favicon.svg` | SVG (Vector) | 32 × 32 px / vector | 10 KB | Clear silhouette at 16 × 16 px |
| **Social Share Image** | `og-preview.png` | PNG / WebP | 1200 × 630 px (1.91:1 aspect) | 300 KB | Contains logo & tagline centered |

### Security & Sanitization Rules for Assets
- All SVG assets must be stripped of executable `<script>` tags, inline event listeners (`onload`, `onerror`), and external XML entity (`<!ENTITY>`) references.
- Asset paths configured via environment variables must be strictly root-relative paths (`/brand/...`) or valid HTTPS URLs. Protocol-relative (`//...`), file schemes (`file:///...`), data URLs, and path traversals (`../`) are automatically rejected.

---

## 4. Theme & Color Token Requirements

The storefront design system uses semantic color tokens. When configuring custom client palettes, adhere to the following accessibility and formatting rules:

1. **Hex Format**: Color variables must match valid `#RGB`, `#RRGGBB`, or `#RRGGBBAA` hex notation. Raw CSS expressions, script injections, and arbitrary text are rejected at configuration parse time.
2. **WCAG AA Contrast Ratios**:
   - Body text against surface background: Minimum **4.5:1** contrast ratio.
   - Large text / prominent headers: Minimum **3:1** contrast ratio.
   - Interactive button text against primary/accent buttons: Minimum **4.5:1** contrast ratio.
3. **Default Palette (Selected Enterprise Standard)**:
   - Primary: `#0B132B` (Deep Navy)
   - Accent: `#FF8A00` (Warm Amber)
   - Surface: `#F7F7F5` (Warm Alabaster)
   - Muted: `#6B7280` (Slate Neutral)

---

## 5. Clean Environment Template (`.env.production.example`)

```bash
# ==============================================================================
# Storefront White-Label Production Environment Template
# Dedicated Single-Merchant Deployment Configuration
# ==============================================================================

# 1. Canonical Deployment Origins (Mandatory)
NEXT_PUBLIC_SITE_URL="https://store.clientbrand.com"
NEXT_PUBLIC_API_URL="https://api.clientbrand.com/api/v1"

# 2. Brand Identity & Legal Name (Mandatory)
NEXT_PUBLIC_SITE_NAME="Client Brand Store"
NEXT_PUBLIC_LEGAL_NAME="Client Brand Enterprise LLC"
NEXT_PUBLIC_TAGLINE="Excellence in Every Detail."
NEXT_PUBLIC_SHORT_DESCRIPTION="Official online store for Client Brand premium goods and services."

# 3. Visual Assets (Optional - defaults to /brand/*.svg)
NEXT_PUBLIC_LOGO_PATH="/brand/logo.svg"
NEXT_PUBLIC_LOGO_LIGHT_PATH="/brand/logo-light.svg"
NEXT_PUBLIC_LOGO_DARK_PATH="/brand/logo-dark.svg"
NEXT_PUBLIC_SYMBOL_PATH="/brand/symbol.svg"
NEXT_PUBLIC_FAVICON_PATH="/brand/favicon.svg"
NEXT_PUBLIC_SOCIAL_IMAGE_PATH="/brand/logo.svg"

# 4. Color Theme Tokens (Optional - defaults to navy/amber palette)
NEXT_PUBLIC_THEME_PRIMARY_COLOR="#0B132B"
NEXT_PUBLIC_THEME_ACCENT_COLOR="#FF8A00"
NEXT_PUBLIC_THEME_SURFACE_COLOR="#F7F7F5"
NEXT_PUBLIC_THEME_MUTED_COLOR="#6B7280"

# 5. Search Engine Discovery (Set to true in production)
NEXT_PUBLIC_SEARCH_INDEXING_ENABLED="true"

# 6. Fallback Public Contacts (Used only if Admin API is unavailable)
NEXT_PUBLIC_SUPPORT_EMAIL="support@clientbrand.com"
NEXT_PUBLIC_SUPPORT_PHONE="+1 (555) 019-2834"
NEXT_PUBLIC_STORE_ADDRESS="123 Commerce Way, Suite 100, New York, NY 10001"

# 7. Official Social Links (Optional HTTPS URLs)
NEXT_PUBLIC_SOCIAL_FACEBOOK="https://facebook.com/clientbrand"
NEXT_PUBLIC_SOCIAL_INSTAGRAM="https://instagram.com/clientbrand"
NEXT_PUBLIC_SOCIAL_X="https://x.com/clientbrand"
```

---

## 6. Client Deployment & Verification Runbook

### Step 1: Prepare Brand Configuration
1. Copy `.env.production.example` to `.env.production` in the `frontend/` directory.
2. Fill in all client-specific values (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_API_URL`, etc.).
3. Copy sanitized vector brand assets into `frontend/public/brand/`.

### Step 2: Build & Validate
Execute the build pipeline:
```bash
cd frontend
npm run build
```
The Next.js build compiler validates:
- `NEXT_PUBLIC_SITE_NAME` presence and length.
- `NEXT_PUBLIC_SITE_URL` HTTPS format, origin validity, and absence of credentials/paths.
- Safe format of all asset paths and theme color hex tokens.
- Dynamic manifest generation (`/manifest.webmanifest`).
- Root metadata, Open Graph tags, and structured Organization schema.

### Step 3: Verification Checklist
Run through the following verification checklist before opening traffic to customers:

| Check | Verification Method | Expected Result |
| :--- | :--- | :--- |
| **Site Name & Title** | Open homepage; inspect `<title>` and navbar | Displays `{NEXT_PUBLIC_SITE_NAME} — {NEXT_PUBLIC_TAGLINE}` |
| **Logos** | Inspect desktop and mobile navbar | Renders client logo with `alt="{NEXT_PUBLIC_SITE_NAME}"` |
| **Favicon** | Inspect browser tab and `<link rel="icon">` | Shows client favicon |
| **Manifest** | Fetch `/manifest.webmanifest` | JSON contains client `name`, `theme_color`, and icon paths |
| **Structured Data** | Inspect JSON-LD on homepage | `@graph` contains `WebSite` and `Organization` matching client identity |
| **Invoices** | View an order invoice `/orders/{id}/invoice` | Merchant details display `{NEXT_PUBLIC_LEGAL_NAME}` |
| **Robots & Sitemap** | Fetch `/robots.txt` and `/sitemap/0.xml` | URLs match canonical `{NEXT_PUBLIC_SITE_URL}` |
| **Footer Contacts** | Inspect footer contact info | Displays dynamic Admin settings or fallback contact email/phone |
| **Injection Test** | Pass `?brand=other` or custom Host header | Branding is unaffected; single-merchant identity is preserved |

### Step 4: Rollback & Recovery Procedure
If a brand configuration error occurs during deployment:
1. Revert `.env.production` to the last known verified configuration.
2. Trigger a clean rebuild (`npm run build`).
3. Purge edge CDN / cache layer for HTML, `/manifest.webmanifest`, `/robots.txt`, and `/sitemap/*.xml`.
4. Restart the Node/Next.js runtime process.
