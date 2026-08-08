# Stripe Payment Provider

The existing PaymentIntent, refund and signed-webhook implementation is preserved behind the modular registry boundary.

Safety invariants:

- the webhook router remains mounted before `express.json()`;
- signature verification receives a raw `Buffer`;
- webhook events remain idempotent through the event ledger;
- order totals and currency are checked server-side;
- provider results are sanitized;
- the publishable key may be returned as public metadata, but secret and webhook keys never are.

Stripe is disabled by default in P2.2. Existing credentials were not re-tested externally. Configuration syntax or existing source code is not evidence of sandbox or production readiness.
