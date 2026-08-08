# P5B Filesystem and Upload Policy

## Decision

P5B found no active first-party upload writer and therefore did not invent one.
The existing `/uploads` mount is a legacy read-only surface controlled by
`LOCAL_UPLOADS_MODE`.

| Mode | `/uploads` behavior | Local directory creation | Local writes |
|---|---|---|---|
| `disabled` | Not mounted; requests fall through to 404 | Never | Rejected by absence of a writer |
| `read-only` | Existing files may be served statically | Never | Rejected by absence of a writer |

Allowed values are exactly `disabled` and `read-only`. Test, staging, and
production default to `disabled`. Development may default to `read-only` for
legacy compatibility. An invalid value fails runtime configuration validation.

## Evidence

- `backend/app.js` conditionally mounts static serving only in `read-only`
  mode.
- `backend/config/runtime.config.js` validates the two supported values.
- No active `multer` dependency, upload middleware, or first-party upload
  writer was found.
- The repository has no required `backend/uploads` directory.
- P5B contract tests verify that disabled mode returns 404 and does not create
  the directory.

## Other local filesystem behavior

- Reports are streamed to the HTTP response; no local report artifact writer
  was found.
- Canonical application logs use stdout/stderr in deployed modes. File logging
  is development-only by default and can be enabled explicitly with
  `LOG_FILE_ENABLED=true`.
- Deployed startup does not require creation of a log or upload directory.
- Test-only MongoDB binaries and temporary state may use the operating-system
  temporary directory; this is not a deployed application persistence
  contract.
- Existing local files and log artifacts were not deleted or altered by this
  policy.

## Fail-closed deployment posture

For a future deployment, set `LOCAL_UPLOADS_MODE=disabled` unless an owner has
explicitly approved a durable storage design. Ephemeral container or server
filesystems must not be treated as durable customer storage.

Before an upload writer can be activated, a separate approved milestone must
define:

1. durable storage ownership and retention;
2. content-type, size, filename, and malware controls;
3. tenant/user authorization and object ownership;
4. private/public access policy and signed delivery;
5. encryption, backup, deletion, and privacy handling;
6. failure, retry, and orphan-cleanup behavior; and
7. integration and security tests.

No cloud/object-storage provider, bucket, credential, or platform-specific path
was selected or added in P5B.

