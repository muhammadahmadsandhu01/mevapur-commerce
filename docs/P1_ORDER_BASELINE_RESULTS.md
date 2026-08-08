# P1 Order Baseline Results

Captured after the post-P0 recovery checkpoint passed and before any P1 Order source edit.

## Backend

### Authentication regression suite

Command:

```text
npm.cmd test -- --runInBand --watchAll=false
```

- Exit code: `0`
- Suites: 5 passed, 0 failed
- Tests: 23 passed, 0 failed
- Snapshots: 0
- P0 authentication baseline: preserved
- Database: loopback-only MongoDB Memory Server; no active Atlas connection
- Existing warnings: duplicate `slug` schema indexes in unrelated catalogue model loading

### JavaScript syntax

- Command: `node --check` across first-party JavaScript
- Files checked: 139
- Passed: 139
- Failed: 0

### Static relative-import scan

- Files scanned: 139
- Unresolved relative imports: 6
- Result: FAIL (pre-existing inactive/utility paths)

Unresolved paths:

- `middleware/securityHeaders.js` -> `../config/security.config`
- `middleware/rateLimiter.js` -> `../config/security.config`
- `middleware/rateLimiter.js` -> `../errors/AppError`
- `middleware/authorize.js` -> `../errors/AppError`
- `database/seeders/roleSeeder.js` -> `../../common/logger`
- `database/seeders/index.js` -> `../../common/logger`

### Existing Order tests

- Discovered first-party test files: 12
- Test files with `order` in the path/name: 0
- No Order model, service, route, idempotency, rollback, or concurrency baseline test exists.

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
- Problems: 77
- Errors: 38
- Warnings: 39

These are the existing post-P0 results. They are not suppressed.

### Build

Command:

```text
npm.cmd run build
```

- Sandboxed attempt: exit `1`, Google Fonts network access blocked
- Network-enabled retry: exit `0`
- Result: PASS
- Next.js: 16.2.10 with Turbopack
- TypeScript and 14-route generation completed

No source changed between build attempts.

## Admin Panel

### TypeScript

Command:

```text
npx.cmd tsc --noEmit --incremental false
```

- Exit code: `2`
- Result: FAIL
- Errors: 8
- Four content pages pass unsupported `defaultType`.
- `TopBar.tsx` references four missing icon identifiers.

These are the same eight unrelated errors recorded after P0.

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
- The existing unsupported Next.js `eslint` configuration warnings remain.

## Baseline Decision

| Gate | Result |
|---|---|
| P0 auth suites | PASS - 5/5 |
| P0 auth tests | PASS - 23/23 |
| Backend syntax | PASS - 139/139 |
| Static relative imports | FAIL - 6 pre-existing unresolved imports |
| Existing Order tests | NONE |
| Storefront TypeScript | PASS |
| Storefront lint | FAIL - 38 errors, 39 warnings |
| Storefront build | PASS after network access |
| Admin TypeScript | FAIL - 8 existing errors |
| Admin lint | FAIL - 101 errors, 104 warnings |
| Admin build | PASS, type validation skipped |
| Permission to map active Order flow | GRANTED |

