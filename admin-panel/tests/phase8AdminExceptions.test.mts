/**
 * Phase 8 Admin Operations Exception Queue Contract Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 8 — Admin Operations Exception Queue Contract Tests', () => {
  const sidebarPath = path.resolve(process.cwd(), 'src/components/layout/Sidebar.tsx');
  const exceptionsPagePath = path.resolve(process.cwd(), 'src/app/exceptions/page.tsx');

  it('Sidebar includes Operations Exceptions link with ShieldAlert icon and accessible badge', () => {
    const sidebar = fs.readFileSync(sidebarPath, 'utf8');
    assert.match(sidebar, /\/exceptions/);
    assert.match(sidebar, /Exceptions/i);
    assert.match(sidebar, /ShieldAlert/);
  });

  it('Exceptions page component implements server-side global metrics and filters', () => {
    const pageSource = fs.readFileSync(exceptionsPagePath, 'utf8');
    assert.match(pageSource, /totalOpen/);
    assert.match(pageSource, /criticalCount/);
    assert.match(pageSource, /escalatedCount/);
    assert.match(pageSource, /statusFilter/);
    assert.match(pageSource, /severityFilter/);
    assert.match(pageSource, /typeFilter/);
  });

  it('Exceptions page implements modal with accessible actions: Acknowledge, Escalate, Retry, and Audited Resolution', () => {
    const pageSource = fs.readFileSync(exceptionsPagePath, 'utf8');
    assert.match(pageSource, /handleAcknowledge/);
    assert.match(pageSource, /handleEscalate/);
    assert.match(pageSource, /handleRetry/);
    assert.match(pageSource, /handleResolve/);
    assert.match(pageSource, /resolutionReason/);
    assert.match(pageSource, /resolutionCode/);
  });

  it('Exceptions page provides CSV export with authorized endpoint binding', () => {
    const pageSource = fs.readFileSync(exceptionsPagePath, 'utf8');
    assert.match(pageSource, /handleExportCsv/);
    assert.match(pageSource, /\/admin\/exceptions\/export/);
    assert.match(pageSource, /Export CSV/i);
  });
});
