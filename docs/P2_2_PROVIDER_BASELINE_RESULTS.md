# P2.2 Provider Baseline Results

Captured after the post-P2 recovery checkpoint passed and before any P2.2
provider-architecture source edit.

## Backend

### Complete regression

Command:

```text
npm.cmd test -- --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 14 passed, 0 failed
- Tests: 102 passed, 0 failed
- Snapshots: 0
- Database: loopback-only MongoDB Memory Server replica set
- Atlas: inherited `MONGODB_URI` rejected by test bootstrap
- Existing warnings: duplicate unrelated catalogue `slug` indexes

Expected negative integration cases emitted sanitized 4xx/5xx request logs;
these were asserted cases, not suite failures.

### Focused P0 Authentication

Command:

```text
npx.cmd jest __tests__/auth.test.js tests/unit/services/auth.service.test.js tests/unit/services/token.service.test.js tests/integration/auth.integration.test.js tests/e2e/auth.e2e.test.js --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 5/5 passed
- Tests: 23/23 passed

### Focused P1 Order

Command:

```text
npx.cmd jest tests/unit/models/order.model.test.js tests/unit/validators/order.validator.test.js tests/unit/services/order.service.test.js tests/integration/order.integration.test.js tests/unit/contracts/checkout-order.contract.test.js --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 5/5 passed
- Tests: 49/49 passed

### Focused P2 Payment

Command:

```text
npx.cmd jest tests/unit/contracts/checkout-payment.contract.test.js tests/unit/models/payment.model.test.js tests/unit/services/stripe.provider.test.js tests/integration/payment.integration.test.js --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 4/4 passed
- Tests: 30/30 passed

### JavaScript syntax

- Command: `node --check` across first-party backend JavaScript
- Files checked: 154
- Passed: 154
- Failed: 0

### Static relative-import scan

- Files scanned: 154
- Unresolved relative imports: 6
- Result: existing legacy/inactive debt; no P0/P1/P2 import is unresolved

Unresolved paths:

- `backend/database/seeders/index.js` -> `../../common/logger`
- `backend/database/seeders/roleSeeder.js` -> `../../common/logger`
- `backend/middleware/authorize.js` -> `../errors/AppError`
- `backend/middleware/rateLimiter.js` -> `../config/security.config`
- `backend/middleware/rateLimiter.js` -> `../errors/AppError`
- `backend/middleware/securityHeaders.js` -> `../config/security.config`

### Static error-code scan

- Referenced `ERROR_CODES.*`: 35
- Unresolved references: 0
- Result: PASS

### Application and routing smokes

| Check | Result |
|---|---|
| `app.js` export | Express function |
| Listening handles opened by import | 0 |
| Loopback `GET /api/health` | HTTP 200 |
| Health message | `MevaPur API is running` |
| Raw Stripe webhook request | HTTP 200 |
| Webhook body received by service | Buffer |
| Webhook mount before `express.json()` | PASS |
| Retired active payment endpoint matches | 0 |
| Active browser payment storage matches | 0 |

No provider network call or Atlas operation occurred in these smokes.

## Storefront

### TypeScript

Command:

```text
npx.cmd tsc --noEmit --incremental false
```

- Exit code: `0`
- Result: PASS

### Lint

Command:

```text
npm.cmd run lint
```

- Exit code: `1`
- Problems: 68
- Errors: 33
- Warnings: 35
- Result: existing repository-wide debt; no rule was disabled

### Build

Command:

```text
npm.cmd run build
```

- Sandboxed attempt: exit `1`; Google Fonts network access unavailable
- Network-enabled retry: exit `0`
- Next.js: 16.2.10 with Turbopack
- TypeScript: completed
- Routes generated: 15
- Result: PASS
- Source changes between attempts: none

## Admin Panel

### TypeScript

Command:

```text
npx.cmd tsc --noEmit --incremental false
```

- Exit code: `1`
- Errors: 8
- Four content pages pass unsupported `defaultType`.
- `TopBar.tsx` references missing `Package`, `ShoppingCart`, `Users`, and
  `Percent` identifiers.
- Result: same pre-existing unrelated debt

### Lint

Command:

```text
npm.cmd run lint
```

- Exit code: `1`
- Problems: 202
- Errors: 99
- Warnings: 103
- Result: existing repository-wide debt; no rule was disabled

### Build

Command:

```text
npm.cmd run build
```

- Exit code: `0`
- Routes generated: 25
- Result: PASS WITH CAVEAT
- Build explicitly skipped type validation.
- Unsupported Next.js `eslint` configuration warnings remain.

## Safety Verification

- Actual runtime environment files remain untracked/ignored.
- No test accessed Atlas.
- No Atlas data or index was mutated.
- No live provider transaction was attempted.
- Raw Stripe webhook remains before `express.json()`.
- Browser payment/token secrets are not persisted by active Payment files.
- No project file was deleted, moved, or renamed during baseline capture.

## Baseline Decision

| Gate | Result |
|---|---|
| Complete backend | PASS, 14/14 suites and 102/102 tests |
| P0 Auth | PASS, 23/23 |
| P1 Order | PASS, 49/49 |
| P2 Payment | PASS, 30/30 |
| No test uses Atlas | PASS |
| JavaScript syntax | PASS, 154/154 |
| Relative imports | 6 unchanged legacy/inactive failures |
| Error codes | PASS, 0 unresolved |
| App import/no-listen | PASS |
| Loopback health | PASS |
| Raw webhook Buffer/order | PASS |
| Retired endpoints | PASS, 0 |
| Browser Payment storage | PASS, 0 |
| Storefront TypeScript | PASS |
| Storefront lint | Existing 33 errors/35 warnings |
| Storefront build | PASS |
| Admin TypeScript | Existing 8 unrelated errors |
| Admin lint | Existing 99 errors/103 warnings |
| Admin build | PASS; type validation skipped |
| Permission to map and implement P2.2 | GRANTED |
