# P5C Domain, Platform and Account Coupling Audit

## Gate result

**PASS — source-change allowlist established before P5C application changes.**

This audit was performed against the pre-P5C dirty working tree captured in
`P5C_PRE_CHANGE_GIT_STATUS.txt`, `P5C_PRE_CHANGE_WORKING_TREE.patch`, and
`P5C_PRE_CHANGE_FILE_INVENTORY.csv`. Historical milestone evidence is retained
unchanged. Searches excluded generated dependencies and build output.

No current deployment, private environment file, Atlas resource, DNS record,
TLS certificate, provider account, or remote application was accessed.

## Findings

| Finding | Evidence | Classification | P5C treatment |
|---|---|---|---|
| Storefront and admin browser clients fall back to `http://localhost:5000/api` without an environment check. | `frontend/src/lib/api.ts`, `frontend/src/lib/authSession.ts`, `frontend/src/lib/adminApi.ts`, `admin-panel/src/lib/api.ts`, `admin-panel/src/lib/authSession.ts` | Active blocker for production; safe only in development/test | Replace with one validated public-origin helper per application. Production fails closed; loopback remains development/test only. |
| Storefront metadata contains fixed MevaPur name and Pakistan-specific description. | `frontend/src/app/layout.tsx` | Current demo branding; customer replacement item | Read the public site name and canonical origin from validated public configuration while retaining MevaPur as a non-production demo default. |
| Storefront content contains current demo support details and Pakistan-specific examples. | `frontend/src/app/page.tsx`, `frontend/src/app/cart/page.tsx`, `frontend/src/components/checkout/ContactForm.tsx`; preserved inactive `frontend/src/app/checkout/backup.tsx` | Current demo branding / edition content | Centralize reasonable public branding/contact values and document edition selection. Do not rewrite all UI copy or the preserved backup implementation. |
| Swagger definitions contain a fixed `https://api.mevapur.com/api/v1` server and demo support address. | `backend/docs/swagger.js`, duplicate inactive `backend/config/swagger.js`; `backend/routes/swaggerRoutes.js` points to `backend/docs/swagger.js`, and `backend/app.js` does not currently mount that route | Customer replacement item; duplicate inactive configuration | Use the validated backend public origin and a sanitized documentation contact placeholder. Do not activate Swagger as part of P5C. |
| Fixed Atlas staging identity strings exist only in approved P3 migration utilities. | `backend/scripts/migrations/p3-staging-index-migration.js`, `backend/scripts/migrations/p3-staging-schema-initialization.js` | Historical/controlled P3 evidence | Preserve unchanged. They are not customer runtime defaults and P5C must not modify P3 migrations. |
| Vercel references are the stock Next.js README deployment links, not application runtime dependencies. | `frontend/README.md`, `admin-panel/README.md` | Documentation reference | Keep Vercel as an optional reference platform and link the platform-neutral customer package. No Vercel-only application dependency is introduced. |
| No hard-coded `*.vercel.app`, `*.onrender.com`, owner repository ID, current deployment URL, or wildcard Atlas access-list value was found in first-party runtime source. | Sanitized path/count search; zero active matches for `vercel.app`, `onrender.com`, and `0.0.0.0/0` | Verified absence | Regression-scan after implementation. |
| Admin login and an operator utility contain a MevaPur demo admin address; a PHP seeder contains legacy demo data. | `admin-panel/src/app/login/page.tsx`, `backend/scripts/create-admin.js`, `backend/database/seeders/UserSeeder.php` | Demo placeholder / operator utility / legacy implementation | Do not expose as a production credential. Document replacement; P5C will not run seeders or refactor legacy PHP. |
| Public product imagery permits placeholder and Cloudinary hosts. | `frontend/next.config.js` and storefront content | Demo content / customer replacement item | Preserve current working image behavior. Customer replaces assets and may adjust allowlisted image hosts as a deployment configuration task. |
| Backend origins, cookies, proxy trust, and environment mode already use validated runtime configuration. | `backend/config/runtime.config.js`, `backend/app.js` | Active portable foundation | Extend only where required for customer production validation; keep CORS and CSRF on the same exact validated origin allowlist. |
| Current edition behavior is selected by `PAYMENT_EDITION`; provider enablement and merchant approval remain separate controls. | `backend/config/payment.config.js`, `backend/config/payment-editions/`, storefront/admin build scripts | Active portable foundation | Preserve behavior and document customer-owned edition/provider decisions. |

## Platform-runtime conclusion

The application does not require Vercel or Render in business source. It
requires two Next.js Node-capable runtimes, one long-running Express process,
protected environment injection, HTTPS origins, a writable or externally
managed strategy for any enabled runtime files, health probes, graceful
shutdown, and outbound access to customer-owned MongoDB. Vercel and Render are
reference deployment choices only.

Static-only, PHP-only, and edge-only targets are not drop-in compatible with
the complete current application. A container target needs a separately
approved container package because P5C expressly excludes Docker
implementation.

## Exact P5C source-change allowlist

Only the following existing application files may be changed during P5C:

- `backend/app.js`
- `backend/config/runtime.config.js` only if the existing public-origin
  contract cannot be reused without change
- `backend/docs/swagger.js`
- `backend/config/swagger.js`
- `backend/package.json` is **not** allowlisted
- `frontend/src/lib/api.ts`
- `frontend/src/lib/authSession.ts`
- `frontend/src/lib/adminApi.ts`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/page.tsx` only for canonical/public-brand integration
- `frontend/next.config.js`
- `frontend/README.md` only to point to the customer handoff package
- `admin-panel/src/lib/api.ts`
- `admin-panel/src/lib/authSession.ts`
- `admin-panel/src/app/layout.tsx`
- `admin-panel/next.config.ts`
- `admin-panel/README.md` only to point to the customer handoff package

New files are allowed only for the P5C domain/SEO configuration, sanitized
environment templates, read-only assistant module, deterministic knowledge
index, offline validator, focused tests/static contracts, assistant user
interfaces, and the required customer documentation.

Explicitly excluded from the allowlist:

- all models, schemas, indexes, migrations, seeders, and P3 utilities;
- Order, Payment, Refund, Inventory, Coupon, Return, Product, and provider
  business services/controllers/validators;
- real environment files;
- package and lock files;
- current deployment/platform configuration;
- any existing file deletion, move, rename, or archive operation.

If implementation would require a file outside this allowlist, P5C must stop
or update this audit with evidence before that file is edited.

## Post-change acceptance checks

- Production public origins are distinct validated HTTPS origins with no
  credentials, path, query, fragment, or wildcard.
- Development/test loopback defaults do not become production defaults.
- CORS and CSRF continue using one exact validated origin set.
- Storefront canonical, robots, and sitemap output comes from validated public
  configuration; indexing defaults off.
- Admin emits `noindex, noarchive`.
- No owner deployment URL/account identity or real customer domain is
  committed.
- Historical P3 evidence remains unchanged.
- Package/lock files, models/indexes/migrations, and protected business modules
  remain unchanged relative to the P5C checkpoint.
