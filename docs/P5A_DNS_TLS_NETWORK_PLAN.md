# P5A DNS, TLS, and Network Readiness Plan

## Status

Planning only. No DNS record, certificate, firewall rule, Atlas access-list entry, cloud resource, or network route was created or changed.

## Sanitized mapping

| Component | Placeholder origin | Candidate DNS mapping | Required outcome |
|---|---|---|---|
| Storefront | `https://shop.staging.example.invalid` | CNAME/ALIAS to the approved platform, or A/AAAA only when the platform supplies stable addresses | Fixed HTTPS origin |
| Admin | `https://admin.staging.example.invalid` | CNAME/ALIAS or approved stable A/AAAA | Fixed HTTPS origin with previews blocked |
| Backend | `https://api.staging.example.invalid` | CNAME/ALIAS or approved stable A/AAAA | Fixed HTTPS API and cookie host |

Record types cannot be finalized until the platform supplies authoritative targets. Real targets must stay in the controlled operator record, not this repository document.

## Readiness checklist

### DNS

- [ ] DNS owner/provider approved.
- [ ] Fixed storefront, admin, and backend names approved.
- [ ] Platform-provided target type and value verified out of band.
- [ ] CNAME/ALIAS preferred where the platform owns address rotation.
- [ ] A/AAAA used only for documented stable ingress addresses.
- [ ] IPv4 and IPv6 paths tested independently when both are published.
- [ ] No wildcard record unintentionally exposes preview/admin services.
- [ ] Staging search indexing blocked at edge/app and verified.
- [ ] Pre-cutover TTL selected low enough for rollback, then raised after stabilization.
- [ ] Rollback target and minimum propagation window recorded.

### TLS

- [ ] Certificate management method approved.
- [ ] Certificate covers only approved staging names.
- [ ] Domain-control validation completed by the DNS owner.
- [ ] TLS issuance occurs before application traffic.
- [ ] Automatic renewal enabled and renewal-failure alert assigned.
- [ ] HTTP redirects to HTTPS without reflecting untrusted host headers.
- [ ] Secure-cookie behavior tested only over HTTPS.
- [ ] HSTS policy approved. Begin with a conservative staging policy; do not include parent/subdomains or preload without domain-owner review.
- [ ] TLS termination location documented: edge, load balancer, reverse proxy, or application.

### Backend ingress and proxy

- [ ] Public backend ingress limited to HTTPS.
- [ ] Platform health-check source ranges identified where allowlisting is used.
- [ ] Request-size, idle-timeout, and header limits documented.
- [ ] Edge preserves the original scheme/host using platform-supported forwarded headers.
- [ ] Proxy chain diagram records each trusted hop.
- [ ] `TRUST_PROXY` set to the exact count required by that chain.
- [ ] Broad proxy trust, arbitrary forwarded headers, and an undocumented boolean `true` are rejected.
- [ ] CORS allows only approved storefront/admin/additional origins.
- [ ] CSRF Origin verification uses the same exact allowlist.

### Backend egress and Atlas

- [ ] Backend runtime can resolve the URI's required DNS form.
- [ ] If the approved URI uses SRV, the platform resolver supports SRV and TXT lookups. Do not silently convert or downgrade the URI.
- [ ] TCP egress to only the required staging database endpoints/ports is available.
- [ ] Atlas Project IP Access List contains only approved staging egress identities.
- [ ] An unrestricted/global IPv4 allowlist is forbidden.
- [ ] Dynamic/shared egress IP behavior is understood before allowlisting.
- [ ] If fixed egress is unavailable, approve private networking or a controlled NAT/egress solution; do not broaden the access list.
- [ ] Private endpoint/peering availability, DNS integration, cost, and rollback are evaluated.
- [ ] Production Atlas project/cluster/network identifiers are never supplied to staging.
- [ ] Connection attempts and failures are sanitized before centralized logging.

### Frontend/admin outbound behavior

- [ ] Browser API calls target only the approved backend origin.
- [ ] Storefront build can retrieve the configured Google font or uses a separately approved self-hosting source change.
- [ ] Storefront image optimizer egress is restricted to reviewed remote image hosts.
- [ ] Stripe browser SDK is not initialized because its public key is omitted.
- [ ] No analytics, marketing, geolocation, SMTP, or payment-provider egress is enabled.

## Network decision risks

| Risk | Stop/mitigation |
|---|---|
| Dynamic platform egress cannot be safely allowlisted | Stop; select private networking or fixed egress |
| SRV resolution unsupported | Stop; fix platform DNS rather than use production or an unapproved URI |
| IPv6 record published without working backend path | Remove/withhold the AAAA record through approved DNS change |
| Proxy count unknown | Stop; do not guess `TRUST_PROXY` |
| CORS wildcard proposed | Stop |
| Preview origin proposed for trusted allowlist | Stop or disable preview deployment |
| TLS not valid/renewable | Stop before cookie/auth smoke |
| Atlas access widened globally | Stop and revert through the authorized network owner |
| DNS rollback target missing | Stop before cutover |

## Rollback preparation

Before any future cutover, record:

- old and new DNS targets in the private operator change ticket;
- TTL and expected propagation windows;
- platform rollback version for each component;
- certificate state for both targets;
- backend cookie/origin compatibility during propagation;
- Atlas egress identities for both active and rollback backends;
- the owner authorized to execute rollback.
