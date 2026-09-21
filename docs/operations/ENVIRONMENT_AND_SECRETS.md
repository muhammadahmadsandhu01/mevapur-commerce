# Operational Runbook: Environment Configuration & Secret Governance

## 1. Principles of Secret Governance

1. **No Committed Secrets**: No passwords, API keys, private keys, or tokens may exist in Git history, Docker images, or logs.
2. **File-Based Secrets**: Production containers mount secrets via read-only volume mounts (`/run/secrets/*`) or `_FILE` environment variable loading.
3. **Principle of Least Privilege**:
   - Application containers only receive least-privileged user database credentials (`readWrite` role).
   - Replica set keyfiles (`mongo_keyfile`) have permissions `0400` owned by uid `999`.
   - Admin and root database credentials are used solely during automated initialization.
4. **Sanitized `.env.example`**: Committed template files must contain only descriptive dummy values and placeholders.

---

## 2. Environment Variable Matrix

| Variable | Description | Required In | Sensitivity |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | Application environment (`production`, `staging`, `development`) | All | Public |
| `PORT` | API listen port (default `5000`) | Backend | Public |
| `STOREFRONT_HOST` | Primary storefront domain name | Nginx, Frontend | Public |
| `ADMIN_HOST` | Admin panel domain name | Nginx, Admin | Public |
| `API_HOST` | Backend API gateway domain name | Nginx, Backend | Public |
| `MONGODB_URI` | Application database connection string | Backend, Workers | Confidential (Secret) |
| `MONGODB_ROOT_PASSWORD` | MongoDB root initialization password | Init Container | High Secret |
| `REDIS_URI` | Redis connection URI (`redis://:password@host:port`) | Backend, Workers | Confidential (Secret) |
| `REDIS_PASSWORD` | Redis authentication password | Redis Container | High Secret |
| `JWT_SECRET` | 256-bit cryptographically secure signing key (min 32 chars) | Backend, Admin | High Secret |
| `STRIPE_SECRET_KEY` | Stripe gateway private API key | Backend | High Secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook raw signature verification key | Backend | High Secret |
| `EASYPAISA_SECRET_KEY` | Easypaisa HMAC signature secret | Backend | High Secret |
| `JAZZCASH_PASSWORD` | JazzCash merchant password | Backend | High Secret |
| `JAZZCASH_SALT` | JazzCash integrity salt | Backend | High Secret |

---

## 3. Secret Generation & Rotation Procedure

### Generating Cryptographic Secrets
```bash
# JWT Secret
openssl rand -base64 48

# MongoDB Root & App Passwords
openssl rand -hex 24

# Redis Password
openssl rand -hex 24

# MongoDB Replica Set Keyfile
openssl rand -base64 756 > secrets/mongo_keyfile
chmod 400 secrets/mongo_keyfile
```

### Rotating JWT Signing Keys
1. Issue new secondary secret key into configuration without removing existing key.
2. Update backend services to sign new tokens with new key while still validating existing active sessions.
3. After token TTL expires (e.g. 7 days), deprecate and remove previous signing key.

### Rotating Database Credentials
1. Using the database root user, create a new application user `mevapur_app_v2` with `readWrite` role.
2. Update backend container environment variable `MONGODB_URI` to use `mevapur_app_v2`.
3. Perform a rolling restart of backend and worker containers (`docker compose up -d --no-deps backend worker-outbox worker-reconcile-sessions`).
4. Verify `/health/ready` returns status `ready`.
5. Drop legacy user `mevapur_app_v1` using admin connection.
