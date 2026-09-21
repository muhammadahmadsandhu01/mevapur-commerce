#!/usr/bin/env node
/**
 * @file worker-healthcheck.js
 * @description Proves that background daemon workers are actively progressing by inspecting
 * the bounded heartbeat timestamp file written by the worker loop.
 *
 * Usage:
 *   node scripts/ops/worker-healthcheck.js /tmp/worker-heartbeat.json [maxAgeMs=30000]
 */

'use strict';

const fs = require('fs');

const heartbeatFile = process.argv[2] || '/tmp/worker-heartbeat.json';
const maxAgeMs = parseInt(process.argv[3], 10) || 30000;

try {
  if (!fs.existsSync(heartbeatFile)) {
    process.stderr.write(`Worker heartbeat file does not exist: ${heartbeatFile}\n`);
    process.exit(1);
  }

  const raw = fs.readFileSync(heartbeatFile, 'utf8');
  const data = JSON.parse(raw);

  const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : 0;
  const age = Date.now() - timestamp;

  if (age > maxAgeMs) {
    process.stderr.write(`Worker heartbeat stalled: last update was ${age}ms ago (max allowed: ${maxAgeMs}ms)\n`);
    process.exit(1);
  }

  process.exit(0);
} catch (err) {
  process.stderr.write(`Worker healthcheck error: ${err.message}\n`);
  process.exit(1);
}
