import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCsv,
  sanitizeCsvCell,
  sanitizeFilename
} from '../src/lib/csvExport.ts';

test('sanitizeCsvCell neutralizes formula injection triggers', () => {
  assert.equal(sanitizeCsvCell('=SUM(A1:B10)'), "'=SUM(A1:B10)");
  assert.equal(sanitizeCsvCell('+cmd|/c calc'), "'+cmd|/c calc");
  assert.equal(sanitizeCsvCell('-cmd|/c calc'), "'-cmd|/c calc");
  assert.equal(sanitizeCsvCell('@IMPORTXML(...)'), "'@IMPORTXML(...)");
  assert.equal(sanitizeCsvCell('\t=cmd'), "'\t=cmd");
  assert.equal(sanitizeCsvCell('\r+payload'), `"'\r+payload"`);
});

test('sanitizeCsvCell neutralizes formula triggers while preserving original leading spaces and tabs', () => {
  assert.equal(sanitizeCsvCell('   =SUM(A1)'), "'   =SUM(A1)");
  assert.equal(sanitizeCsvCell('   =SUM(1,2)'), `"'   =SUM(1,2)"`);
  assert.equal(sanitizeCsvCell('\t  +alert()'), "'\t  +alert()");
  assert.equal(sanitizeCsvCell('\t=calc'), "'\t=calc");
});

test('sanitizeCsvCell preserves legitimate non-formula leading spaces on standard text', () => {
  assert.equal(sanitizeCsvCell('   Standard text'), '   Standard text');
  assert.equal(sanitizeCsvCell('\tTab indented text'), '\tTab indented text');
});

test('sanitizeCsvCell preserves legitimate negative and positive numbers', () => {
  assert.equal(sanitizeCsvCell(-5), '-5');
  assert.equal(sanitizeCsvCell(100.5), '100.5');
  assert.equal(sanitizeCsvCell('-5'), '-5');
  assert.equal(sanitizeCsvCell('-12.50'), '-12.50');
  assert.equal(sanitizeCsvCell('+42'), '+42');
});

test('sanitizeCsvCell handles null, undefined, booleans, and dates', () => {
  assert.equal(sanitizeCsvCell(null), '');
  assert.equal(sanitizeCsvCell(undefined), '');
  assert.equal(sanitizeCsvCell(true), 'true');
  assert.equal(sanitizeCsvCell(false), 'false');
  const d = new Date('2026-06-01T00:00:00.000Z');
  assert.equal(sanitizeCsvCell(d), '2026-06-01T00:00:00.000Z');
});

test('sanitizeCsvCell applies RFC-4180 escaping for commas, quotes, and newlines', () => {
  assert.equal(sanitizeCsvCell('Hello, World'), '"Hello, World"');
  assert.equal(sanitizeCsvCell('Quote "test"'), '"Quote ""test"""');
  assert.equal(sanitizeCsvCell('Line1\nLine2'), '"Line1\nLine2"');
});

test('formatCsv includes UTF-8 BOM by default and formats rows', () => {
  const headers = ['Product', 'Price'];
  const rows = [['Almonds', 500]];
  const csv = formatCsv(headers, rows);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.slice(1), 'Product,Price\r\nAlmonds,500');
});

test('sanitizeFilename prevents path traversal and control characters', () => {
  assert.equal(sanitizeFilename('../../passwords.csv'), 'passwords.csv');
  assert.equal(sanitizeFilename('my export report.csv'), 'my_export_report.csv');
  assert.equal(sanitizeFilename('customers'), 'customers.csv');
});
