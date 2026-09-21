# Operational Runbook: Incident Response & Emergency Procedures

## 1. Incident Severity Levels

| Level | Definition | Response SLA | Examples |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Entire storefront/API unavailable; payment processing down; data loss | < 15 minutes | All API instances failing healthchecks; MongoDB replica set down |
| **SEV-2 (High)** | Major feature degraded; rate limiting blocking legitimate users; background workers halted | < 1 hour | Outbox worker stuck; Redis connection failure causing fail-closed |
| **SEV-3 (Moderate)** | Non-critical feature degraded; admin panel latency | < 4 hours | Slow category search; non-blocking image upload delay |
| **SEV-4 (Low)** | Minor cosmetic issue; single non-critical alert blip | Next business day | Log format warning; transient scrape timeout |

---

## 2. Emergency Triage Playbooks

### Playbook 1: API Failing Readiness Checks (`503 Service Unavailable`)
1. Check readiness payload: `curl http://localhost:5000/health/ready`
2. Identify failing check (`database`, `redis`, or `runtime`):
   - If `database`: Check MongoDB container status: `docker compose ps mongodb`, check logs `docker compose logs --tail=50 mongodb`.
   - If `redis`: Check Redis container status: `docker compose ps redis`, verify connection `redis-cli ping`.
3. Restart dependencies if stalled: `docker compose restart mongodb redis backend`.

### Playbook 2: Distributed Rate Limiting Blocking Valid Requests
1. Check if Redis is saturated or connection dropped.
2. If Redis is down, auth endpoints will fail-closed for security. Restore Redis connection immediately:
   `docker compose restart redis`
3. Inspect rate limit counters in Redis:
   `docker compose exec redis redis-cli --scan --pattern "rl:*"`

### Playbook 3: Background Outbox Worker Starvation
1. Check worker logs: `docker compose logs --tail=100 worker-outbox`
2. Check heartbeat timestamp: `docker compose exec worker-outbox cat /tmp/worker-heartbeat.json`
3. Check MongoDB transactional outbox collection for stuck items:
   ```javascript
   db.outboxevents.find({ status: "processing" }).sort({ updatedAt: -1 })
   ```
4. If items are stuck in `processing` due to previous worker crash, reset them to `pending`:
   ```javascript
   db.outboxevents.updateMany(
     { status: "processing", updatedAt: { $lt: new Date(Date.now() - 300000) } },
     { $set: { status: "pending" } }
   )
   ```
5. Restart worker container: `docker compose restart worker-outbox`
