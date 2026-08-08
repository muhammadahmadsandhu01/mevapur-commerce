# P3 Staging Application Smoke Results

> **Final authoritative status: PASS.** The original blocked snapshot is
> retained as history; `Executed Controlled Staging Smoke` records completion.

## Historical Gate Status

**BLOCKED — index migration dry-run did not authorize apply**

The application was not started against Atlas and no synthetic staging record
was created. Identity and connection configuration are now verified; the
blocker is the required migration sequence, not environment identity.

## Local Isolated Evidence

The P3 pre-change baseline, using no Atlas database, verified:

- `app.js` exports an Express function;
- importing `app.js` opens zero listening handles;
- loopback `/api/health` returns HTTP 200;
- raw Stripe webhook body reaches the service as a Buffer;
- raw webhook routing remains before JSON parsing;
- all 133 backend tests pass on MongoDB Memory Server;
- Pakistan/international/full storefront builds pass;
- Pakistan/international/full admin builds pass;
- retired endpoint matches: 0;
- browser sensitive payment/token storage matches: 0.

These checks are not a substitute for staging smoke evidence.

## Staging Scenarios Not Executed

| Scenario | Result |
|---|---|
| Backend connected to approved staging | Identity connection PASS; application not started |
| Staging provider availability | BLOCKED |
| Pakistan configured-method exposure | BLOCKED |
| International domestic-method exclusion | BLOCKED |
| Full-edition feature flags | BLOCKED |
| Registration/login synthetic smoke | BLOCKED |
| Synthetic Product read | BLOCKED |
| Synthetic COD Order/Payment | BLOCKED |
| Synthetic bank-transfer submission | BLOCKED |
| Synthetic Raast submission | BLOCKED |
| Admin manual verification | BLOCKED |
| Customer self-completion rejection | BLOCKED |
| Disabled external-provider force rejection | BLOCKED |
| Historical provider read | BLOCKED |
| Synthetic exact-ID cleanup | Not applicable |
| Real external provider call | NONE |

No smoke action was attempted after the migration dry-run returned `BLOCKED`.
Therefore no synthetic cleanup was required, and the final read-only snapshot
confirmed the staging marker remained intact.

## Future Synthetic-Data Rules

- Prefix every synthetic business identifier with the approved staging marker.
- Record exact MongoDB IDs immediately after creation.
- Use only staging-owned user/email/address/product/payment values.
- Never copy production customer/product/order/payment documents.
- Clean up only the exact recorded IDs.
- Compare collection/document counts with the expected exact cleanup delta.
- Do not use broad `deleteMany`, collection cleanup, or database drop.

## Executed Controlled Staging Smoke

The blocked section above is historical. After index apply and idempotency
passed, a controlled smoke used only the staging application URI, synthetic
records, production-mode application configuration, and disabled external
providers. HTTP client interception independently recorded zero external
requests.

| Scenario | Result |
|---|---|
| `app.js` import without listener | PASS |
| Health | HTTP 200 |
| Available configured methods | COD, bank transfer, Raast |
| Register / login / me | 201 / 200 / 200 |
| COD create / collect | 201 / 200 |
| Bank transfer create / submit | 201 / 202 |
| Customer self-review rejection | 403 |
| Admin bank-transfer review | 200 |
| Raast create / submit / admin reject | 201 / 202 / 200 |
| Forced Stripe / JazzCash / Easypaisa use | 503 / 503 / 503 |
| Historical provider record read | 200 |
| External provider requests | 0 |

The smoke created one unambiguous batch containing 2 users, 3 sessions, 7
orders, 4 payments, and 6 audit records. The initial model-level cleanup
stopped before deletion with the expected append-only
`AUDIT_LOG_IMMUTABLE` guard. A first recovery preflight failed locally with
sanitized `ERR_INVALID_URL`; a second preflight detected the actual
Mongoose-materialized collection topology. Both recovery attempts made zero
deletions.

Final cleanup privately resolved the one synthetic batch, captured exact IDs,
and deleted each of the 22 records individually inside one transaction. It did
not use `deleteMany`, collection drop, or database drop.

| Cleanup verification | Result |
|---|---|
| Exact audit records deleted | 6 |
| Exact payments deleted | 4 |
| Exact orders deleted | 7 |
| Exact sessions deleted | 3 |
| Exact users deleted | 2 |
| Remaining synthetic/application documents | 0 |
| Marker documents | 1, unchanged |
| Final collections/documents/indexes | 19 / 1 / 33 |

Mongoose materialized 11 empty model collections during the smoke. They were
retained because the approved cleanup was record-specific and prohibited broad
collection cleanup. Each contains zero documents and only its automatic
`_id_` index. This section is the authoritative final smoke status.
