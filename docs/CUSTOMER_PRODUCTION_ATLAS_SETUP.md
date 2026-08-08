# Customer Production Atlas Setup

P5C did not access Atlas or create a database. Customer production must use a
customer-owned Atlas organisation, project, cluster, users, network controls,
backups, alerts, and billing.

## Controlled setup

1. Customer administrators create the organisation/project and select region,
   capacity, availability, backup, encryption, and retention requirements.
2. Create separate least-privilege application and temporary migration
   identities. Never reuse demo/staging credentials.
3. Allow network access only from verified backend egress sources or approved
   private connectivity. Do not use an unrestricted `0.0.0.0/0` rule.
4. Store the application URI only in the backend secret store. Never expose it
   to Next.js public variables, logs, documents, or client bundles.
5. Establish a verified timestamped backup and isolated restore test before any
   production migration.
6. Run approved schema/index inventory and migration work in a separate,
   customer-authorized milestone. P5C performs none.
7. Compare expected collections/indexes/counts, run application smoke tests,
   verify active data remained unchanged, then remove isolated verification
   databases.
8. Remove temporary migration access and rotate the application credential
   after handoff.

Configure alerts for availability, connections, storage, performance, backup
failure, and suspicious access. Document recovery objectives and regularly
prove restore capability. Never connect automated tests to customer
production; database-backed tests use loopback MongoDB Memory Server.
