# Payment Provider Security Checklist

- Server owns amount, currency, order ownership and eligibility.
- Every create/refund request has bounded idempotency.
- Webhook routes receive raw bytes before JSON parsing.
- Callback signatures and duplicate event IDs are verified.
- No raw provider response is stored or logged.
- No secret, password, salt, token or private merchant value is returned.
- Public merchant fields are intentionally approved for display.
- Customer transfer references are bounded, normalized, hashed and masked.
- Customers cannot complete manual payments.
- Automated providers have no manual-complete admin action.
- COD collection and manual verification require admin authorization.
- Historical records remain readable without executing disabled provider code.
- Edition exclusion never deletes provider source or historical data.
- Tests use loopback MongoMemoryServer and never Atlas.
