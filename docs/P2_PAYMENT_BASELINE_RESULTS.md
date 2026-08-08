# P2 Payment Baseline Results

Captured after the post-P1 recovery checkpoint passed and before any P2 Payment source edit.

## Backend

### Full P0/P1 regression

Command:

```text
npm.cmd test -- --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 10 passed, 0 failed
- Tests: 72 passed, 0 failed
- Snapshots: 0
- Database: loopback-only MongoDB Memory Server replica set
- Active Atlas access: rejected by test bootstrap; no test used Atlas
- Existing warnings: duplicate `slug` schema indexes in unrelated catalogue model loading

### Focused P0 authentication regression

Command:

```text
npx.cmd jest __tests__/auth.test.js tests/unit/services/auth.service.test.js tests/unit/services/token.service.test.js tests/integration/auth.integration.test.js tests/e2e/auth.e2e.test.js --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 5 passed, 0 failed
- Tests: 23 passed, 0 failed

### Focused P1 Order/checkout regression

Command:

```text
npx.cmd jest tests/unit/models/order.model.test.js tests/unit/validators/order.validator.test.js tests/unit/services/order.service.test.js tests/integration/order.integration.test.js tests/unit/contracts/checkout-order.contract.test.js --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 5 passed, 0 failed
- Tests: 49 passed, 0 failed

### Test discovery

Command:

```text
npx.cmd jest --listTests --runInBand
```

- Exit code: `0`
- Discovered suites: 10
- Payment/refund-named suites: 0
- Existing direct Payment model/provider/service/webhook/refund test coverage: none

### JavaScript syntax

- Command: `node --check` across first-party backend JavaScript
- Files checked: 145
- Passed: 145
- Failed: 0

### Static relative-import scan

- Files scanned: 145
- Unresolved relative imports: 6
- Result: FAIL (pre-existing inactive/utility paths)

Unresolved paths:

- `database/seeders/index.js` -> `../../common/logger`
- `database/seeders/roleSeeder.js` -> `../../common/logger`
- `middleware/authorize.js` -> `../errors/AppError`
- `middleware/rateLimiter.js` -> `../config/security.config`
- `middleware/rateLimiter.js` -> `../errors/AppError`
- `middleware/securityHeaders.js` -> `../config/security.config`

### Static error-code scan

- Defined codes: 45
- Referenced codes: 35
- Unresolved `ERROR_CODES.*` references: 0
- Result: PASS

### Application import/no-listen smoke

- Command: isolated `app.js` import with `NODE_ENV=test`
- Exit code: `0`
- Export type: function
- Listening server handles opened by import: 0
- Result: PASS

### Raw webhook route/order/Buffer smoke

- Command: loopback Supertest request with `PaymentService.handleWebhook` stubbed before importing the app
- Exit code: `0`
- HTTP status: 200
- Controller/service received a `Buffer`: yes
- `/api/payments/webhook` mount precedes `express.json()`: yes
- Provider/network/database mutation: none
- Result: PASS

### Test database guard

`backend/tests/globalSetup.js` rejects an inherited `MONGODB_URI`, creates a MongoDB Memory Server replica set, and validates a `mongodb://127.0.0.1` or `mongodb://localhost` URI. `backend/tests/setup.js` repeats the inherited-URI and loopback checks. No test accessed Atlas.

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
- Result: FAIL
- Problems: 68
- Errors: 33
- Warnings: 35

This is the existing post-P1 repository-wide lint result. No rule or assertion was suppressed.

### Build

Command:

```text
npm.cmd run build
```

- Sandboxed attempt: exit `1`; configured Google Font could not be fetched
- Network-enabled retry: exit `0`
- Result: PASS
- Next.js: 16.2.10 with Turbopack
- TypeScript: completed
- Generated routes: 14
- Source changes between attempts: none

### Retired payment endpoint scan

- Retired frontend payment endpoint calls: 0
- Result: PASS

## Admin Panel

### TypeScript

Command:

```text
npx.cmd tsc --noEmit --incremental false
```

- Exit code: `1`
- Result: FAIL
- Errors: 8
- Four content pages pass unsupported `defaultType`.
- `TopBar.tsx` references four missing icon identifiers.

These are the same eight unrelated errors recorded after P0 and P1.

### Lint

Command:

```text
npm.cmd run lint
```

- Exit code: `1`
- Result: FAIL
- Problems: 205
- Errors: 101
- Warnings: 104

### Build

Command:

```text
npm.cmd run build
```

- Exit code: `0`
- Result: PASS WITH CAVEAT
- Generated routes: 25
- The build explicitly skipped validation of types.
- Unsupported Next.js `eslint` configuration warnings remain.

## Baseline Decision

| Gate | Result |
|---|---|
| Full backend regression | PASS - 10/10 suites, 72/72 tests |
| P0 authentication regression | PASS - 5/5 suites, 23/23 tests |
| P1 Order regression | PASS - 5/5 suites, 49/49 tests |
| No test uses Atlas | PASS |
| Backend JavaScript syntax | PASS - 145/145 |
| Static relative imports | FAIL - 6 pre-existing unresolved imports |
| Static error codes | PASS - 0 unresolved |
| `app.js` imports without listening | PASS |
| Raw webhook remains Buffer and precedes JSON | PASS |
| Existing Payment/refund tests | NONE |
| Retired frontend payment endpoints | PASS - 0 |
| Storefront TypeScript | PASS |
| Storefront lint | FAIL - 33 errors, 35 warnings |
| Storefront build | PASS after network access |
| Admin TypeScript | FAIL - 8 existing unrelated errors |
| Admin lint | FAIL - 101 errors, 104 warnings |
| Admin build | PASS; type validation skipped |
| Permission to map active Payment flow | GRANTED |
