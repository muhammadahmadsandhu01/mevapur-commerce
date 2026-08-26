# Payment Provider Configuration

Configuration is read server-side. Do not place private credentials in storefront or admin environment files.

Provider credentials are deployment-environment managed only. The Settings API
and Admin settings page expose configured/not-configured indicators but do not
read, accept, or persist provider secrets. Legacy database fields are handled
only by the separately executed procedure in
`LEGACY_PROVIDER_SECRET_CLEANUP.md`.

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

Stripe additionally requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a
valid `STRIPE_PUBLISHABLE_KEY` in backend deployment configuration. The
storefront may receive only `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, which is a
public credential. A syntactically configured key is not proof of external
sandbox success.

JazzCash and Easypaisa remain unconfigured in P2.2 even if legacy-looking environment names exist. Activation requires verified official contracts and documentation.
