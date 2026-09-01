const {
  sanitizeCsvCell,
  formatCsv,
  sanitizeFilename,
  safeContentDisposition
} = require('../../../utils/csvHelper');

describe('csvHelper utility', () => {
  describe('sanitizeCsvCell', () => {
    it('neutralizes formula injection characters (=, +, -, @, \\t, \\r)', () => {
      expect(sanitizeCsvCell('=SUM(A1:B10)')).toBe("'=SUM(A1:B10)");
      expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeCsvCell('-cmd|/c calc')).toBe("'-cmd|/c calc");
      expect(sanitizeCsvCell('@IMPORTXML(...)')).toBe("'@IMPORTXML(...)");
      expect(sanitizeCsvCell('\t=cmd')).toBe("'\t=cmd");
      expect(sanitizeCsvCell('\r+payload')).toBe('"\'\r+payload"');
    });

    it('neutralizes formula injection while preserving original leading spaces and tabs', () => {
      expect(sanitizeCsvCell('   =SUM(A1)')).toBe("'   =SUM(A1)");
      expect(sanitizeCsvCell('   =SUM(1,2)')).toBe('"\'   =SUM(1,2)"');
      expect(sanitizeCsvCell('\t  +alert()')).toBe("'\t  +alert()");
      expect(sanitizeCsvCell('\t=calc')).toBe("'\t=calc");
    });

    it('preserves legitimate non-formula leading spaces on standard text', () => {
      expect(sanitizeCsvCell('   Standard text')).toBe('   Standard text');
      expect(sanitizeCsvCell('\tTab indented text')).toBe('\tTab indented text');
    });

    it('preserves legitimate negative and positive numbers', () => {
      expect(sanitizeCsvCell(-5)).toBe('-5');
      expect(sanitizeCsvCell(42)).toBe('42');
      expect(sanitizeCsvCell(-12.5)).toBe('-12.5');
      expect(sanitizeCsvCell('-5')).toBe('-5');
      expect(sanitizeCsvCell('-12.50')).toBe('-12.50');
      expect(sanitizeCsvCell('+99')).toBe('+99');
    });

    it('handles null, undefined, booleans, and dates safely', () => {
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
      expect(sanitizeCsvCell(true)).toBe('true');
      expect(sanitizeCsvCell(false)).toBe('false');
      const date = new Date('2026-01-15T12:00:00.000Z');
      expect(sanitizeCsvCell(date)).toBe('2026-01-15T12:00:00.000Z');
    });

    it('applies RFC-4180 escaping for commas, quotes, and newlines', () => {
      expect(sanitizeCsvCell('Hello, World')).toBe('"Hello, World"');
      expect(sanitizeCsvCell('He said "Hello"')).toBe('"He said ""Hello"""');
      expect(sanitizeCsvCell("Line1\nLine2")).toBe('"Line1\nLine2"');
      expect(sanitizeCsvCell('=SUM("A", "B")')).toBe('"\'=SUM(""A"", ""B"")"');
    });
  });

  describe('formatCsv', () => {
    it('prepends UTF-8 BOM by default', () => {
      const headers = ['Name', 'Price'];
      const rows = [['Apple', 100]];
      const csv = formatCsv(headers, rows);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv.slice(1)).toBe('Name,Price\r\nApple,100');
    });

    it('allows disabling BOM if specified', () => {
      const headers = ['Name', 'Price'];
      const rows = [['Apple', 100]];
      const csv = formatCsv(headers, rows, { includeBom: false });
      expect(csv.startsWith('\uFEFF')).toBe(false);
      expect(csv).toBe('Name,Price\r\nApple,100');
    });
  });

  describe('sanitizeFilename and safeContentDisposition', () => {
    it('sanitizes filename and prevents directory traversal', () => {
      expect(sanitizeFilename('../../../secret.csv')).toBe('secret.csv');
      expect(sanitizeFilename('my report.csv')).toBe('my_report.csv');
      expect(sanitizeFilename('export')).toBe('export.csv');
    });

    it('generates safe Content-Disposition header and strips control characters', () => {
      const header = safeContentDisposition('orders\r\n.csv');
      expect(header).toBe('attachment; filename="orders_.csv"');
      expect(header).not.toContain('\r');
      expect(header).not.toContain('\n');
    });
  });
});
