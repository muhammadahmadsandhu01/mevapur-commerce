# Payment Provider Contract

Contract version: `1.0`.

Every provider supplies:

- an immutable manifest with code, display name, integration version, payment type, supported countries/currencies and capabilities;
- a configuration validator;
- checkout eligibility evaluation;
- safe public metadata and redacted admin metadata;
- supported operations from create, status retrieval, callback verification/processing, refund and cancellation.

Unsupported operations fail with `PAYMENT_PROVIDER_OPERATION_UNAVAILABLE`. Provider errors must be sanitized. Raw provider responses, credentials and secrets must not be persisted or returned.

Implementations live under `backend/modules/payments/providers/<provider>`. A provider is not available merely because its source module is installed.
