# Legacy Provider Secret Cleanup

Provider credentials are runtime environment configuration. The application no
longer reads or writes the legacy provider-secret fields in `Setting` documents.
This cleanup is a separate operator action and must not be coupled to application
startup or deployment.

Run commands from `backend/`. The default command is read-only and reports only
the matching document count and the legacy field names:

```powershell
node scripts/cleanup/remove-legacy-provider-secrets.js
```

After a separately verified database backup, apply the exact `$unset` cleanup by
supplying both required acknowledgments:

```powershell
node scripts/cleanup/remove-legacy-provider-secrets.js --apply --confirm-remove-provider-secrets --backup-acknowledged
```

The cleanup targets only:

- `payment.jazzcash_password`
- `payment.visa_api_key`
- `payment.visa_secret_key`
- `payment.mastercard_api_key`
- `payment.mastercard_secret_key`

It does not print field values, connection details, or database identifiers. It
does not modify non-secret settings. Operators must supply the approved database
configuration through the existing backend runtime environment; credentials must
never be embedded in the command.
