/**
 * Shared backend CSV formatting and formula injection neutralization utility.
 * Complies with RFC-4180 and protects spreadsheet consumers from CSV injection.
 */

/**
 * Sanitize a single CSV cell value:
 * - Neutralizes formula triggers (=, +, -, @, \t, \r) on non-numeric strings even with leading whitespace.
 * - Preserves legitimate negative/positive numeric values (e.g. -5, -12.50).
 * - Applies RFC-4180 escaping (double-quote wrapping and quote doubling) when commas, quotes, or newlines are present.
 *
 * @param {unknown} value
 * @returns {string} Sanitized and escaped CSV cell representation
 */
function sanitizeCsvCell(value) {
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

  // Check if the value is a standard integer or decimal number string (e.g., "-5", "+12.50", "42")
  const isNumericString = /^[+-]?\d+(\.\d+)?$/.test(str.trim());
  if (!isNumericString) {
    // Strip leading whitespace, tabs, and carriage returns to detect bypass attempts like "  =cmd" or "\t-formula"
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
 * Format a list of headers and data rows into an RFC-4180 compliant CSV string.
 *
 * @param {string[]} headers Column headers
 * @param {Array<Array<unknown>>} rows Array of data rows
 * @param {object} [options]
 * @param {boolean} [options.includeBom=true] Whether to include the UTF-8 Byte Order Mark
 * @returns {string} Formatted CSV content
 */
function formatCsv(headers, rows, options = {}) {
  const { includeBom = true } = options;
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  const body = [headerLine, ...dataLines].join('\r\n');
  return includeBom ? `\uFEFF${body}` : body;
}

/**
 * Sanitize a filename to prevent path traversal and control-character injection.
 *
 * @param {string} name Base filename
 * @param {string} [fallback='export.csv']
 * @returns {string} Safe filename ending with .csv
 */
function sanitizeFilename(name, fallback = 'export.csv') {
  if (!name || typeof name !== 'string') return fallback;
  const base = name.replace(/^[\s./\\]+/, '').replace(/\.csv$/i, '');
  const clean = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');
  return clean ? `${clean}.csv` : fallback;
}

/**
 * Generate a safe Content-Disposition header value with CR/LF stripping.
 *
 * @param {string} filename
 * @returns {string} Safe Content-Disposition header
 */
function safeContentDisposition(filename) {
  const safeName = sanitizeFilename(filename).replace(/[\r\n"]/g, '');
  return `attachment; filename="${safeName}"`;
}

module.exports = {
  sanitizeCsvCell,
  formatCsv,
  sanitizeFilename,
  safeContentDisposition
};
