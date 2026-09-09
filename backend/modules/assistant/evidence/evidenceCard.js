const tools = require('../tools/assistantReadTools');

const MAX_TITLE_LENGTH = 100;
const MAX_REFERENCE_LENGTH = 120;
const MAX_SNIPPET_LENGTH = 180;

const SECRET_PATTERNS = [
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  /bearer\s+[a-zA-Z0-9._\-]+/gi,
  /api[-_]?key\s*[:=]\s*['"]?[a-zA-Z0-9_\-]+['"]?/gi,
  /password\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
  /secret\s*[:=]\s*['"]?[^\s'"]+['"]?/gi
];

const path = require('path');

const sanitizeReference = (rawRef) => {
  if (!rawRef || typeof rawRef !== 'string') {
    return 'Approved application knowledge source';
  }

  let sanitized = rawRef
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:[/\\]+/g, '')
    .trim();

  // Redact potential secret markers
  SECRET_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  // Normalize path traversals
  sanitized = path.posix.normalize(sanitized)
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\/+/, '');

  // If path was prefixed with external directories but contains docs/, anchor to docs/...
  const docsMatch = sanitized.match(/(?:^|\/)(docs\/[^\s]+)/i);
  if (docsMatch && !sanitized.startsWith('docs/')) {
    sanitized = docsMatch[1];
  }

  if (sanitized.length > MAX_REFERENCE_LENGTH) {
    sanitized = sanitized.slice(0, MAX_REFERENCE_LENGTH);
  }

  return sanitized || 'Approved application knowledge source';
};

const sanitizeTitle = (rawTitle) => {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return 'Knowledge Document';
  }

  const normalized = String(rawTitle).normalize('NFKC').trim();
  return normalized.length > MAX_TITLE_LENGTH
    ? normalized.slice(0, MAX_TITLE_LENGTH)
    : normalized;
};

const buildSafeSnippet = (rawContent, maxLength = MAX_SNIPPET_LENGTH) => {
  if (!rawContent || typeof rawContent !== 'string') {
    return '';
  }

  let cleaned = String(rawContent).normalize('NFKC');

  SECRET_PATTERNS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  });

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const bounded = lastSpace > maxLength * 0.75
    ? truncated.slice(0, lastSpace)
    : truncated;

  return `${bounded}...`;
};

const formatToolTitle = (toolName) => {
  if (!toolName || typeof toolName !== 'string') {
    return 'Application Tool';
  }

  const spaced = toolName
    .replace(/^get/, '')
    .replace(/^search/, 'Search ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const audiencePermissions = (audience) => {
  if (audience === 'admin') return new Set(['admin']);
  if (audience === 'customer') return new Set(['customer', 'anonymous']);
  return new Set(['anonymous']);
};

const createKnowledgeEvidenceCard = (record, score) => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const card = {
    id: String(record.id),
    kind: 'knowledge',
    title: sanitizeTitle(record.title),
    category: String(record.category || 'general'),
    reference: sanitizeReference(record.sourceReference),
    audience: Object.freeze(
      Array.isArray(record.audience)
        ? [...new Set(record.audience)].sort()
        : ['anonymous']
    ),
    snippet: buildSafeSnippet(record.content)
  };

  if (typeof score === 'number' && Number.isFinite(score) && score > 0) {
    card.score = score;
  }

  return Object.freeze(card);
};

const createToolEvidenceCard = (toolName) => {
  const definition = tools.TOOL_DEFINITIONS[toolName];
  const card = {
    id: `tool:${toolName}`,
    kind: 'tool',
    title: formatToolTitle(toolName),
    category: 'operational',
    reference: 'Role-scoped read-only application tool',
    audience: Object.freeze(
      definition && Array.isArray(definition.audience)
        ? [...new Set(definition.audience)].sort()
        : ['admin']
    ),
    toolName: String(toolName)
  };

  return Object.freeze(card);
};

const buildEvidenceCards = (matches, audience) => {
  if (!Array.isArray(matches) || matches.length === 0) {
    return Object.freeze([]);
  }

  const allowed = audiencePermissions(audience);

  const cards = matches
    .filter((match) => {
      if (!match || !match.id || !Array.isArray(match.audience)) return false;
      return match.audience.some((entry) => allowed.has(entry));
    })
    .map((match) => createKnowledgeEvidenceCard(match, match.score))
    .filter(Boolean);

  return Object.freeze(cards);
};

module.exports = {
  createKnowledgeEvidenceCard,
  createToolEvidenceCard,
  buildEvidenceCards,
  sanitizeReference,
  sanitizeTitle,
  buildSafeSnippet,
  formatToolTitle
};
