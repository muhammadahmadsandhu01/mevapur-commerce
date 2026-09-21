#!/usr/bin/env node
/**
 * @file healthcheck.js
 * @description Universal Node.js HTTP healthcheck probe for minimal container environments.
 * Avoids external dependencies (curl/wget).
 *
 * Usage:
 *   node scripts/ops/healthcheck.js http://localhost:5000/health/ready [expectedStatus=200] [timeoutMs=3000]
 */

'use strict';

const http = require('http');
const https = require('https');

const targetUrl = process.argv[2] || 'http://127.0.0.1:5000/health/ready';
const expectedStatus = parseInt(process.argv[3], 10) || 200;
const timeoutMs = parseInt(process.argv[4], 10) || 3000;

let parsedUrl;
try {
  parsedUrl = new URL(targetUrl);
} catch (err) {
  process.stderr.write(`Invalid URL: ${targetUrl}\n`);
  process.exit(1);
}

const client = parsedUrl.protocol === 'https:' ? https : http;

const req = client.get(targetUrl, { timeout: timeoutMs }, (res) => {
  if (res.statusCode === expectedStatus) {
    process.exit(0);
  } else {
    process.stderr.write(`Healthcheck failed: received HTTP ${res.statusCode} (expected ${expectedStatus})\n`);
    process.exit(1);
  }
});

req.on('timeout', () => {
  req.destroy();
  process.stderr.write(`Healthcheck timed out after ${timeoutMs}ms\n`);
  process.exit(1);
});

req.on('error', (err) => {
  process.stderr.write(`Healthcheck connection error: ${err.message}\n`);
  process.exit(1);
});
