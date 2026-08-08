# Admin Help Assistant Guide

The panel is available only inside the existing protected admin application.
It is marked **Read-only** and offers quick prompts for inventory, pending
orders, manual-payment queue, refunds, provider availability, and system help.

Approved output includes admin documentation, feature/edition explanations,
product/inventory summaries, low-stock fields, order/payment/refund counts,
provider availability without secrets, and health guidance. It does not expose
raw customer PII by default.

The assistant cannot create/update/delete products, alter inventory or orders,
approve/reject payments or refunds, enable providers, edit configuration, run
arbitrary queries/reports, access secrets, or execute commands. No approval or
mutation buttons exist in the panel.

Source labels identify curated knowledge or a role-scoped read-only tool.
Operational and commercial actions must be completed through existing approved
screens and controls, never through chat. Messages are not persisted in
browser storage or the backend.
