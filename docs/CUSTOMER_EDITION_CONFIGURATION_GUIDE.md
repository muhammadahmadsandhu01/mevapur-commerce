# Customer Edition Configuration Guide

`PAYMENT_EDITION` accepts `pakistan`, `international`, or `full`. Edition
selection controls which regional capabilities may be presented. It does not
activate a provider, prove merchant approval, or grant legal/tax/compliance
approval.

## Pakistan

- Cash on delivery, bank transfer, and Raast follow their documented
  configuration and operational policies.
- JazzCash and Easypaisa remain separately feature-gated and require their
  explicit official-contract approval flags.
- Provider secrets and merchant references are customer owned.

## International

- Domestic methods are hidden according to the existing edition manifest.
- Stripe remains separately feature-gated and requires customer-owned account,
  credentials, webhook verification, currency/market review, and end-to-end
  approval.

## Full

- Both regional capability families may be available.
- No provider is automatically enabled merely because `full` is selected.
- Each payment method still needs its feature flag, required public fields,
  secrets where applicable, merchant approval, and verified operational
  workflow.

## Safe activation sequence

Select edition → keep all provider flags false → validate customer
configuration → configure one method → run its existing tests → test in an
isolated approved environment → verify status/webhook/manual-review behavior →
approve activation → monitor and retain rollback.

P5C does not activate any payment provider and does not modify provider
behavior.
