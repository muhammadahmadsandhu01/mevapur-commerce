# FINAL REMEDIATION TRACKER — Admin Client Handover

**Repository**: `C:\Projects\mevaPur-Commerce`  
**Target Release Branch**: `release/admin-client-handover`  
**Baseline Commit**: `60102eac43fba115b9fd849abf208686b6e2a0a4`  
**Status**: IN PROGRESS  

---

## Master Workstream Status

| ID | Workstream | Status | Details / Artifacts |
| :--- | :--- | :--- | :--- |
| **A** | Dependency and Runtime Security | **IN PROGRESS** | Audits, lockfiles, safe Next.js/Nodemailer patches, SBOM, Node LTS pin |
| **B** | Complete Canonical RBAC | **PENDING** | 6 canonical roles, centralized action-policy, all modules guarded, roles page matrix |
| **C** | Staff Provisioning & Password Lifecycle | **PENDING** | Token-based staff invitations, secure email delivery, password validation, demotion protection |
| **D** | Mandatory Privileged-Account MFA | **PENDING** | TOTP enrollment, encrypted secrets at rest, hashed recovery codes, step-up auth |
| **E** | CSP, Headers, Error Normalization & Safe Searches | **PENDING** | Strict CSP, no raw error leak, correlation IDs, accessible feedback, regex bounds |
| **F** | Reusable Accessible Admin Primitives | **PENDING** | Dialog, Drawer, DataTable, Pagination, FormField, Toast, focus containment |
| **G** | Cross-Panel Accessibility & Responsive Closure | **PENDING** | 320px–1440px viewport safety, mobile drawer inertness, table scope, WCAG AA contrast |
| **H** | Authenticated Browser E2E & WCAG Gate | **PENDING** | Playwright test suite, authenticated workflows, automated axe accessibility scans |
| **I** | White-Label Configuration Contract | **PENDING** | Environment-driven brand contract, logo/color configs, no hardcoded brand strings |
| **J** | Obsolete Laravel/PHP Cleanup | **PENDING** | Tracked file manifest, proof of non-use, safe deletion, updated architecture docs |
| **K** | Observability & Operational Readiness | **PENDING** | Vendor-neutral telemetry, error boundaries, request correlation, healthz integration |
| **L** | Backup & Restore Readiness Drill | **PENDING** | Non-production backup/restore drill scripts, checkpoint collections, runbook |
| **M** | Client Handover Documentation Package | **PENDING** | Comprehensive guides, runbooks, credential checklists in `docs/client-handover/` |

---

## Detailed Requirement Status

### Workstream A: Dependency & Runtime Security
- [ ] Production dependency audit for `backend` and `admin-panel`
- [ ] Safe upgrade of vulnerable direct runtime dependencies (Next.js, Nodemailer)
- [ ] Node LTS pinning in `.nvmrc` and `package.json` engines
- [ ] License inventory & SBOM generation
- [ ] Zero Critical / High production vulnerabilities verified

### Workstream B: Complete Canonical RBAC
- [ ] Action-policy registry/service (`backend/services/PolicyService.js` / `backend/middleware/rbac.js`)
- [ ] Canonical roles verified: `customer`, `support`, `inventory`, `manager`, `admin`, `super_admin`
- [ ] All 37 Admin routes & backend controllers aligned to least-privilege matrix
- [ ] Unknown roles fail closed with 403
- [ ] Read-only permissions matrix in Admin Roles page (`/roles`)
- [ ] Table-driven unit and integration tests across all roles

### Workstream C: Staff Provisioning & Password Lifecycle
- [ ] SuperAdmin staff invitation system (`StaffInvitation` schema, hashed token, bounded expiry)
- [ ] Secure email delivery with rollback on failure
- [ ] Public staff acceptance page (`/accept-invitation`) with canonical password policy
- [ ] Prevention of deleting or demoting the last active SuperAdmin
- [ ] Revocation of sessions on staff status/role changes
- [ ] Re-authentication/MFA required for privileged staff management

### Workstream D: Mandatory MFA for Privileged Accounts
- [ ] TOTP enrollment and challenge workflow for `admin` and `super_admin`
- [ ] AES-256-GCM encrypted TOTP secret storage (`MFA_ENCRYPTION_KEY`)
- [ ] One-time backup recovery codes hashed at rest (SHA-256 / bcrypt)
- [ ] Timestep replay prevention and clock skew tolerance
- [ ] MFA enrollment/challenge/recovery UI in Admin panel
- [ ] Session revocation on MFA state modification

### Workstream E: CSP, Security Headers, Errors, Logs & Search Safety
- [ ] Strict CSP header in Next.js configuration (`admin-panel/next.config.js`)
- [ ] Canonical error middleware and safe logging with correlation IDs (`requestId`)
- [ ] Removal of raw `error.message` or stack traces in public responses
- [ ] Reusable accessible feedback components replacing `alert()` and raw `console.error`
- [ ] Sanitized regex search utility with bounded length and escaped characters

### Workstream F & G: Reusable Primitives & Accessibility/Responsive
- [ ] UI Primitives (`Button`, `FormField`, `Dialog`, `Drawer`, `DataTable`, `Pagination`, `Toast`)
- [ ] Responsive compliance (320px, 375px, 768px, 1024px, 1280px, 1440px)
- [ ] Mobile Sidebar modal semantics, backdrop containment, body scroll lock, focus restoration
- [ ] WCAG AA compliant contrast, aria attributes, keyboard navigability
- [ ] ESLint warning baseline maintained (<= 66 warnings, 0 errors)

### Workstream H: Authenticated Browser E2E & WCAG Gate
- [ ] Playwright E2E test setup in `admin-panel`
- [ ] Authenticated E2E tests for core workflows (Login, MFA, Staff, Products, Orders, Reviews, Coupons)
- [ ] Automated axe-core accessibility audit with 0 Critical and 0 Serious violations

### Workstream I: White-Label Configuration
- [ ] Unified branding configuration contract (`runtime.config.js` / `whiteLabel.config.ts`)
- [ ] Removal of hardcoded HARZAAR/MevaPur brand strings from configurable surfaces
- [ ] White-label setup documentation and asset checklist

### Workstream J: Obsolete Laravel/PHP Cleanup
- [ ] Audit tracked files for obsolete PHP/Laravel residue
- [ ] Manifest documentation of obsolete files
- [ ] Safe deletion of confirmed obsolete files and update of root docs

### Workstream K & L: Observability & Backup/Restore Readiness
- [ ] Structured opt-in logging / error telemetry integration
- [ ] Next.js Global Error Boundary and standalone server verification
- [ ] Non-production database backup and restore verification scripts and runbook

### Workstream M: Client Handover Documentation
- [ ] Complete documentation package in `docs/client-handover/`
- [ ] Verification of all external infrastructure boundaries and handover readiness

---

## Post-Launch Roadmap (Explicitly Non-Blocking)
- Bulk CSV/JSON import systems
- Enterprise SSO (SAML 2.0 / SCIM)
- Multi-tenancy / multi-store architecture
- ERP / WMS real-time connectors
- Advanced visual drag-and-drop report builder
- Multi-currency / multi-locale automated FX feeds
- Four-eyes approval workflows for financial payouts
- Large-table virtualization
