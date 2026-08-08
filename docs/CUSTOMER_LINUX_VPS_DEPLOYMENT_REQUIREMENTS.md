# Customer Linux VPS Deployment Requirements

This is an operational requirement list, not an executed VPS installation.

## Host and process controls

- customer-owned supported Linux distribution and patched Node runtime;
- non-root service identity and least-privilege filesystem permissions;
- customer-owned repository/artifact path outside the web root;
- three supervised Node processes with automatic restart and signal forwarding;
- secrets supplied by a protected service manager, never committed `.env`;
- firewall permitting only required inbound HTTPS/administration and controlled
  backend egress;
- synchronized time, disk monitoring, log rotation, alerting, backup, and
  tested recovery.

## Reverse proxy and TLS

Route the three fixed HTTPS hostnames to the corresponding internal processes.
Preserve client/proxy headers consistently with the exact `TRUST_PROXY` count.
Do not alter the raw payment-webhook body. Set request-size/time limits that
match the application. Obtain DNS values from the actual VPS/network design;
no IP is specified here. Automate TLS issuance/renewal and alert before expiry.

## Files and data

Keep `LOCAL_UPLOADS_MODE=disabled` until customer-owned durable object storage
is separately implemented. Only the backend connects to customer-owned Atlas.
Do not expose database ports publicly. Back up configuration metadata and
customer data according to an approved retention policy.

## Acceptance and rollback

Verify health/readiness, exact origins, cookies, authentication, noindex,
logging redaction, graceful shutdown, synthetic commerce flows, monitoring,
backup restoration, and artifact rollback before launch.
