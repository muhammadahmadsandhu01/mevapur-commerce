# P5E Branding Coupling Audit

## Scope and result

The active global public identity is now driven by the HARZAAR storefront/admin branding contracts. This was a focused display-layer change, not a global `MevaPur` replacement.

## Active occurrences updated

The following active surfaces were updated from hardcoded or incomplete identity to centralized HARZAAR branding:

- storefront metadata, title template, description, Open Graph fields, and favicon;
- storefront Navbar, global footer, homepage identity, login, registration, forgot-password, order-success acknowledgement, product-brand fallback, and Help Assistant display;
- admin browser title, description, favicon, login, Sidebar, TopBar, copyright, palette, and read-only Admin Help Assistant display;
- Node health display message, Swagger titles/descriptions/site title, and disabled/mock email subjects;
- deterministic assistant brand knowledge and index.

The homepage global category and positioning copy no longer describes the entire platform as only dry fruits/grocery or Pakistan-only. Contextual catalogue, promotion, category, address-validation, and product data were not rewritten merely because they mention a specific category or market.

## MevaPur occurrences intentionally preserved

The following classes of occurrence remain intentionally unchanged:

- P0–P5D historical reports, evidence, backup paths, and milestone names;
- MongoDB/Atlas project, cluster, database, restore, marker, and migration identities;
- JWT issuer/audience, logging service names, package names, and browser storage keys used as compatibility identifiers;
- migration and seed identities;
- existing demo/login account email addresses and admin/staff placeholder domains where they identify the established demo environment rather than the marketplace display name;
- the seeded `MevaPur` dry-fruit product brand where it is catalogue content;
- protected payment/provider, authentication, model, schema, index, migration, and legacy compatibility code.

The remaining authentication email defaults in `backend/config/auth.config.js` were not edited because that file belongs to the protected authentication contract. Active disabled/mock mail subjects are configuration-driven through `backend/config/email.config.js`; future production email-provider work must separately reconcile the protected default through an approved authentication change.

## Assets and identifiers

- Existing legacy assets were not deleted, moved, or renamed.
- HARZAAR assets use a geometric H and forward-arrow negative space; no cart/bag became the primary symbol.
- No API route, cookie name, token contract, error code, provider ID, payment method ID, database name, Atlas marker, migration identity, package name, or storage key was renamed.
- No actual product, category, inventory, order, payment, refund, or provider record was changed.

## Coupling assessment

Public identity is centralized sufficiently for normal customer rebranding without commerce business-code changes. Some historical/compatibility defaults still contain `MevaPur` by design; they must be handled only through separately approved migration or protected-contract work, never through a blind text replacement.
