# ADMIN-TO-STOREFRONT CONTROL & LIFECYCLE MATRIX

**Repository**: `C:\Projects\mevaPur-Commerce`  
**Target Release Branch**: `release/storefront-client-handover`  
**Base Commit**: `c2d59c32353382a31dfc95f7ecffb838b3fd8c06`  
**Total Surfaces Audited**: `30`  
**Audit Date**: September 3, 2026

---

## 1. Classification Summary

| Classification | Count | Description |
| :--- | :---: | :--- |
| **`ADMIN_RUNTIME_CONTROLLED`** | **18** | Managed dynamically by merchants via Admin Panel UI, persisted in DB, and consumed via API. |
| **`DEPLOYMENT_CONFIG_CONTROLLED`** | **6** | Configured per client via environment variables and deployment configuration contracts. |
| **`SOURCE_CODE_CONTROLLED`** | **4** | Managed via standard theme/layout templates and static page components. |
| **`EXTERNAL_PROVIDER_CONTROLLED`** | **2** | Managed via external payment/storage providers (e.g. Stripe dashboard, S3 storage). |
| **`DISCONNECTED`** | **0** | No customer-visible surfaces exist in a disconnected state. |
| **`NOT_IMPLEMENTED`** | **0** | All baseline commerce and content control planes are present. |

---

## 2. Detailed Surface Control Matrix

