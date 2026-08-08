# P0 Authentication Contract Map

Captured: 2026-07-27  
Scope: P0 Authentication Stabilisation only

## Safety boundary

- The recovery gate is PASSED and the isolated restore database is absent.
- The pre-change baseline is recorded in `docs/P0_BASELINE_RESULTS.md`.
- The existing dirty working tree is the preservation baseline.
- Order, Payment, Refund, Return, Inventory, Product, Coupon, Notification, and other business logic are outside this change.
- `backend/app.js` must continue to mount `paymentRoutes.webhookRouter` before `express.json()`.
- No test may use the active Atlas database.

## Active runtime and route chain

```text
backend/server.js
  -> imports backend/app.js
  -> backend/app.js mounts /api/v1/auth and compatibility alias /api/auth
  -> backend/routes/authRoutes.js
  -> backend/controllers/authController.js
  -> backend/services/AuthService.js
  -> UserRepository / SessionService / TokenService / AuditService
  -> User / Session / AuditLog models
```

`backend/app.js` is the compositional entry point and does not open a port.
`backend/server.js` owns database connection and `listen()`.

## Pre-change breakpoints

| Boundary | Implemented before P0 | Required P0 contract |
|---|---|---|
| Routes | Register, login, forgot, reset, and `me` only | Add refresh, logout, logout-all, change-password, session list, and owned session revocation |
| Controller to service | Object arguments call positional service methods; login expects a different return shape | One object contract per service method |
| Login JSON | Controller reads `token`; fallback can return refresh token | `data.accessToken`; refresh token never appears in JSON |
| Browser storage | Storefront and admin Zustand persistence retains access tokens | Access token and user auth state remain in memory only |
| Refresh transport | Cookie or request body | HttpOnly refresh cookie only |
| Refresh persistence | Incomplete hash update and incompatible session shape | SHA-256 refresh-token hash in Session; never store raw refresh token |
| Refresh verification | Calls missing/incompatible service methods | Signed refresh token, active session, current hash, user, and token family validation |
| Access verification | JWT signature and user lookup only | Token type, issuer, audience, session, user status, and `tokenVersion` validation |
| Logout | Calls a missing method; only client state is cleared | Revoke current session and clear refresh/CSRF cookies |
| Logout-all | Not actively routed | Revoke every active session and increment `tokenVersion` |
| CSRF | Existing middleware imports unavailable configuration and is not mounted | Signed double-submit token on cookie-auth state changes |
| Cookies | No active cookie parser; access-token cookie is set | Parse only required cookies; refresh cookie HttpOnly; no access-token cookie |
| Errors | Missing codes and mixed response shapes | Stable authentication codes through the central error handler |
| Password reset | Repository/model method and field mismatches | Store only reset-token hash; password assignment must pass through the User save hook |
| Audit | Audit service/model names and event enums disagree | Aligned event names, request ID, session relationship, and redacted metadata |

## Canonical API contract

Both `/api/v1/auth` and the temporary `/api/auth` compatibility alias expose the
same contract.

| Method | Path | Authentication | CSRF | Success data |
|---|---|---|---|---|
| POST | `/register` | Public | No | `user`, `accessToken` |
| POST | `/login` | Public | No | `user`, `accessToken` |
| POST | `/refresh` | Refresh cookie | Yes | `user`, `accessToken` |
| GET | `/me` | Bearer access token | No | `user` |
| POST | `/logout` | Bearer access token | Yes | No tokens |
| POST | `/logout-all` | Bearer access token | Yes | Revoked-session count |
| GET | `/sessions` | Bearer access token | No | Safe session metadata |
| DELETE | `/sessions/:sessionId` | Bearer access token | Yes | Revocation result |
| POST | `/forgot-password` | Public | No | Generic acknowledgement |
| POST | `/reset-password` | Public reset token | No | Generic acknowledgement |
| POST | `/change-password` | Bearer access token | Yes | No tokens |

## Token and session contract

### Access token

- Returned only as `data.accessToken`.
- Stored only in the running browser process.
- Sent only as `Authorization: Bearer <token>`.
- Contains `sub`, `sid`, `tokenVersion`, `type=access`, `iss`, `aud`, `iat`,
  `exp`, and `jti`.
- Rejected when the session is inactive, the user is inactive/blocked, or the
  current database `tokenVersion` differs.

### Refresh token

- Set only as the configured HttpOnly cookie.
- Never returned in JSON, logs, audit metadata, localStorage, or sessionStorage.
- The Session stores only its SHA-256 hash.
- Rotation atomically replaces the current hash.
- Reuse of a valid older token revokes the token family and is audited.

### Browser bootstrap

```text
page load
  -> POST /auth/refresh with credentials and CSRF header
  -> server validates HttpOnly cookie and rotates it
  -> client stores returned accessToken in memory
  -> GET /auth/me with Bearer access token when identity confirmation is needed
```

The frontend and admin API clients use one in-flight refresh request so
concurrent 401 responses do not trigger parallel rotations.

## Validation and error envelope

All auth inputs pass through the canonical Zod validation middleware. The
central error envelope is:

```json
{
  "success": false,
  "error": {
    "code": "AUTH_*",
    "message": "Safe client-facing message"
  },
  "meta": {
    "requestId": "opaque request identifier"
  }
}
```

Expected authentication codes include:

- `AUTH_VALIDATION_FAILED`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_EMAIL_EXISTS`
- `AUTH_TOKEN_REQUIRED`
- `AUTH_TOKEN_INVALID`
- `AUTH_TOKEN_EXPIRED`
- `AUTH_TOKEN_REUSE_DETECTED`
- `AUTH_SESSION_NOT_FOUND`
- `AUTH_SESSION_EXPIRED`
- `AUTH_SESSION_REVOKED`
- `AUTH_TOKEN_VERSION_MISMATCH`
- `AUTH_CSRF_INVALID`
- `AUTH_ACCOUNT_INACTIVE`
- `AUTH_ACCOUNT_BLOCKED`
- `AUTH_FORBIDDEN`
- `AUTH_RESET_TOKEN_INVALID`

## Verification obligations

- Auth unit and integration tests use an isolated in-memory MongoDB only.
- Tests fail closed if an active database URI is detected.
- Rotation, reuse detection, session revocation, logout-all, tokenVersion
  mismatch, password-reset hashing, cookie flags, and JSON token leakage are
  explicitly tested.
- `backend/app.js` imports without connecting to MongoDB or opening a port.
- The raw payment webhook mount remains before JSON parsing.
- Storefront and admin source contain no authentication token persistence in
  localStorage or sessionStorage.
