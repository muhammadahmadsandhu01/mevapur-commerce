# Customer Platform Compatibility Guide

## Portable runtime contract

MevaPur Commerce is application source, not a hosting subscription. A customer
may select any platform that satisfies the following contract:

- a supported Node.js runtime compatible with the repository lock files;
- two Next.js production builds and Node runtimes (storefront and admin);
- one long-running Node/Express backend process;
- platform-provided `PORT`;
- protected environment and secret injection;
- three fixed HTTPS custom origins;
- backend liveness `/api/health` and readiness `/api/ready`;
- storefront/admin liveness `/healthz`;
- graceful `SIGTERM`/`SIGINT` handling;
- backend outbound access to customer-owned MongoDB;
- a durable external object-storage plan before enabling write uploads.

The customer should reproduce the repository-pinned runtime first. `npm ci`
installs locked dependencies. Commands below come from the three package files.

## A. Managed Next.js plus managed Node backend

| Component | Install | Build | Start |
|---|---|---|---|
| Storefront | `npm ci` in `frontend` | `npm run build` | `npm run start` |
| Admin | `npm ci` in `admin-panel` | `npm run build` | `npm run start` |
| Backend | `npm ci` in `backend` | No compile step | `npm start` |

Required capabilities: two Node-capable Next.js services, one persistent
backend service, protected per-component variables, custom domains, HTTPS,
health probes, and backend database egress. Configure the API reverse-proxy
path only if the platform requires it; browser configuration still names the
API origin, and the client appends `/api`.

Likely application adaptation: **configuration only** when all capabilities
exist.

## B. General Node.js application platform

Create three services from the same customer repository, each with its own
working directory and commands above. Inject only the variables used by that
component. The platform must pass its port to the backend and must not assume a
writable persistent local filesystem. Termination grace must be longer than
`SHUTDOWN_TIMEOUT_MS`.

Likely adaptation: **configuration or small platform launch configuration**.

## C. Linux VPS or cloud VM

Use a reverse proxy for the three HTTPS hostnames and a process manager that
restarts services, preserves environment separation, and forwards termination
signals. Do not place secrets in shell history, repository files, web roots, or
proxy configuration. Configure log rotation, firewall rules, OS patching,
backups, monitoring, and TLS renewal.

Likely adaptation: **operations work; normally no commerce business-code
change**.

## D. Container platform

The application can target a Node-capable container platform, but this
repository does not claim a verified container image in P5C. Image definitions,
non-root execution, health checks, immutable artifacts, build caching, and
registry policy require a separately approved container milestone.

Likely adaptation: **separate container package required**.

## E. Serverless or edge-only platform

The current Express lifecycle, Mongoose connection behavior, readiness checks,
webhooks, and graceful shutdown assume a long-running Node process. A platform
with a compatible persistent Node service may work; edge-only or
function-only execution is not automatically compatible.

Likely adaptation: **architecture review and custom development may be
required**.

## F. Static or PHP-only hosting

Static hosting cannot execute authenticated Next.js server behavior or the
Express API. PHP-only hosting cannot run the complete current Node
applications. It may serve exported static content only after a separately
scoped redesign.

Compatibility: **incompatible with the complete current application**.

## Environment, proxy, filesystem, and network notes

- Use `backend/.env.production.example`,
  `frontend/.env.production.example`, and
  `admin-panel/.env.production.example` as contracts, not deployable values.
- Never copy a real environment file into an artifact.
- Set `TRUST_PROXY` to the verified proxy-hop count, never broad `true`.
- Keep host-only Secure HttpOnly cookies. The approved sibling-domain topology
  uses `SameSite=Lax`.
- CORS and CSRF use the same exact validated allowlist.
- `LOCAL_UPLOADS_MODE=disabled` is the portable production default.
- Allow outbound database traffic only from the backend runtime.
- DNS targets must come from the selected platform; this guide invents no IP or
  record target.

Domain registrar choice is independent from application hosting and never
requires Auth, Order, Inventory, Payment, Refund, or provider business-code
changes. An incompatible runtime selection may require custom development.
Vercel and Render are examples, not runtime dependencies.