| Customer-Facing Surface | Admin UI Source Route | Admin API Endpoint | Backend Model & Field | Authorized Roles | Draft / Publish Lifecycle | Public Storefront API | Storefront Consumer | Control Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Homepage Hero & Sliders** | `/content/sliders` | `POST/PUT /api/content/sliders` | `Slider.slides[]` | `manager`, `admin`, `super_admin` | `isActive: true/false`, display order | `GET /api/content/sliders` | `src/components/Hero.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Promotional Banners** | `/content/banners` | `POST/PUT /api/content/banners` | `Banner.items[]` | `manager`, `admin`, `super_admin` | `isActive: true/false`, slot position | `GET /api/content/banners` | `src/components/products/PromotionalBanner.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Featured Products Section** | `/products` | `PUT /api/products/:id` | `Product.isFeatured` | `manager`, `admin`, `super_admin` | Published + `isFeatured: true` | `GET /api/products?featured=true` | `src/app/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Trending / Top-Selling** | `/analytics` & `/orders` | Derived from Order lines | `OrderItem.quantity` | Automated calculation | Dynamic ranking based on sales | `GET /api/products?sort=popular` | `src/app/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Categories & Hierarchy** | `/categories` | `POST/PUT /api/categories` | `Category.name, slug, image` | `manager`, `admin`, `super_admin` | Active / Inactive toggle | `GET /api/categories` | `src/components/layout/MegaMenu.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Brands** | `/brands` | `POST/PUT /api/brands` | `Brand.name, logo, isPopular` | `manager`, `admin`, `super_admin` | Active / Inactive toggle | `GET /api/brands` | `src/components/products/ProductFilters.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Product Master Data** | `/products`, `/products/add` | `POST/PUT /api/products` | `Product.name, description, price` | `manager`, `admin`, `super_admin` | `status: 'draft' | 'published'` | `GET /api/products` | `src/app/products/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Product Variants & SKUs** | `/products/[id]/edit` | `PUT /api/products/:id` | `Product.variants[]` | `manager`, `admin`, `super_admin` | Inherited from Product | `GET /api/products/:id` | `src/app/products/[id]/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Live Inventory & Stock** | `/inventory` | `POST /api/inventory/adjust` | `Inventory.stock, Variant.stock` | `inventory`, `manager`, `admin`, `super_admin` | Immediate atomic updates | `GET /api/products/:id` | `src/app/products/[id]/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Product Media & Gallery** | `/products/[id]/edit` | `POST /api/upload/media` | `Product.images[]` | `manager`, `admin`, `super_admin` | Image order & primary flag | `GET /api/products/:id` | `src/app/products/[id]/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Coupons & Discounts** | `/coupons` | `POST/PUT /api/coupons` | `Coupon.code, discountValue` | `manager`, `admin`, `super_admin` | `status: 'draft' | 'active' | 'expired'` | `POST /api/coupons/validate` | `src/app/cart/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Customer Reviews Moderation** | `/reviews` | `PUT /api/reviews/:id/moderate` | `Review.status, adminReply` | `support`, `admin`, `super_admin` | `status: 'pending' | 'approved' | 'rejected'` | `GET /api/reviews/product/:id` | `src/components/products/ProductReviews.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Customer Account Blocking** | `/customers` | `PUT /api/customers/:id/block` | `User.isBlocked, blockReason` | `admin`, `super_admin` | Immediate session revocation | `POST /api/auth/login` | `src/app/login/page.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Custom Content Pages (About, FAQ)** | `/content/pages` | `POST/PUT /api/content/pages` | `Page.slug, title, content` | `manager`, `admin`, `super_admin` | `isPublished: true/false` | `GET /api/content/pages/:slug` | Dynamic page router | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Shipping & Return Policies** | `/content/pages` | `PUT /api/content/pages/shipping` | `Page.content` | `manager`, `admin`, `super_admin` | Published policy versions | `GET /api/content/pages/shipping` | `src/components/Footer.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Privacy Policy & Terms** | `/content/pages` | `PUT /api/content/pages/privacy` | `Page.content` | `manager`, `admin`, `super_admin` | Published policy versions | `GET /api/content/pages/privacy` | `src/components/Footer.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Contact & Support Information** | `/settings` | `PUT /api/settings/public` | `Settings.contactEmail, phone` | `super_admin` | Immediate cache update | `GET /api/settings/public` | `src/components/Footer.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Announcements Top Bar** | `/settings` | `PUT /api/settings/public` | `Settings.announcementText` | `super_admin` | Active / Inactive banner | `GET /api/settings/public` | `src/components/Navbar.tsx` | **`ADMIN_RUNTIME_CONTROLLED`** |
| **Brand Name & Site Title** | Deployment Env | N/A | `NEXT_PUBLIC_SITE_NAME` | DevOps / Deployment | Deploy-time configuration | Runtime env contract | `src/config/branding.ts` | **`DEPLOYMENT_CONFIG_CONTROLLED`** |
| **Brand Logo & Favicon** | Deployment Env / Assets | N/A | `branding.logoPath, faviconPath` | DevOps / Deployment | Deploy-time asset injection | Static public asset | `src/components/brand/BrandLogo.tsx` | **`DEPLOYMENT_CONFIG_CONTROLLED`** |
| **Theme Primary & Accent Colors** | Deployment Config | N/A | CSS Custom Properties | DevOps / Design | Deploy-time token definitions | Global CSS tokens | `src/app/globals.css` | **`DEPLOYMENT_CONFIG_CONTROLLED`** |
| **SEO Default Metadata & OG Tags** | Deployment Config | N/A | `metadata.title, metadata.description` | DevOps / Deployment | Static metadata baseline | Server-rendered metadata | `src/app/layout.tsx` | **`DEPLOYMENT_CONFIG_CONTROLLED`** |
| **Sitemap & Robots.txt** | Deployment Config | N/A | `NEXT_PUBLIC_SITE_URL` | DevOps / Deployment | Generated per build/request | `/robots.txt`, `/sitemap.xml` | `src/app/robots.ts`, `src/app/sitemap.ts` | **`DEPLOYMENT_CONFIG_CONTROLLED`** |
| **Payment Gateway Credentials** | Deployment Env | N/A | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK` | DevOps / Deployment | Process environment | Provider webhook handlers | `backend/services/PaymentService.js` | **`DEPLOYMENT_CONFIG_CONTROLLED`** |
| **Navigation Layout & MegaMenu** | Source Template | N/A | `src/components/Navbar.tsx` | Frontend Engineering | Template rendering | Category API | `src/components/Navbar.tsx` | **`SOURCE_CODE_CONTROLLED`** |
| **Footer Structure & Layout** | Source Template | N/A | `src/components/Footer.tsx` | Frontend Engineering | Template rendering | Settings & Pages API | `src/components/Footer.tsx` | **`SOURCE_CODE_CONTROLLED`** |
| **Checkout Workflow Steps** | Source Template | N/A | `src/app/checkout/page.tsx` | Frontend Engineering | Component state machine | Orders & Payments API | `src/app/checkout/page.tsx` | **`SOURCE_CODE_CONTROLLED`** |
| **Invoice Printable Template** | Source Template | N/A | `src/app/orders/[id]/invoice/page.tsx` | Frontend Engineering | Print CSS stylesheet | Order Invoice API | `src/app/orders/[id]/invoice/page.tsx` | **`SOURCE_CODE_CONTROLLED`** |
| **Credit Card Modal (Stripe Elements)**| Stripe JS Provider | N/A | Stripe Hosted Fields | External Security | Hosted iframe | Stripe API | `src/components/checkout/StripePaymentForm.tsx` | **`EXTERNAL_PROVIDER_CONTROLLED`** |
| **CDN Media Distribution** | Storage Provider | N/A | Cloudinary / S3 / Local | External Infrastructure | Asset delivery | Direct media URL | `src/components/ImageFallback.tsx` | **`EXTERNAL_PROVIDER_CONTROLLED`** |
