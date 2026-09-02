# Production Observability & Monitoring Runbook

**Version**: 1.0.0  
**Target**: DevOps, SRE & Platform Engineering Teams

---

## 1. Health & Probe Endpoints

The API server exposes standard Kubernetes/load-balancer probe endpoints:

| Endpoint | Method | Purpose | Healthy Response | Failure Response |
| :--- | :--- | :--- | :--- | :--- |
| `/ready` | `GET` | Readiness Probe | `200 OK` (`{ "status": "ready", "checks": { ... } }`) | `503 Service Unavailable` |
| `/health` | `GET` | Liveness Probe | `200 OK` (`{ "status": "ok" }`) | `500 Server Error` |
| `/live` | `GET` | Quick Process Ping | `200 OK` | Process unreachable |

### 1.1 Readiness Check Guarantees
- Bounded 2000ms database ping with timeout isolation
- Validates runtime configuration initialization
- Checks graceful shutdown state (`isShuttingDown`) before accepting traffic

---

## 2. Structured JSON Logging Contract

All backend log outputs are formatted as single-line JSON strings to stdout/stderr for automated log aggregation (Datadog, ElasticSearch, AWS CloudWatch, Grafana Loki):

```json
{
  "timestamp": "2026-09-02T04:37:10.626Z",
  "level": "info",
  "service": "mevapur-api",
  "eventName": "STAFF.INVITATION.CREATED",
  "requestId": "9deff7e7-cbb8-412e-a3f1-43208ff43aae",
  "userId": "6a97a7f59a4e3270b22cd4b5",
  "status": "SUCCESS",
  "message": "Authentication/Security audit event recorded"
}
```

### Log Levels & Rules
- `error`: Unhandled exceptions, failed third-party integrations (Stripe, Courier), database connectivity loss
- `warn`: Failed logins, invalid MFA attempts, rate limit throttling, concurrency version conflicts
- `info`: Successful business operations (orders created, staff invited, refunds processed)
- `debug`: Detailed SQL/Mongoose query profiling (disabled in production)

---

## 3. Error Tracking (Sentry / APM Integration)

To enable external error reporting:
```env
SENTRY_DSN=https://your-sentry-dsn@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.2
```

The error middleware automatically captures unhandled errors and associates the correlating `requestId` and authenticated `userId` (with PII redacted).

---

## 4. Key Alerting Thresholds

| Metric | Warning Threshold | Critical Threshold | Action |
| :--- | :--- | :--- | :--- |
| **HTTP 5xx Error Rate** | > 1% over 5m | > 5% over 2m | Inspect Sentry unhandled exceptions and database latency |
| **P95 Latency** | > 500ms over 5m | > 1500ms over 2m | Check database index utilization and external API timeouts |
| **Memory Usage** | > 80% container RSS | > 90% container RSS | Trigger horizontal pod scaling; inspect Node memory profile |
| **Failed MFA Attempts** | > 10 per hour per IP | > 50 per hour | IP automatically rate-limited; trigger security alert |
