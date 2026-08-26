# Customer Render Backend Reference

Render is an optional reference platform, not an application dependency. Use a
customer-owned service, billing account, environment group/secret store, logs,
and custom domain. Do not modify or inspect the owner’s demo service.

Reference service contract:

- root directory: `backend`;
- install: `npm ci`;
- build: no compile step;
- start: `npm start`;
- runtime: supported Node.js;
- port: platform-injected `PORT`;
- health path: `/api/health`;
- readiness path: `/api/ready`;
- graceful shutdown: forward `SIGTERM` and allow the configured timeout;
- outbound access: customer-owned MongoDB only.

Inject the resolved backend production template. Keep provider flags false,
email disabled, local uploads disabled, assistant disabled/retrieval, exact
origins, Secure cookies, and verified proxy-hop count. Obtain the DNS target
and managed-TLS instructions from the customer’s Render service.

Acceptance requires health/readiness, exact CORS/CSRF, auth cookies,
authorization, sanitized logging, raw webhook verification, and synthetic
commerce smoke tests. Roll back to the last approved artifact and environment
version. Never use rollback to point at demo/staging credentials.

For a fresh production database with zero users, follow the separately gated
[one-time Super Admin bootstrap](./INITIAL_ADMIN_BOOTSTRAP.md). Never run that
command as a Render start/build command, and remove its temporary environment
variables immediately after verification.
