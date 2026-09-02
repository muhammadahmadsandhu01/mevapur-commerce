# Dependency Security, License Inventory & SBOM Report

**Date of Audit**: September 2, 2026  
**Node.js Target**: Node.js LTS 20.x (`>=20.18.0 <23.0.0`)  
**Package Audit Status**: **0 Known Vulnerabilities** (Production and Development)

---

## 1. Vulnerability Audit Summary

### Backend Service (`backend/`)
- **Total Dependencies Audited**: 589 packages
- **Production Vulnerabilities**: **0** (0 Critical, 0 High, 0 Moderate, 0 Low)
- **Development Vulnerabilities**: **0**
- **Key Direct Runtime Libraries**:
  - `express`: 4.22.2 (MIT)
  - `mongoose`: 8.24.4 (MIT)
  - `nodemailer`: 6.10.2 (MIT) — Patched against command injection and CRLF parsing vulnerabilities
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
- **Production Vulnerabilities**: **0** (0 Critical, 0 High, 0 Moderate, 0 Low)
- **Development Vulnerabilities**: **0**
- **Key Direct Runtime Libraries**:
  - `next`: 16.3.4 (MIT) — Patched against App Router middleware bypass, SVG image optimization DoS, PostCSS, and Sharp vulnerabilities
  - `react` / `react-dom`: 19.2.4 (MIT)
  - `lucide-react`: 1.24.0 (ISC)
  - `recharts`: 3.9.2 (MIT)
  - `zustand`: 5.0.14 (MIT)
  - `axios`: 1.20.0 (MIT)
  - `date-fns`: 4.4.0 (MIT)
  - `tailwindcss`: 4.3.3 (MIT)
  - `typescript`: 5.9.3 (Apache-2.0)

---

## 2. License Inventory & Permissive Compliance

All direct and transitive runtime dependencies utilize approved commercial-friendly open source licenses:

| Ecosystem / Scope | License Classification | Status |
| :--- | :--- | :--- |
| Core Framework & Middleware | MIT, ISC, BSD-2-Clause, BSD-3-Clause | Approved (Permissive) |
| Cloud SDKs (`@aws-sdk/*`, TypeScript) | Apache-2.0 | Approved (Permissive) |
| GPL / AGPL / Copyleft Dependencies | **None present in runtime trees** | 100% Compliant |

---

## 3. Node.js LTS Pinning & Runtime Enforcement
- Repository root `.nvmrc` configured to `20.18.0`.
- `backend/package.json` and `admin-panel/package.json` define `"engines": { "node": ">=20.18.0 <23.0.0", "npm": ">=10.0.0" }`.
