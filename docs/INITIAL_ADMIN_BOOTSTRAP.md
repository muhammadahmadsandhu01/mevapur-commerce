# One-time production Super Admin bootstrap

The public registration path always creates a `customer`. Staff creation is
protected by the existing `super_admin` authorization contract, so a fresh
production database must be initialized with the one-time bootstrap command
below. Do not use the role seeder or a manual MongoDB insert to create the
first privileged account.

The command creates one verified user with the exact active role string
`super_admin`. It uses the `User` model save hook (bcrypt cost 12) and the same
password validator as registration and password reset. Separate `Role`
documents are not required for this account: current authorization grants the
`super_admin` string full access before consulting Role definitions.

## Safety gates

The command fails closed unless all of these conditions hold:

- `NODE_ENV` and `APP_ENV` are exactly `production`;
- the MongoDB URI contains credentials and an explicit database name;
- the URI host list and database name exactly match independently supplied
  expected values;
- TLS is enabled, direct connections are refused, and the connected topology
  is the expected transaction-capable replica set with a writable primary;
- the exact confirmation phrase is present;
- the supplied name, email, and password satisfy the active registration and
  password policy;
- no Admin or Super Admin exists and the requested email is unused.

Creation and the non-secret bootstrap marker are committed in one majority
transaction. A retry with the same name and email is a verified no-op only
when the versioned marker still points to the active Super Admin created by
this command. Any other existing privileged account, customer email
collision, or inconsistent marker is refused. No environment value is written
to command output.

## Render one-time procedure

1. In the customer-owned Render backend service, verify that the active
   release is the reviewed production commit and that the service root is
   `backend`. Do not run this from a local workstation or a staging service.
2. Keep the service's existing production `MONGODB_URI`, `NODE_ENV`, and
   `APP_ENV`. In Render's secret environment settings, add these temporary
   variables with values obtained independently from the production database
   owner and password manager:

   - `INITIAL_ADMIN_NAME=<operator name>`
   - `INITIAL_ADMIN_EMAIL=<operator email>`
   - `INITIAL_ADMIN_PASSWORD=<new unique password>`
   - `INITIAL_ADMIN_EXPECTED_DATABASE=<exact database name from the approved URI>`
   - `INITIAL_ADMIN_EXPECTED_HOST=<exact URI host or comma-separated host list, without credentials>`
   - `INITIAL_ADMIN_EXPECTED_REPLICA_SET=<exact replica-set name confirmed by the database owner>`
   - `INITIAL_ADMIN_CONFIRMATION=CREATE INITIAL SUPER ADMIN IN PRODUCTION`

   Treat the password as a Render secret. Do not paste any value into a deploy
   command, shell history, ticket, chat, or log.
3. Save the environment update and wait until Render applies it to the selected
   production service. Open that service's one-time Shell and, from its
   configured `backend` root, run exactly:

   ```sh
   npm run bootstrap:initial-admin
   ```

4. A successful first run exits zero with `status: PASS` and outcome
   `CREATED`. `ALREADY_PROVISIONED` is also zero only for the marker-verified,
   exact retry described above. Any `FAIL` result exits with code 2; stop and
   investigate its safe error code. Do not bypass a refusal with a manual
   insert, role update, or modified command.
5. Sign in through the production Admin UI, verify the displayed identity and
   Super Admin authorization, and store the credential only in the approved
   password manager.
6. Immediately delete all seven `INITIAL_ADMIN_*` variables from the Render
   service, save the environment, and allow Render to apply the removal. Keep
   the normal production `MONGODB_URI`, `NODE_ENV`, and `APP_ENV`. Confirm the
   temporary variables are absent before closing the change record.

The bootstrap command is not part of startup, deploy, or the general `seed`
script. Never execute it automatically and never run it more than needed for
the initial account or the safe verification retry.
