# Operational Runbook: Monitoring, Metrics & Alerting

## 1. Metrics & Prometheus Topology

The platform exports system, application, and database metrics in standard Prometheus text format:

- **Endpoint**: `http://backend:5000/api/metrics` (Internal network only, blocked from public reverse proxy).
- **Scrape Interval**: 15s (configured in `docker/monitoring/prometheus.yml`).
- **Prometheus Service**: Pinned to `prom/prometheus:v2.55.1`.

### Core Prometheus Metrics
| Metric Name | Type | Description |
| :--- | :--- | :--- |
| `mevapur_up` | Gauge | 1 = API process alive, 0 = down |
| `mevapur_readiness_status` | Gauge | 1 = All runtime dependencies ready, 0 = unready |
| `mevapur_database_connected` | Gauge | 1 = MongoDB primary connected, 0 = disconnected |
| `mevapur_redis_connected` | Gauge | 1 = Redis client open and connected, 0 = disconnected |
| `mevapur_uptime_seconds` | Counter | Total process uptime in seconds |
| `mevapur_process_memory_rss_bytes` | Gauge | Process RSS memory footprint |
| `mevapur_process_memory_heap_used_bytes` | Gauge | Heap memory used |

---

## 2. Operational Alert Rules

Configured in `docker/monitoring/alert.rules.yml`:

1. **ApiInstanceDown** (Severity: Critical)
   - Trigger: `mevapur_up == 0` for 1 minute.
   - Action: Inspect backend container logs and restart failed instance.
2. **ApiReadinessFailed** (Severity: Critical)
   - Trigger: `mevapur_readiness_status == 0` for 2 minutes.
   - Action: Check database / Redis connectivity via `/health/ready`.
3. **DatabaseDisconnected** (Severity: Critical)
   - Trigger: `mevapur_database_connected == 0` for 1 minute.
   - Action: Verify MongoDB replica set primary status (`rs.status()`).
4. **RedisDisconnected** (Severity: High)
   - Trigger: `mevapur_redis_connected == 0` for 2 minutes.
   - Action: Verify Redis container health (`redis-cli ping`).
5. **HighMemoryUsage** (Severity: High)
   - Trigger: `mevapur_process_memory_rss_bytes > 1.5GB` for 5 minutes.
   - Action: Check for memory leaks or scale container memory limits.
6. **WorkerHeartbeatStale** (Severity: High)
   - Trigger: Background worker heartbeat timestamp older than 120s.
   - Action: Restart hanging worker daemon.

---

## 3. Validating Prometheus Configuration

Prometheus rules and configuration can be validated offline using `promtool`:
```bash
# Validate config syntax
docker run --rm -v $(pwd)/docker/monitoring:/etc/prometheus prom/prometheus:v2.55.1 promtool check config /etc/prometheus/prometheus.yml

# Validate alert rules syntax
docker run --rm -v $(pwd)/docker/monitoring:/etc/prometheus prom/prometheus:v2.55.1 promtool check rules /etc/prometheus/alert.rules.yml
```
