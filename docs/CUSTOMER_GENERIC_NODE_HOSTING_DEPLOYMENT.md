# Customer Generic Node Hosting Deployment

Create three isolated services from the customer-owned repository:

- `frontend`: `npm ci`, `npm run build`, `npm run start`;
- `admin-panel`: `npm ci`, `npm run build`, `npm run start`;
- `backend`: `npm ci`, `npm start`.

The host must support a compatible Node runtime, protected environment
injection, three HTTPS origins, a persistent Express process, platform `PORT`,
health probes, termination signals, and backend MongoDB egress. If the host
cannot run two Next.js Node services and one long-running backend, it is not a
configuration-only target.

Use a customer-controlled reverse proxy when the host exposes internal ports.
Forward the original scheme/host correctly, set only the verified
`TRUST_PROXY` hop count, preserve request bodies for webhook paths, and do not
cache authenticated API responses. Configure restarts, log retention,
monitoring, backups, and artifact rollback.

Resolve all placeholders, validate offline, build, start without production
data, verify health/readiness, attach customer-owned Atlas, run synthetic smoke
tests, then attach domains/TLS. Static/PHP-only and edge-only products require a
separate adaptation review.
