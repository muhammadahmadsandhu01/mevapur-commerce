# P5A Staging Topology Decision

## Sanitized origin placeholders

- Storefront: `https://shop.staging.example.invalid`
- Admin: `https://admin.staging.example.invalid`
- Backend: `https://api.staging.example.invalid`

These are reserved invalid examples, not proposed real DNS values.

## Important browser distinction

All three examples are **cross-origin** because their hosts differ. When they use HTTPS and share the same registrable parent domain, they are nevertheless **schemefully same-site**. CORS still applies to browser API calls even when cookies are same-site.

The refresh cookie should remain HttpOnly, Secure, and host-only on the backend host. Storefront/admin JavaScript does not need to read it; credentialed API requests send it to the backend.

## Decision table

| Concern | A. Three subdomains under one registrable parent | B. Frontends and backend on unrelated domains | C. Platform-generated temporary domains |
|---|---|---|---|
| Example | `shop`, `admin`, and `api` under `staging.example.invalid` | Frontends and API have unrelated registrable domains | Each service uses a generated platform hostname |
| Same-site classification | Same-site when all use HTTPS | Cross-site | Usually cross-site or unstable; platform-dependent |
| Cross-origin | Yes | Yes | Yes |
| Cookie SameSite | `Lax` or `Strict` can support same-site API requests; exact value still requires approval | `None` normally required for the backend refresh cookie | Often `None`; may change when domains change |
| Secure cookie | Required | Required, and mandatory with `SameSite=None` | Required |
| Host-only cookie | Compatible and preferred; cookie is scoped to the API host | Technically host-compatible, but treated as third-party in frontend context | Technically compatible, but unstable hostnames invalidate sessions |
| Browser privacy risk | Low relative to alternatives | High: third-party cookie blocking may break refresh/login | High: third-party treatment and hostname churn |
| CORS | Exact storefront and admin origins | Exact unrelated origins | Every permitted generated origin must be known; wildcards are forbidden |
| CSRF Origin validation | Exact storefront/admin origins; straightforward | Exact unrelated origins; must match deployment precisely | Preview origins create unsafe pressure to broaden the allowlist |
| Login/redirect behavior | Simple; API cookie stays on API subdomain and requests remain same-site | Login/refresh can fail under third-party cookie restrictions | Sessions can be lost when preview hostname changes |
| Preview-domain risk | Can disable previews and use fixed origins | Platform previews can create unapproved origins | Intrinsic unless fixed aliases and preview blocking are enforced |
| Operational complexity | Lowest once DNS/TLS is owned | Medium/high: multiple platforms, egress, TLS, incident ownership | High: unstable origins, allowlists, callbacks, and audit evidence |
| Security trade-off | Exact origins plus same-site cookies; smallest browser compatibility risk | Strong origin separation but fragile cookie behavior and more configuration error surface | Fast to provision but weakest predictability and easiest path to wildcard/preview mistakes |
| Rollback | Stable DNS aliases can be moved with controlled TTL | Platform-specific rollback across unrelated control planes | Generated URLs may change and invalidate the approved origin set |

## Recommendation — owner approval required

**Option A: three fixed HTTPS subdomains under one registrable staging parent domain.**

Recommended companion decisions:

- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAME_SITE=lax` for the initial no-external-provider staging journey, subject to owner approval
- Host-only refresh and CSRF cookies; do not set a parent `Domain`
- Exact storefront/admin entries in `TRUSTED_ORIGINS`
- Exact `FRONTEND_URL`, `ADMIN_URL`, and `BACKEND_PUBLIC_URL`
- Disable public preview deployments
- Block search indexing
- Use the platform-documented proxy-hop count, not a generic boolean

Why: this retains cross-origin isolation while avoiding cross-site/third-party-cookie behavior. It also keeps CORS and CSRF allowlists small and stable.

No option is selected in P5A. Owner-selected topology remains **PENDING**.

## Non-negotiable validation for every option

1. All public origins use HTTPS.
2. No CORS wildcard is used with credentials.
3. CSRF validation uses exact approved origins.
4. `AUTH_COOKIE_SECURE` is true.
5. `SameSite=None`, if selected, is paired with Secure and tested under current browser third-party-cookie policies.
6. Refresh cookie remains HttpOnly and is never exposed through JSON or `NEXT_PUBLIC_*`.
7. `TRUST_PROXY` equals the documented hop count between the public client and Node.
8. Generated preview origins are not automatically trusted.
9. A domain change triggers a rebuild of both Next applications and a backend origin reconfiguration.
10. Browser smoke must prove login, refresh, logout, accepted origins, and rejected unknown origins.

