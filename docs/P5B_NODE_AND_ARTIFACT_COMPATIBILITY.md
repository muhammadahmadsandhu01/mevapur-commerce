# P5B Node and Artifact Compatibility

## Decision boundary

P5B records evidence only. It does not select or pin a deployment Node version,
hosting platform, container image, process manager, or artifact strategy.

## Verified evidence

| Component | Package/runtime evidence | Commands | Artifact evidence |
|---|---|---|---|
| Backend | The first-party package has no `engines` declaration. Local verification used Node `v24.18.0` and npm `11.16.0`. | `npm test`, `node server.js` | Source-run Express application; `app.js` is listener-free and `server.js` owns startup |
| Storefront | Next `16.2.10`; installed Next package requires Node `>=20.9.0`. The first-party package has no deployment Node pin. | `next build`, `next start` | Canonical `next.config.js` does not select standalone output |
| Admin panel | Next `16.2.10`; installed Next package requires Node `>=20.9.0`. The first-party package has no deployment Node pin. | `next build`, `next start` | Current Next configuration selects standalone output, but final launch/packaging remains an owner/platform decision |

The local Node/npm versions show that the verified source and tests work in the
current workstation environment. They are not a production support promise and
must not be copied into a platform manifest without owner approval.

## Canonical configuration evidence

- Installed Next configuration discovery checks `next.config.js` before
  `next.config.ts`.
- Storefront `next.config.js` is therefore canonical.
- Storefront `next.config.ts` delegates to that canonical configuration and no
  longer carries a competing artifact/configuration policy.
- Admin retains its existing configuration behavior.
- No Dockerfile, platform manifest, package file, or lock file was changed.

## Owner decisions still required

The owner/platform review must select:

- supported Node major/minor and update policy;
- package installation command and lockfile policy;
- source-run versus standalone artifact per component;
- build host versus runtime host separation;
- artifact contents, immutable identifier, and retention;
- process ownership, replica behavior, signal delivery, and time limits; and
- rollback artifact and compatibility window.

## Acceptance tests after selection

Run these on the exact selected runtime and packaged artifact, without weakening
checks:

1. clean lockfile install using the approved package-manager command;
2. complete backend suite and P0/P1/P2/P2.2/P4/P5B focused suites;
3. all first-party backend JavaScript syntax and import checks;
4. storefront and admin TypeScript plus ESLint with zero errors;
5. Pakistan, international, and full builds for both Next applications;
6. start the exact packaged backend artifact and verify `/api/health` and
   `/api/ready`;
7. start each exact packaged browser artifact and verify `/healthz`;
8. send SIGTERM and confirm bounded HTTP-then-database shutdown;
9. verify writable-path assumptions and stdout/stderr capture on the selected
   platform;
10. perform the separate approved staging database marker identity gate before
    traffic; and
11. verify rollback by starting the previous immutable artifact.

No deployment or artifact publication was performed in P5B.

