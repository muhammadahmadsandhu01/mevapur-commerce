# P2.2 Payment Provider Architecture

## Decision

Payment orchestration is separated into a versioned provider contract, a registry, edition manifests, feature flags and provider adapters. Routes and clients ask the registry what is available; they do not infer availability from a provider name.

## Runtime dependency map

```text
Order route -> OrderService -> PaymentProviderRegistry eligibility
Payment route -> PaymentService -> PaymentProviderRegistry -> provider adapter
Webhook route (raw bytes) -> PaymentService -> installed callback provider
Admin UI -> safe provider status API -> authorized manual/COD actions
Storefront -> safe methods API -> provider-neutral selector
```

The existing `services/payment` imports remain valid. Canonical modular imports are under `backend/modules/payments`. Stripe's tested implementation remains at its established path and is decorated by the modular adapter so test injection and webhook behavior remain compatible.

## Boundaries

- Core owns authentication, authorization, order ownership, amount/currency, idempotency, persistence, transactions and state transitions.
- Providers own manifest metadata, configuration validation, capabilities, checkout eligibility and provider-specific operations.
- Providers never receive a client-supplied total.
- PKR remains the only supported currency in P2.2.
- No queue, Redis, Atlas index migration, integer-paisa migration or multi-currency work is part of this milestone.
