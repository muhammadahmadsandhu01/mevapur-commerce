# Customer Project Sale and Handover Checklist

## Assets and ownership

- customer-owned repository/organisation with full source and history agreed by
  contract;
- customer-owned storefront/admin/backend hosting and billing;
- customer-owned registrar/DNS, Atlas, AI/payment/email accounts, monitoring,
  backups, and production data;
- documented license and ownership for code, fonts, images, content, and
  third-party services;
- seller demo accounts clearly excluded or transferred only by written scope.

## Secure transfer

- customer creates fresh production secrets in its secret stores;
- no demo/staging credential is reused;
- temporary transfer/migration credentials are time-limited and removed;
- customer rotates shared handoff credentials after acceptance;
- seller retains no customer production secrets, exports, or access;
- customer verifies owners, MFA, recovery contacts, least privilege, billing,
  audit logs, and emergency access.

## Acceptance evidence

- locked backup/recovery and rollback evidence;
- exact environment and platform inventory;
- builds/tests and synthetic end-to-end smoke results;
- health/readiness, logging, monitoring, alerting, backups, and restore proof;
- domains/TLS and exact-origin/cookie checks;
- content/legal checklist approval;
- provider activation status accurately recorded;
- known limitations, warnings, future work, and support terms accepted.

## Closure

Customer and seller sign an inventory of transferred assets, retained/excluded
assets, credentials destroyed, open risks, acceptance date, support window,
and incident contact. Real AI-provider activation and any assistant write
action require separate approved milestones.
