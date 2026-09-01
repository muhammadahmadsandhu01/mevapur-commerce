/**
 * Shared frontend CSV formatting, formula injection neutralization, and safe download utility.
 * Complies with RFC-4180 and protects spreadsheet consumers against CSV formula injection.
 */

/**
 * Sanitize a single CSV cell value:
 * - Neutralizes formula triggers (=, +, -, @, \t, \r) on non-numeric strings even with leading whitespace.
 * - Preserves legitimate negative/positive numeric values (e.g. -5, -12.50).
 * - Applies RFC-4180 escaping (double-quote wrapping and quote doubling) when commas, quotes, or newlines are present.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  }

  let str = String(value);

  // Preserve valid numbers in string form (e.g. "-5", "+10.5", "42")
  const isNumericString = /^[+-]?\d+(\.\d+)?$/.test(str.trim());
  if (!isNumericString) {
    // Strip leading whitespace, tabs, and carriage returns to detect bypass attempts like "  =SUM(A1)"
    const trimmedLeading = str.replace(/^[\s\t\r\n]+/, '');
    if (/^[=+\-@\t\r]/.test(trimmedLeading)) {
      str = `'${str}`;
    }
  }

  // RFC-4180: If cell contains comma, double-quote, or newline, enclose in double quotes and escape internal quotes
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Format headers and data rows into an RFC-4180 compliant CSV string with UTF-8 BOM.
 */
export function formatCsv(
  headers: string[],
  rows: unknown[][],
  options: { includeBom?: boolean } = {}
): string {
  const { includeBom = true } = options;
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  const body = [headerLine, ...dataLines].join('\r\n');
  return includeBom ? `\uFEFF${body}` : body;
}

/**
 * Sanitize a filename to prevent path traversal and control-character injection.
 */
export function sanitizeFilename(name: string, fallback = 'export.csv'): string {
  if (!name || typeof name !== 'string') return fallback;
  const base = name.replace(/^[\s./\\]+/, '').replace(/\.csv$/i, '');
  const clean = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');
  return clean ? `${clean}.csv` : fallback;
}

/**
 * Trigger an in-browser download of CSV data and revoke the object URL safely.
 */
export function exportCsvFile(
  filename: string,
  headers: string[],
  rows: unknown[][]
): void {
  const csvContent = formatCsv(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Clean up object URL safely after download initiates
  setTimeout(() => {
    try {
      window.URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup error if already revoked
    }
  }, 200);
}
