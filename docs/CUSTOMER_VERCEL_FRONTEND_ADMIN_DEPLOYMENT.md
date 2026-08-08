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

Inject only each project’s sanitized production-template variables. Use
`https://www.example.com` and `https://admin.example.com` only as placeholders.
The API origin points to the separately hosted backend. Do not add AI/provider
secrets to a Vercel browser build.

Before custom-domain activation, prevent preview origins from entering
backend CORS/CSRF allowlists. Obtain DNS targets from the customer’s Vercel
project, not this repository. Verify `/healthz`, security/noindex headers,
canonical/robots/sitemap behavior, API cookies, login/refresh/logout, and
mobile UI. Enable storefront indexing only after final domain launch approval.

Rollback means promote the last customer-approved immutable deployment and
restore its matching environment configuration. It does not mean changing
commerce business logic.
