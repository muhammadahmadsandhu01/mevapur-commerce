# MevaPur Commerce Customer Deployment Guide

## Ownership and scope

Customer production must be created in customer-owned accounts: repository,
storefront/admin hosting, backend hosting, `.com` registrar/DNS, MongoDB Atlas,
provider accounts, secrets, billing, monitoring, backups, and production data.
The seller should retain no customer production secrets after handover.

P5C created a portable configuration and handoff contract. It did not deploy,
purchase a domain, change DNS/TLS, access Atlas, inject a secret, or activate
an external provider.

## Required topology

- `https://www.example.com` — storefront reference origin
- `https://admin.example.com` — admin reference origin
- `https://api.example.com` — API reference origin
- `https://example.com` — registrar/platform redirect to `www`

Replace every placeholder with the customer-owned origin. Use exact HTTPS
origins: no credentials, path, query, fragment, wildcard, or uncontrolled
preview origin.

## Controlled deployment sequence

1. Transfer/import source into the customer-owned repository and protect the
   default branch.
2. Choose a compatible topology using
   `docs/CUSTOMER_PLATFORM_COMPATIBILITY_GUIDE.md`.
3. Create three isolated services without production data.
4. Create customer-owned Atlas following
   `docs/CUSTOMER_PRODUCTION_ATLAS_SETUP.md`.
5. Create new secrets in the platform secret store; never reuse demo/staging
   credentials.
6. Resolve all placeholders in the three production environment templates.
7. Run the offline validator against explicit prepared configuration files.
8. Build storefront/admin for the selected edition and keep search indexing
   false.
9. Start the backend and verify `/api/health`, then `/api/ready`.
10. Verify `/healthz` on storefront/admin and run authentication, catalogue,
    cart, order, payment-method, refund, and authorization smoke tests with
    synthetic records.
11. Connect customer domains using targets supplied by the chosen platform,
    verify managed TLS, and re-run exact-origin/CORS/CSRF/cookie tests.
12. Enable storefront indexing only after content, legal, security, operations,
    and launch-owner approval.
13. Activate providers one at a time in separately approved work.
14. Remove temporary migration credentials, rotate handoff secrets, confirm
    monitoring/backups, and complete the sale checklist.

## Commands

- Backend: `npm ci`, `npm test -- --runInBand --watchAll=false`, `npm start`
- Storefront: `npm ci`, `npx tsc --noEmit --incremental false`,
  `npm run lint`, `npm run build`, `npm run start`
- Admin: same Next.js command sequence as storefront

Run commands from their component directories. Use the Node/npm versions
approved by the customer’s locked-runtime verification.

## Security defaults

- Secure, HttpOnly, host-only refresh cookie; `SameSite=Lax` for this approved
  sibling-domain topology.
- Exact `TRUSTED_ORIGINS`; CORS and CSRF share the validated allowlist.
- `TRUST_PROXY` equals the verified proxy-hop count.
- Provider flags false, assistant disabled or retrieval, email disabled/mock,
  local uploads disabled.
- Admin and API are never indexed; storefront indexing requires explicit true.

## Referenced guides

See the customer platform, Vercel, Render, generic Node, Linux VPS, Atlas,
DNS/TLS, branding, edition, legal completion, and sale/handover guides under
`docs/`. Unknown customer/platform/provider values remain customer actions;
never guess them.
