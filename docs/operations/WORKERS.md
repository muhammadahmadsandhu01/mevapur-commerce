# Operational Runbook: Background Worker Daemons

## 1. Background Worker Architecture

The platform runs decoupled background worker processes independently from the synchronous Express API:

| Worker | Image Entrypoint | Primary Responsibility | Failure Recovery |
| :--- | :--- | :--- | :--- |
| `worker-outbox` | `scripts/workers/processTransactionalOutbox.js` | Dispatches transactional events, customer notifications, and webhooks | Exponential backoff, retry limit (max 5), dead-letter queue |
| `worker-reconcile-sessions` | `scripts/workers/reconcileExpiredCheckoutSessions.js` | Reconciles and expires abandoned checkout stock holds | Periodic polling (every 60s), atomic state transitions |

---

## 2. Heartbeat Monitoring & Read-Only Root Filesystem

Worker containers run with read-only root filesystems (`read_only: true` in production Compose) and unprivileged user `node`.

### Writable Tmpfs Heartbeat Mount
To record liveness without disk corruption or container writes:
- A writable tmpfs volume is mounted at `/tmp:rw,noexec,nosuid,size=32m`.
- The worker writes heartbeat timestamps to `/tmp/worker-heartbeat.json`:
  ```json
  {
    "worker": "transactional-outbox-worker",
    "pid": 1,
    "timestamp": "2026-09-21T12:00:00.000Z",
    "lastCycleMs": 1790000000000
  }
  ```
- Docker healthcheck executes `node scripts/ops/worker-healthcheck.js --maxAgeSec=120`, verifying the heartbeat age is less than 120 seconds. If a worker process hangs or starves, Docker automatically restarts the container.

---

## 3. Worker Scaling & Operational Commands

### Viewing Worker Logs
```bash
docker compose logs -f --tail=100 worker-outbox
docker compose logs -f --tail=100 worker-reconcile-sessions
```

### Restarting Workers
```bash
docker compose restart worker-outbox worker-reconcile-sessions
```

### Scaling Worker Instances
Outbox and reconciliation workers use database-level optimistic locking and atomic status updates (`pending` -> `processing`), allowing multiple worker replicas to run concurrently without duplicate message dispatch.
```bash
docker compose up -d --scale worker-outbox=2
```
