# Customer Vercel Storefront/Admin Reference

Vercel is an optional reference platform, not an application dependency. Use a
customer-owned Vercel team, repository integration, domains, environment
values, billing, and logs. This guide contains no current owner project/account
identity.

Create two projects from the customer repository:

| Project | Root | Install | Build | Runtime |
|---|---|---|---|---|
| Storefront | `frontend` | `npm ci` | `npm run build` | Next.js Node |
| Admin | `admin-panel` | `npm ci` | `npm run build` | Next.js Node |

Inject only each project’s sanitized production-template variables. The API
value is an origin, not an `/api` URL; source appends exactly one `/api`
segment. A missing, loopback, non-HTTPS, credential-bearing, placeholder, or
path-bearing API value fails a production/preview build. Do not add AI,
MongoDB, JWT, or payment-provider secrets to a Vercel browser build.

The owner must set these public variables later:

| Project | Variable | Safe value shape | Production | Preview |
|---|---|---|---|---|
| Storefront | `NEXT_PUBLIC_API_URL` | `https://mevapur-backend.onrender.com` (origin only) | Required | Required |
| Storefront | `NEXT_PUBLIC_SITE_URL` | `https://<approved-storefront-origin>` | Required | Required; use an approved preview alias |
| Storefront | `NEXT_PUBLIC_SITE_NAME` | Public display name, maximum 80 characters | Required | Required |
| Storefront | `NEXT_PUBLIC_SEARCH_INDEXING_ENABLED` | `true` or `false` | Required; enable only after launch approval | Required; always `false` |
| Admin | `NEXT_PUBLIC_API_URL` | `https://mevapur-backend.onrender.com` (origin only) | Required | Required |
| Admin | `NEXT_PUBLIC_ADMIN_URL` | `https://<approved-admin-origin>` | Required | Required; use an approved preview alias |
| Admin | `NEXT_PUBLIC_SITE_NAME` | Same public display name as Storefront | Required | Required |

Vercel Preview builds also use `NODE_ENV=production`, so the API variable must
be configured for Preview rather than relying on the development localhost
default. Frontend and Admin must use the same backend origin.

Before custom-domain activation, prevent preview origins from entering
backend CORS/CSRF allowlists. Obtain DNS targets from the customer’s Vercel
project, not this repository. Verify backend `/api/health` and `/api/ready`, security/noindex headers,
canonical/robots/sitemap behavior, API cookies, login/refresh/logout, and
mobile UI. Enable storefront indexing only after final domain launch approval.

Rollback means promote the last customer-approved immutable deployment and
restore its matching environment configuration. It does not mean changing
commerce business logic.
