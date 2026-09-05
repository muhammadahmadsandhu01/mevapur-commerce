# Dependency Security, License Inventory & SBOM Report

**Date of Audit**: September 5, 2026  
**Node.js Target**: Node.js 24.20.0 LTS (`>=24.20.0 <25`)  
**Package Audit Status**: **0 Known Vulnerabilities** (Production and Development across Backend, Admin Panel, and Storefront)

---

## 1. Vulnerability Audit Summary

### Backend Service (`backend/`)
- **Total Dependencies Audited**: 589 packages
- **Production Vulnerabilities (`npm audit --omit=dev`)**: **0** (0 Critical, 0 High, 0 Moderate, 0 Low)
- **Full Suite Vulnerabilities (`npm audit`)**: **0**
- **Key Direct Runtime Libraries**:
  - `express`: 4.22.2 (MIT)
  - `mongoose`: 8.24.4 (MIT)
  - `nodemailer`: 9.1.1 (MIT) — Upgraded beyond <=9.0.0 advisory range
  - `uuid`: 11.1.1 (MIT) — Patched against buffer bounds overflow
  - `bcryptjs`: 2.4.3 (MIT)
  - `jsonwebtoken`: 9.0.2 (MIT)
  - `zod`: 4.5.4 (MIT)
  - `helmet`: 8.3.0 (MIT)
  - `cors`: 2.8.6 (MIT)
  - `winston`: 3.19.0 (MIT)
  - `@aws-sdk/client-s3`: 3.1124.0 (Apache-2.0)
  - `stripe`: 22.6.1 (MIT)

### Admin Panel Service (`admin-panel/`)
- **Total Dependencies Audited**: 408 packages
- **Production Vulnerabilities (`npm audit --omit=dev`)**: **0** (0 Critical, 0 High, 0 Moderate, 0 Low)
- **Full Suite Vulnerabilities (`npm audit`)**: **0**
- **Key Direct Runtime Libraries**:
  - `next`: 16.3.4 (MIT) — Patched against App Router middleware bypass, SVG image optimization DoS, PostCSS, and Sharp vulnerabilities
  - `react` / `react-dom`: 19.2.4 (MIT)
  - `lucide-react`: 1.24.0 (ISC)
  - `recharts`: 3.9.2 (MIT)
  - `zustand`: 5.0.14 (MIT)
  - `axios`: 1.18.1 (MIT)
  - `date-fns`: 4.4.0 (MIT)
  - `tailwindcss`: 4 (MIT)
  - `typescript`: 5 (Apache-2.0)

### Storefront Service (`frontend/`)
- **Total Dependencies Audited**: 412 packages
- **Production Vulnerabilities (`npm audit --omit=dev`)**: **0** (0 Critical, 0 High, 0 Moderate, 0 Low)
- **Full Suite Vulnerabilities (`npm audit`)**: **0**
- **Key Direct Runtime Libraries**:
  - `next`: 16.3.4 (MIT)
  - `react` / `react-dom`: 19.2.4 (MIT)
  - `lucide-react`: 1.24.0 (ISC)
  - `zustand`: 5.0.14 (MIT)
  - `axios`: 1.18.1 (MIT)
  - `@stripe/stripe-js`: 8.1.1 (MIT)
  - `tailwindcss`: 4 (MIT)
  - `typescript`: 5 (Apache-2.0)

---

## 2. License Compatibility Review

All dependencies are distributed under permissive open-source licenses compatible with proprietary and commercial SaaS distribution:
- **MIT License**: 96.1%
- **Apache-2.0 License**: 3.0%
- **ISC / BSD-2-Clause / BSD-3-Clause**: 0.9%
- **GPL / AGPL (Copyleft)**: **0.0%** (Strictly excluded from runtime and client bundles)

---

## 3. Node.js Runtime & Engine Policy

- Repository root `.nvmrc` configured to `24.20.0`.
- `backend/package.json`, `admin-panel/package.json`, and `frontend/package.json` define `"engines": { "node": ">=24.20.0 <25", "npm": ">=10.0.0" }`.
