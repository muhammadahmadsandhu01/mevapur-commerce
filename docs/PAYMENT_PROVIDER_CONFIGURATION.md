# Payment Provider Configuration

Configuration is read server-side. Do not place private credentials in storefront or admin environment files.

Feature flags:

- `PAYMENT_PROVIDER_COD_ENABLED`
- `PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED`
- `PAYMENT_PROVIDER_RAAST_ENABLED`
- `PAYMENT_PROVIDER_JAZZCASH_ENABLED`
- `PAYMENT_PROVIDER_EASYPAISA_ENABLED`
- `PAYMENT_PROVIDER_STRIPE_ENABLED`

Manual public display fields:

- bank transfer: `BANK_TRANSFER_ACCOUNT_TITLE`, `BANK_TRANSFER_BANK_NAME`, `BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE`
- Raast: `RAAST_ACCOUNT_TITLE`, `RAAST_PUBLIC_ID`

Stripe additionally requires the existing secret/webhook configuration and a valid public publishable-key format. A syntactically configured key is not proof of external sandbox success.

JazzCash and Easypaisa remain unconfigured in P2.2 even if legacy-looking environment names exist. Activation requires verified official contracts and documentation.
