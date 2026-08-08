# P0 Pre-Change Baseline Results

## Baseline Scope

Captured after the recovery gate passed and before any P0 authentication source edit.

- Project: `C:\Projects\mevaPur-Commerce`
- Branch: `main` (`ahead 1`)
- Dirty working tree: preserved
- Active database used by tests: no
- Dependency installation or upgrade: none

PowerShell initially blocked the `npm.ps1` and `npx.ps1` shims because script execution is disabled. The same installed tools were rerun through the Windows `npm.cmd` and `npx.cmd` shims. The policy failure and the successful shim commands are both part of this baseline.

## Backend

### `npm.cmd ls --depth=0`

- Exit code: `0`
- Result: PASS
- Direct dependencies resolved without an npm tree error.
- Installed versions include Express `4.22.2`, Mongoose `8.24.1`, Jest `30.4.2`, MongoDB Memory Server `9.5.0`, JSON Web Token `9.0.3`, and Zod `4.4.3`.

### `npx.cmd jest --listTests`

- Exit code: `0`
- Result: PASS
- Discovered five suites:
  - `tests/unit/services/token.service.test.js`
  - `tests/unit/services/auth.service.test.js`
  - `tests/integration/auth.integration.test.js`
  - `__tests__/auth.test.js`
  - `tests/e2e/auth.e2e.test.js`
- Warning: Jest forced exit because an asynchronous handle remained open.

### `node --check` across first-party backend JavaScript

- Files checked: `149`
- Passed: `149`
- Failed: `0`
- Result: PASS

Excluded dependency/generated directories included `node_modules`, `vendor`, `coverage`, `dist`, `build`, and `logs`.

### Test database safety inspection

- `tests/setup.js` defines MongoDB Memory Server setup.
- `jest.config.js` does not load `tests/setup.js`.
- Discovered test files do not call `mongoose.connect(process.env.MONGODB_URI)` or `connectDB`.
- The baseline test run did not connect to the active Atlas database.
- Integration/E2E tests instead attempted disconnected Mongoose operations, which buffered and timed out.

### `npm.cmd test -- --runInBand --watchAll=false`

- Exit code: `1`
- Result: FAIL
- Test suites: `5 failed`, `0 passed`, `5 total`
- Tests: `16 failed`, `5 passed`, `21 total`
- Snapshots: `0`
- Runtime: `37.246 s`

Primary failures:

- TokenService maps mocked expired and invalid JWT errors to the generic “Token verification failed” path.
- AuthService unit mocks do not match production repository imports/contracts.
- `UserRepository.findByEmailWithPassword` is missing.
- Jest setup is not loaded; `createTestUser` is undefined.
- Integration and E2E registration operations buffer against disconnected Mongoose and time out.
- `/api/v1/auth/refresh` is not mounted and returns `404`.
- `/api/v1/auth/me` rejects the test token with `401`.
- `/api/auth/register` tests time out or receive the wrong response shape.
- AuditLog writes fail schema validation because `eventId` and `eventName` are required.
- Duplicate Mongoose index warnings exist for `requestId` and two `slug` indexes.
- Jest reports asynchronous work after environment teardown.

No baseline test was changed or weakened.

## Storefront

### `npm.cmd ls --depth=0`

- Exit code: `0`
- Result: PASS
- Direct dependencies resolved without an npm tree error.
- Installed versions include Next.js `16.2.10`, React `19.2.4`, TypeScript `5.9.3`, Axios `1.18.1`, and Zustand `5.0.14`.

### `npx.cmd tsc --noEmit --incremental false`

- Exit code: `0`
- Result: PASS

### `npm.cmd run lint`

- Exit code: `1`
- Result: FAIL
- Problems: `84`
- Errors: `42`
- Warnings: `42`

Auth-scope findings include explicit `any` types and unused response values in `src/store/authStore.ts`. Most lint failures are pre-existing and outside P0 authentication scope.

### `npm.cmd run build`

First sandboxed attempt:

- Exit code: `1`
- Result: environmental failure
- Cause: restricted network prevented Next.js from fetching the Inter font from Google Fonts.

Network-enabled retry of the same build:

- Exit code: `0`
- Result: PASS
- Next.js: `16.2.10` with Turbopack
- Compiled successfully.
- TypeScript completed.
- Static generation completed for 14 routes.

No source or dependency was changed between attempts.

## Admin Panel

### `npm.cmd ls --depth=0`

- Exit code: `0`
- Result: PASS
- Direct dependencies resolved without an npm tree error.
- Installed versions include Next.js `16.2.10`, React `19.2.4`, TypeScript `5.9.3`, Axios `1.18.1`, and Zustand `5.0.14`.

### `npx.cmd tsc --noEmit --incremental false`

- Exit code: `2`
- Result: FAIL
- TypeScript errors: `8`

Errors:

- Four content pages pass an unsupported `defaultType` property.
- `TopBar.tsx` references missing `Package`, `ShoppingCart`, `Users`, and `Percent` identifiers.

### `npm.cmd run lint`

- Exit code: `1`
- Result: FAIL
- Problems: `209`
- Errors: `102`
- Warnings: `107`

Auth-scope findings include an explicit `any` in `src/store/authStore.ts` and multiple explicit `any` declarations in `src/lib/api.ts`. Most lint failures are pre-existing and outside P0 authentication scope.

### `npm.cmd run build`

- Exit code: `0`
- Result: PASS WITH MATERIAL CAVEAT
- Next.js: `16.2.10` with Turbopack
- Compiled and generated 25 routes.
- Build output explicitly states: `Skipping validation of types`.
- Warnings:
  - `eslint` configuration in `next.config.ts` is no longer supported.
  - `eslint` is an unrecognized Next.js configuration key.

The successful build does not override the failed standalone type-check or lint results.

## Baseline Verdict

| Gate | Result |
|---|---|
| Backend dependency tree | PASS |
| Backend test discovery | PASS |
| Backend JavaScript syntax | PASS — 149/149 |
| Backend tests | FAIL — 5 suites; 5/21 tests passed |
| Storefront dependency tree | PASS |
| Storefront type-check | PASS |
| Storefront lint | FAIL — 42 errors, 42 warnings |
| Storefront build | PASS after network access |
| Admin dependency tree | PASS |
| Admin type-check | FAIL — 8 errors |
| Admin lint | FAIL — 102 errors, 107 warnings |
| Admin build | PASS, but type validation is skipped |

This baseline is evidence, not an acceptance result. Authentication stabilisation must improve auth-scoped failures without hiding unrelated pre-existing failures.
