# P5A Provider, Email, and External-Network Policy

## Initial staging policy

- Stripe: disabled.
- JazzCash: disabled.
- Easypaisa: disabled.
- Live provider credentials: absent.
- Sandbox provider calls during initial deployment: forbidden.
- Outbound email: disabled or approved local/mock capture only.
- Analytics/marketing: disabled unless separately approved.
- Production API dependency: forbidden.
- Manual/local payment methods: disabled by default; individual COD, bank-transfer, or Raast smoke requires owner approval and synthetic-only data.

## Outbound-operation inventory

| Operation | Component | Classification | Initial policy | Evidence/notes |
|---|---|---|---|---|
| Isolated staging MongoDB connection | Backend | Required | Allowed only in future P5 after identity/network gates | `MONGODB_URI` is the application data dependency |
| Storefront/admin browser calls to MevaPur backend | Browser | Required | Allowed only to approved staging API origin | Active API clients use `NEXT_PUBLIC_API_URL` with credentials |
| Google Inter font retrieval | Storefront build | Build-time only | Allow only in approved build network, or self-host in a separate source milestone | `frontend/src/app/layout.tsx` uses `next/font/google` |
| Remote image retrieval/optimization | Storefront server/browser | Optional/unresolved | Restrict to reviewed allowlist; remove historic/unused host in a separate source milestone | Active Next config enables image optimization and remote patterns |
| Stripe server API | Backend | Must be disabled | Provider flag false; no secret; no call | Stripe provider/SDK exists |
| Stripe browser SDK/script | Storefront browser | Must be disabled | Omit `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; disabled provider must not initialize SDK | `PaymentModal` supports a publishable key only when supplied |
| Stripe webhook verification | Backend inbound | Optional boundary only | No external provider call; disabled-provider rejection/boundary can be tested synthetically | Raw webhook route must remain before JSON parsing |
| JazzCash API | Backend/browser | Must be disabled | Flag false; contract approval false; no credential/call | Provider skeleton/gates exist |
| Easypaisa API | Backend/browser | Must be disabled | Flag false; contract approval false; no credential/call | Provider skeleton/gates exist |
| COD | Backend/browser | Optional local operation | Disabled unless owner approves synthetic smoke | No outbound provider dependency |
| Manual bank transfer | Backend/browser | Optional local operation | Disabled unless owner approves synthetic smoke and public display metadata | No provider credential should be used |
| Raast manual instructions | Backend/browser | Optional local operation | Disabled unless owner approves synthetic smoke and public identifier | Treat as manual flow; no outbound provider call |
| Email service | Backend | Must be mocked/disabled | No SMTP variables; no external delivery | Current service is mock/log-oriented |
| Email log metadata | Backend | Unresolved privacy risk | Redact synthetic recipient/subject metadata before centralized logs | Existing mock code logs queued email context |
| SMTP | Backend | Must be disabled | No host/user/password; no socket connection | Configuration names exist but no activation approved |
| Analytics/marketing pixels | Storefront/admin | Must be disabled | No integration approved | No active first-party integration found |
| IP/geolocation lookup | Backend/frontend | Must be disabled | No external lookup approved | No active external geolocation dependency found |
| Search/recommendation API | Storefront | Required internal API only | Backend staging API only | Product/recommendation calls use the configured API base |
| Package registry | Build/install | Build-time only | Use lockfile and approved build network/cache; no package upgrade | Three lockfile-v3 manifests exist |
| Next telemetry | Build/runtime | Optional | Disable through approved platform/framework setting | Avoid unapproved telemetry |
| DNS/TLS validation | Platform/operator | Required operational | Approved infrastructure checks only in P5 | Not an application API |
| Monitoring/log export | Platform | Required after owner selection | Only approved destination with redaction | No repository integration exists |

## Fail-closed provider rules

1. Inject all six `PAYMENT_PROVIDER_*_ENABLED` flags explicitly.
2. Require Stripe, JazzCash, and Easypaisa flags to be `false`.
3. Require JazzCash and Easypaisa contract-approval flags to be `false`.
4. Do not inject provider secrets, webhook secrets, merchant credentials, or Stripe browser key.
5. Inspect sanitized startup/config evidence before traffic.
6. Reject disabled-provider API operations deterministically.
7. Treat any outbound provider DNS/TCP request as an incident and rollback trigger.
8. Historical payment records may be read without reactivating their provider.

## Email rules

- Initial mode is owner-selected `disabled` or local/mock capture.
- SMTP variables remain absent.
- Password-reset/verification smoke uses synthetic identities and must not deliver externally.
- Mock output must not expose tokens, links, email bodies, secrets, or sensitive personal data.
- Any sandbox mail provider requires a separate approval, domain policy, recipient allowlist, retention policy, and smoke plan.

## Build-network rules

P5A does not install or upgrade packages. A future approved build may require:

- package registry/cache access for `npm ci`;
- Google font retrieval for storefront build;
- approved image/build assets, if any.

Build egress must be distinct from application runtime egress, logged without secrets, and constrained to approved endpoints. Failure must stop the build; it must not trigger a source/configuration fallback.

## Runtime egress allowlist principle

Initial backend runtime requires only the approved isolated staging database network path plus approved monitoring/log transport. Frontend/admin browsers require only their own origins, the approved backend, and reviewed static/image origins. Everything else is denied or unapproved.

