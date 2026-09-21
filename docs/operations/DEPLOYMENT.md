# Operational Runbook: Production & VPS Deployment

## 1. Overview & Architecture

The MevaPur E-Commerce platform deploys as a set of isolated, independently scalable containers coordinated via Docker Compose or native container orchestrators.

### Container Topology & Port Allocations
| Service | Internal Port | Host / Gateway Exposure | Health Probe |
| :--- | :--- | :--- | :--- |
| `proxy` (Nginx 1.27.2-alpine) | `80`, `443` | `0.0.0.0:80`, `0.0.0.0:443` | TCP port binding |
| `frontend` (Storefront Next.js) | `3000` | Internal `frontend_net` only | `/healthz` |
| `admin-panel` (Admin Next.js) | `3001` | Internal `frontend_net` only | `/healthz` |
| `backend` (Express API) | `5000` | Internal `backend_net` only | `/health/ready` |
| `worker-outbox` | N/A | Worker daemon (no open ports) | Heartbeat file `/tmp/worker-heartbeat.json` |
| `worker-reconcile-sessions` | N/A | Worker daemon (no open ports) | Heartbeat file `/tmp/worker-heartbeat.json` |
| `mongodb` (Mongo 7.0.14-jammy) | `27017` | Internal `backend_net` only | `mongosh --eval 'db.adminCommand("ping")'` |
| `redis` (Redis 7.4.1-alpine3.20) | `6379` | Internal `backend_net` only | `redis-cli ping` |
| `prometheus` (v2.55.1) | `9090` | Internal `backend_net` only | `/-/healthy` |

---

## 2. Prerequisites & Preflight Checks

1. **Host OS**: Ubuntu 22.04 LTS / 24.04 LTS or compatible Linux kernel (>= 5.15).
2. **Docker Engine**: Docker Engine >= 26.0 and Docker Compose V2 (docker compose plugin >= 2.24).
3. **RAM & CPU Requirements**:
   - Minimum: 2 vCPU, 4GB RAM, 40GB SSD.
   - Recommended Production: 4 vCPU, 8GB RAM, 100GB NVMe SSD.
4. **DNS Records**:
   - `mevapur.com` (Storefront) -> VPS Public IPv4 / IPv6
   - `admin.mevapur.com` (Admin Panel) -> VPS Public IPv4 / IPv6
   - `api.mevapur.com` (API Gateway) -> VPS Public IPv4 / IPv6

---

## 3. Deployment Procedure

### Step 1: Clone Repository & Check Out Release Tag
```bash
git clone https://github.com/org/mevapur-commerce.git /opt/mevapur
cd /opt/mevapur
git checkout v1.0.0  # Or target release tag / commit
```

### Step 2: Initialize Runtime Configuration & Secrets
```bash
# Copy template
cp .env.example .env

# Generate high-entropy secrets and replica-set keyfile
mkdir -p secrets
openssl rand -base64 756 > secrets/mongo_keyfile
chmod 400 secrets/mongo_keyfile
chown 999:999 secrets/mongo_keyfile  # MongoDB container user uid

# Edit .env with verified domain names and database credentials
chmod 600 .env
```

### Step 3: Pull Pinned Images & Validate Compose Config
```bash
docker compose config --quiet
docker compose pull
```

### Step 4: Build Application Images
```bash
docker compose build --pull
```

### Step 5: Start Core Infrastructure (MongoDB Replica Set & Redis)
```bash
docker compose up -d mongodb redis
# Wait 10s for replica set election
sleep 10
docker compose up -d mongodb-init
```

### Step 6: Start Application Services, Workers, and Reverse Proxy
```bash
docker compose up -d backend worker-outbox worker-reconcile-sessions frontend admin-panel proxy
```

### Step 7: Verify Service Health & Readiness
```bash
# Verify all containers running and healthy
docker compose ps

# Test API readiness through reverse proxy
curl -fsS http://localhost/health/ready -H "Host: api.mevapur.com"
```

---

## 4. Maintenance & Zero-Downtime Rolling Update

To update application containers without downtime:
1. Build new container images: `docker compose build frontend backend admin-panel`
2. Update backend instances rolling: `docker compose up -d --no-deps backend`
3. Update worker instances: `docker compose up -d --no-deps worker-outbox worker-reconcile-sessions`
4. Update storefront and admin panels: `docker compose up -d --no-deps frontend admin-panel`
5. Verify health probes: `docker compose ps`
