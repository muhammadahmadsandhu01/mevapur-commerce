/**
 * Safely serializes a JSON-LD structured data object for injection into a <script type="application/ld+json"> tag.
 * Replaces '<', '>', and '&' with Unicode escapes (\u003c, \u003e, \u0026) to prevent HTML script tag breakout / XSS.
 */
export function safeJsonLdStringify(data: unknown): string {
  if (data === null || data === undefined) return '{}';
  const json = JSON.stringify(data);
  if (!json) return '{}';
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
