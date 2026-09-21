# Operational Runbook: Reverse Proxy, Routing & TLS Governance

## 1. Gateway Architecture & Virtual Hosts

The Nginx reverse proxy serves as the unified ingress point for the entire platform, routing traffic across 3 independent virtual hosts:

1. **Storefront** (`${STOREFRONT_HOST}`, e.g., `mevapur.com`): Routes to `frontend:3000` (Next.js standalone).
2. **Admin Panel** (`${ADMIN_HOST}`, e.g., `admin.mevapur.com`): Routes to `admin-panel:3001` (Next.js standalone).
3. **Backend API** (`${API_HOST}`, e.g., `api.mevapur.com`): Routes to `backend:5000` (Express API).

Any request with an unrecognized `Host` header is terminated immediately with HTTP 404.

---

## 2. Webhook Signature Preservation Contract

Payment gateways (Stripe, Easypaisa, JazzCash) compute HMAC-SHA256 signatures based on the exact byte sequence of the request payload.

### Strict Rules:
- **No `proxy_set_body`**: Never use `proxy_set_body` in webhook locations, as it modifies or replaces the incoming byte stream.
- **Pass Original Headers**: `proxy_pass_request_headers on;` is explicitly enabled.
- **Unmodified Forwarding**: Standard `proxy_pass http://backend_upstream;` is used, preserving exact byte content and `Content-Length`.
- **Protected Internal Endpoints**: `/api/metrics` is denied at the public gateway (HTTP 403) and only accessible within the internal backend network.

---

## 3. TLS / HTTPS Configuration & Certificate Provisioning

### Let's Encrypt / Certbot Setup
```bash
# Install Certbot
apt-get update && apt-get install -y certbot

# Issue certificates via webroot or standalone mode
certbot certonly --standalone \
  -d mevapur.com \
  -d admin.mevapur.com \
  -d api.mevapur.com \
  --email security@mevapur.com \
  --agree-tos --non-interactive
```

### Automatic Certificate Renewal
Add a daily cron job to check and renew certificates:
```bash
0 3 * * * certbot renew --post-hook "docker compose exec proxy nginx -s reload"
```

### TLS Cipher Suite & HSTS Rules
- Supported Protocols: TLSv1.2, TLSv1.3 only.
- HSTS (`Strict-Transport-Security`): Enabled with `max-age=31536000; includeSubDomains` only in production HTTPS profiles where all subdomains have valid certificates. HSTS is kept disabled in local and non-TLS staging profiles.
