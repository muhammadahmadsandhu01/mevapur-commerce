/**
 * scripts/ops/capture-protected-baseline.js
 *
 * Captures read-only inventory of pre-existing containers, networks, and volumes
 * on the host to establish an inviolable safety baseline before disposable environment boot.
 *
 * Stored externally outside git checkout by default.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const UAT_RUN_DIR = process.env.DISPOSABLE_ENV_DIR || path.join(os.tmpdir(), 'mevapur-uat');
const BASELINE_FILE = process.env.DISPOSABLE_BASELINE_FILE || path.join(UAT_RUN_DIR, 'protected-pre-existing-baseline.json');

function captureBaseline() {
  console.log('[BASELINE] Capturing read-only inventory of pre-existing Docker resources...');

  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });

  // 1. Containers
  const containersRaw = execSync('docker ps -a --format "{{json .}}"', { encoding: 'utf8' }).trim();
  const containers = containersRaw
    ? containersRaw
        .split('\n')
        .map((line) => JSON.parse(line))
        .map((c) => ({
          id: c.ID,
          names: c.Names,
          image: c.Image,
          status: c.Status,
          state: c.State,
          ports: c.Ports,
          composeProject: (c.Labels && c.Labels.includes('com.docker.compose.project='))
            ? c.Labels.split('com.docker.compose.project=')[1].split(',')[0]
            : null,
          labels: c.Labels,
        }))
    : [];

  // 2. Networks
  const networksRaw = execSync('docker network ls --format "{{json .}}"', { encoding: 'utf8' }).trim();
  const networks = networksRaw
    ? networksRaw.split('\n').map((line) => JSON.parse(line))
    : [];

  // 3. Volumes
  const volumesRaw = execSync('docker volume ls --format "{{json .}}"', { encoding: 'utf8' }).trim();
  const volumes = volumesRaw
    ? volumesRaw.split('\n').map((line) => JSON.parse(line))
    : [];

  const baseline = {
    capturedAt: new Date().toISOString(),
    protectedContainerCount: containers.length,
    containers,
    networks,
    volumes,
    protectedNames: containers.map((c) => c.names),
  };

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2), 'utf8');

  console.log(`[BASELINE] Captured ${containers.length} containers, ${networks.length} networks, ${volumes.length} volumes.`);
  console.log(`[BASELINE] Saved to external path: ${BASELINE_FILE}`);
  return baseline;
}

function verifyAgainstBaseline() {
  let file = BASELINE_FILE;
  if (!fs.existsSync(file)) {
    const fallback = path.resolve(__dirname, 'manifests', 'protected-pre-existing-baseline.json');
    if (fs.existsSync(fallback)) {
      file = fallback;
    } else {
      throw new Error(`Baseline file not found at ${BASELINE_FILE}`);
    }
  }
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));

  const currentContainersRaw = execSync('docker ps -a --format "{{json .}}"', { encoding: 'utf8' }).trim();
  const currentContainers = currentContainersRaw
    ? currentContainersRaw.split('\n').map((line) => JSON.parse(line))
    : [];

  const currentMap = new Map();
  for (const c of currentContainers) {
    currentMap.set(c.ID.substring(0, 12), c);
    currentMap.set(c.Names, c);
  }

  let runningCount = 0;
  let exitedCount = 0;

  for (const orig of baseline.containers) {
    if (orig.state === 'running') runningCount++;
    else exitedCount++;

    const found = currentMap.get(orig.id) || currentMap.get(orig.names);
    if (!found) {
      throw new Error(`[SAFETY_VIOLATION] Protected container ${orig.names} (${orig.id}) is MISSING!`);
    }
    if (found.State !== orig.state) {
      throw new Error(`[SAFETY_VIOLATION] Protected container ${orig.names} state changed from ${orig.state} to ${found.State}!`);
    }
    if (found.Ports !== orig.ports) {
      throw new Error(`[SAFETY_VIOLATION] Protected container ${orig.names} port bindings mutated! Was: "${orig.ports}", Now: "${found.Ports}"`);
    }
  }

  console.log(`[BASELINE_VERIFIED] All ${baseline.containers.length} pre-existing protected containers remain completely untouched (${runningCount} running, ${exitedCount} exited) and unmodified.`);
  return true;
}

if (require.main === module) {
  if (process.argv.includes('--verify')) {
    verifyAgainstBaseline();
  } else {
    captureBaseline();
  }
}

module.exports = { captureBaseline, verifyAgainstBaseline, BASELINE_FILE };
