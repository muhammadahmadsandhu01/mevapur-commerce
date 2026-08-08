# P3 Staging Baseline Results

Captured after the P3 source recovery checkpoint passed and before any staging
environment, migration implementation, or Atlas operation.

## Backend

### Complete regression

Command:

```text
npm.cmd test -- --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 16/16 passed
- Tests: 133/133 passed
- Snapshots: 0
- Time: 62.051 seconds
- Database: loopback-only MongoDB Memory Server replica set
- Atlas: inherited database configuration rejected by the test bootstrap
- Existing warnings: duplicate catalogue `slug` schema-index declarations

Expected negative integration cases emitted sanitized 4xx/5xx request logs.
They were asserted behavior, not test failures.

### Focused P0 Authentication

```text
npx.cmd jest __tests__/auth.test.js tests/unit/services/auth.service.test.js tests/unit/services/token.service.test.js tests/integration/auth.integration.test.js tests/e2e/auth.e2e.test.js --runInBand --watchAll=false --silent
```

- Exit code: `0`
- Suites: 5/5
- Tests: 23/23

### Focused P1 Order

```text
npx.cmd jest tests/unit/models/order.model.test.js tests/unit/validators/order.validator.test.js tests/unit/services/order.service.test.js tests/integration/order.integration.test.js tests/unit/contracts/checkout-order.contract.test.js --runInBand --watchAll=false --silent
```

- Exit code: `0`
- Suites: 5/5
- Tests: 59/59

### Focused P2 Payment

```text
npx.cmd jest tests/unit/contracts/checkout-payment.contract.test.js tests/unit/models/payment.model.test.js tests/unit/services/stripe.provider.test.js tests/integration/payment.integration.test.js --runInBand --watchAll=false --silent
```

- Exit code: `0`
- Suites: 4/4
- Tests: 32/32

### Focused P2.2 Providers

```text
npx.cmd jest tests/unit/services/payment-provider-registry.test.js tests/integration/multi-provider-payment.integration.test.js tests/unit/contracts/checkout-order.contract.test.js tests/unit/contracts/checkout-payment.contract.test.js --runInBand --watchAll=false --silent
```

- Exit code: `0`
- Suites: 4/4
- Tests: 35/35

### Static and Application Checks

| Check | Result |
|---|---|
| First-party JavaScript syntax | 169/169 passed |
| Relative imports | 6 unresolved legacy/inactive paths |
| `ERROR_CODES.*` | 35 referenced, 0 unresolved |
| `app.js` export | Express function |
| Listening handles before import | 0 |
| Listening handles after import | 0 |
| Listening handles after smokes | 0 |
| Loopback `/api/health` | HTTP 200 |
| Raw webhook smoke | HTTP 200 |
| Webhook service body | Buffer |
| Retired payment endpoint matches | 0 |
| Browser sensitive-token/payment storage matches | 0 |

The unresolved paths are the unchanged baseline:

- `backend/database/seeders/index.js` ->
  `../../common/logger`
- `backend/database/seeders/roleSeeder.js` ->
  `../../common/logger`
- `backend/middleware/authorize.js` ->
  `../errors/AppError`
- `backend/middleware/rateLimiter.js` ->
  `../config/security.config`
- `backend/middleware/rateLimiter.js` ->
  `../errors/AppError`
- `backend/middleware/securityHeaders.js` ->
  `../config/security.config`

### Secret Scan

- Active source files scanned: 437
- Valid production-like hard-secret findings: 0
- Recognized isolated fake provider-fixture occurrences: 8
- One 17-character `sk_live_` prefix-validation literal exists only in
  `backend/tests/unit/services/stripe.provider.test.js`; its length and test
  context do not constitute a usable provider secret.
- No value was printed.

## Storefront

### TypeScript

```text
npx.cmd tsc --noEmit --incremental false
```

- Exit code: `0`
- Result: PASS

### Lint

```text
npm.cmd run lint
```

- Exit code: `1`
- Problems: 68
- Errors: 33
- Warnings: 35
- Result: unchanged repository-wide debt

### Edition Builds

| Edition | Sandboxed attempt | Network-enabled result | Routes |
|---|---|---|---:|
| Pakistan | Failed only on Google Fonts access | PASS | 16 |
| International | Not repeated in restricted sandbox | PASS | 16 |
| Full | Not repeated in restricted sandbox | PASS | 16 |

No source changed between the sandboxed font failure and approved
network-enabled build.

## Admin Panel

### TypeScript

```text
npx.cmd tsc --noEmit --incremental false
```

- Exit code: `1`
- Errors: 8
- Four content pages pass unsupported `defaultType`.
- `TopBar.tsx` references four missing icon identifiers.
- Result: unchanged unrelated baseline debt

### Lint

```text
npm.cmd run lint
```

- Exit code: `1`
- Problems: 202
- Errors: 99
- Warnings: 103
- Result: unchanged repository-wide debt

### Edition Builds

| Edition | Result | Routes |
|---|---|---:|
| Pakistan | PASS WITH CAVEAT | 25 |
| International | PASS WITH CAVEAT | 25 |
| Full | PASS WITH CAVEAT | 25 |

The admin build explicitly skips type validation. The separate TypeScript
result is authoritative. Unsupported `eslint` configuration warnings remain.

## Baseline Decision

| Gate | Result |
|---|---|
| Complete backend | PASS, 16/16 and 133/133 |
| P0 Authentication | PASS, 23/23 |
| P1 Order | PASS, 59/59 |
| P2 Payment | PASS, 32/32 |
| P2.2 Providers | PASS, 35/35 |
| Automated Atlas access | NONE |
| JavaScript syntax | PASS, 169/169 |
| Active import/error codes | PASS |
| App import/no-listen | PASS |
| Loopback health | PASS |
| Raw webhook Buffer/order | PASS |
| Retired endpoint/browser storage | PASS, 0 matches |
| Production-like source secrets | PASS, 0 |
| Storefront TypeScript | PASS |
| Storefront lint | Existing 33 errors/35 warnings |
| Storefront edition builds | PASS, all three |
| Admin TypeScript | Existing 8 errors |
| Admin lint | Existing 99 errors/103 warnings |
| Admin edition builds | PASS, all three; types skipped |
| Permission to evaluate staging identity | GRANTED |
