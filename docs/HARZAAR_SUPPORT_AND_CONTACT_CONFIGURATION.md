# HARZAAR Support and Contact Configuration

## Policy

HARZAAR ships with no fabricated public contact details. Support and sales fields are optional and remain empty until the deployment owner supplies verified, customer-owned information.

The public branding contracts support:

- `supportEmail`;
- `salesEmail`;
- `supportPhone`;
- `whatsapp`;
- `address`;
- `businessHours`;
- `socialLinks.facebook`;
- `socialLinks.instagram`;
- `socialLinks.x`.

## Safe absence behaviour

An empty or whitespace-only field must not render a link or placeholder. The storefront footer checks each value before producing `mailto:`, `tel:`, WhatsApp, address, hours, or social links. Social links are shown only when they parse as public HTTP or HTTPS URLs. This prevents missing values from producing broken or misleading contact actions.

The generic `/contact` application route may remain visible where it is an implemented navigation destination; it must not be presented as proof that a monitored email address or phone number exists.

## Production replacement

Before production launch, the customer should provide:

1. a customer-owned domain;
2. monitored support and sales mailboxes on that domain;
3. a verified phone/WhatsApp number where applicable;
4. a publishable business address and hours where legally appropriate;
5. verified HTTPS social profile URLs;
6. an owner-approved copyright display name.

Do not place mailbox passwords, provider API keys, SMTP credentials, private contacts, or backend secrets in browser branding configuration. Email transport credentials remain backend-only and are independent of these public display fields.

Normal customer replacement requires editing the centralized public branding configuration/assets and deployment-owned public variables. It does not require changing authentication, order, payment, refund, inventory, provider, model, schema, index, migration, route, token, or cookie business code.

## Validation checklist

- Confirm every published address is customer owned and monitored.
- Confirm phone and WhatsApp links resolve to the intended public number.
- Confirm social URLs use HTTPS and belong to the customer.
- Confirm absent values are hidden on desktop and mobile.
- Confirm no secret appears in client source, built bundles, metadata, or logs.
- Confirm legal and privacy review before publishing address or contact data.
