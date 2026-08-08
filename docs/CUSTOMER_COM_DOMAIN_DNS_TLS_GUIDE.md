# Customer .com Domain, DNS, and TLS Guide

The customer may use any registrar. Domain registration and application
hosting are independent. Registrar choice does not require application
business-code changes.

Reference topology:

- `www.example.com` storefront;
- `admin.example.com` admin;
- `api.example.com` backend;
- apex `example.com` redirects to `https://www.example.com`.

These names are sanitized placeholders, not usable customer values.

## Customer actions

1. Register/transfer the `.com` in the customer account and enable strong
   account security, registrar lock, recovery contacts, and renewal.
2. Obtain exact DNS targets from the selected hosting platforms. Do not invent
   an IP, CNAME, verification record, or proxy mode.
3. Create only the required records, observe provider TTL/verification
   guidance, and document rollback values.
4. Use managed TLS where practical; verify issuance, hostname coverage,
   automatic renewal, expiry alerting, redirects, and modern protocol settings.
5. Configure the three exact production origins and validate CORS, CSRF,
   Secure/HttpOnly/host-only cookies, `SameSite=Lax`, redirects, and no mixed
   content.
6. Keep admin/API noindex. Enable storefront indexing only after final content
   and launch approval.

Do not allow uncontrolled preview origins, wildcard CORS, wildcard CSRF,
credential-bearing URLs, or a cookie domain broader than required. DNSSEC,
CAA, email DNS, regional routing, and privacy/legal decisions require
customer/provider review; this guide does not promise universal compliance.
