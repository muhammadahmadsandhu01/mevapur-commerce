# Payment Edition Manifests

All editions use PKR as the base currency.

| Edition | Included provider source |
|---|---|
| `pakistan` | COD, bank transfer, Raast, JazzCash, Easypaisa, Stripe |
| `international` | Stripe |
| `full` | COD, bank transfer, Raast, JazzCash, Easypaisa, Stripe |

The manifest controls inclusion, not activation. A provider still requires its feature flag, validated configuration and checkout eligibility. No provider source file is removed when an edition excludes it.

Select an edition with `PAYMENT_EDITION=pakistan`, `international` or `full`. Invalid or absent values resolve to `pakistan`.
