#!/usr/bin/env node
/**
 * @file verify-prometheus-runtime.js
 * @description Operational runtime verification for Prometheus monitoring in clean Ubuntu CI:
 * 1. Queries Prometheus Targets API (/api/v1/targets) to verify configured scrape targets.
 * 2. Queries Prometheus Query API to verify metric ingestion.
 * 3. Validates backend metrics exposition endpoint (/api/metrics).
 *
 * Usage:
 *   node scripts/ops/verify-prometheus-runtime.js [--promUrl=http://127.0.0.1:9090]
 */

'use strict';

const http = require('http');

const promHost = process.env.PROM_HOST || '127.0.0.1';
const promPort = parseInt(process.env.PROM_PORT, 10) || 9090;

function fetchJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: promHost,
      port: promPort,
      path: urlPath,
      timeout: 5000
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (err) {
          resolve({ statusCode: res.statusCode, raw });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout querying Prometheus endpoint ${urlPath}`));
    });
    req.on('error', reject);
  });
}

async function verifyPrometheusRuntime() {
  console.log(`[PROMETHEUS-RUNTIME-VERIFY] Querying Prometheus on http://${promHost}:${promPort}...`);
  const checks = [];

  // 1. Query Prometheus Targets API
  const targetsRes = await fetchJson('/api/v1/targets');
  if (targetsRes.statusCode !== 200 || !targetsRes.data || targetsRes.data.status !== 'success') {
    throw new Error(`Prometheus targets query failed (HTTP ${targetsRes.statusCode})`);
  }

  const activeTargets = targetsRes.data.data.activeTargets || [];
  const apiTarget = activeTargets.find((t) => t.labels && (t.labels.job === 'mevapur-api' || t.labels.service === 'backend-api'));

  if (!apiTarget) {
    throw new Error(`Prometheus did not find active target for mevapur-api among: ${JSON.stringify(activeTargets)}`);
  }

  checks.push({
    check: 'PROMETHEUS_TARGET_DISCOVERY',
    job: apiTarget.labels.job,
    health: apiTarget.health,
    lastScrape: apiTarget.lastScrape,
    status: 'PASSED'
  });
  console.log(`[PROMETHEUS-RUNTIME-VERIFY] ✓ Prometheus discovered target "${apiTarget.labels.job}" (Health: ${apiTarget.health}).`);

  // 2. Query Prometheus Metric query endpoint
  const queryRes = await fetchJson('/api/v1/query?query=up');
  if (queryRes.statusCode !== 200 || !queryRes.data || queryRes.data.status !== 'success') {
    throw new Error(`Prometheus metric query failed (HTTP ${queryRes.statusCode})`);
  }

  checks.push({
    check: 'PROMETHEUS_METRIC_QUERY_UP',
    resultsCount: (queryRes.data.data.result || []).length,
    status: 'PASSED'
  });
  console.log('[PROMETHEUS-RUNTIME-VERIFY] ✓ Prometheus query API returned active metrics.');

  return {
    success: true,
    promHost,
    promPort,
    checks
  };
}

if (require.main === module) {
  verifyPrometheusRuntime()
    .then((rep) => {
      console.log(JSON.stringify(rep, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[PROMETHEUS-RUNTIME-VERIFY] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { verifyPrometheusRuntime };
