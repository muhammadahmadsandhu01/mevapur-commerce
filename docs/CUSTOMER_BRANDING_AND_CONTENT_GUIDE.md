# Customer Branding and Content Guide

## Public configuration

Production builds require:

- `NEXT_PUBLIC_SITE_URL`: the storefront HTTPS origin;
- `NEXT_PUBLIC_SITE_NAME`: the customer-approved public name;
- `NEXT_PUBLIC_SEARCH_INDEXING_ENABLED`: explicit `true` only after launch
  approval;
- `NEXT_PUBLIC_ADMIN_URL`: the admin HTTPS origin in the admin build.

The storefront centralizes reasonable display defaults in
`frontend/src/config/branding.ts`: site/legal display name, logo/favicon paths,
public support email and phone placeholders, business address placeholder,
locale, country, currency display, social links, copyright, and canonical
origin. These are public values. Never place private contacts, credentials, tax
IDs, private keys, or legal assurances in this module.

MevaPur remains the development/demo name. Customer production must replace
the public build-time site name and review the curated display values.

## Asset and content checklist

1. Supply customer-owned logo, favicon, product imagery, and usage rights.
2. Replace the public support placeholders and verify their monitored owner.
3. Replace the business address placeholder only with a publishable address.
4. Review homepage claims, delivery estimates, regional examples, currency,
   policy links, and accessibility text.
5. Provide finalized About, Contact, Shipping, Returns, Privacy, Terms, and
   payment-method copy approved for the launch markets.
6. Review social destinations; leave absent links empty.
7. Confirm image-host allowlists and content-delivery ownership.
8. Build each approved edition and inspect mobile and desktop output.

Do not turn every sentence into an environment variable. Stable editorial copy
should remain versioned content; deployment identity/origins belong in
configuration. This guide does not certify trademark, consumer-law,
accessibility, privacy, tax, or advertising compliance.
