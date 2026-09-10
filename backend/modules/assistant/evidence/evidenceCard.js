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

const ALLOWED_TOOL_CARDS = Object.freeze({
  searchPublicProducts: Object.freeze({
    id: 'tool:searchPublicProducts',
    title: 'Product Catalog Search',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['anonymous', 'customer', 'admin'])
  }),
  lookupProductBySlug: Object.freeze({
    id: 'tool:lookupProductBySlug',
    title: 'Product Catalog Details',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['anonymous', 'customer', 'admin'])
  }),
  getCurrentCustomerOrders: Object.freeze({
    id: 'tool:getCurrentCustomerOrders',
    title: 'Customer Order History',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['customer', 'admin'])
  }),
  getCurrentCustomerOrderStatus: Object.freeze({
    id: 'tool:getCurrentCustomerOrderStatus',
    title: 'Customer Order Status',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['customer', 'admin'])
  }),
  getCurrentCustomerPaymentStatus: Object.freeze({
    id: 'tool:getCurrentCustomerPaymentStatus',
    title: 'Customer Payment Status',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['customer', 'admin'])
  }),
  getCurrentCustomerRefundStatus: Object.freeze({
    id: 'tool:getCurrentCustomerRefundStatus',
    title: 'Customer Refund Status',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['customer', 'admin'])
  }),
  getInventorySummary: Object.freeze({
    id: 'tool:getInventorySummary',
    title: 'Admin Inventory Summary',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['admin'])
  }),
  getLowStockSummary: Object.freeze({
    id: 'tool:getLowStockSummary',
    title: 'Admin Low Stock Alert',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['admin'])
  }),
  getOrderStatusSummary: Object.freeze({
    id: 'tool:getOrderStatusSummary',
    title: 'Admin Order Summary',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['admin'])
  }),
  getPaymentStatusSummary: Object.freeze({
    id: 'tool:getPaymentStatusSummary',
    title: 'Admin Payment Summary',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['admin'])
  }),
  getRefundSummary: Object.freeze({
    id: 'tool:getRefundSummary',
    title: 'Admin Refund Summary',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['admin'])
  }),
  getProviderAvailabilitySummary: Object.freeze({
    id: 'tool:getProviderAvailabilitySummary',
    title: 'Admin Provider Status',
    category: 'operational',
    reference: 'Live role-scoped commerce data',
    referenceType: 'runtime',
    resolvable: false,
    audience: Object.freeze(['admin'])
  })
});

const validateKnowledgeReference = (rawRef) => {
  if (!rawRef || typeof rawRef !== 'string') {
    return null;
  }

  const trimmed = rawRef.trim();
  if (!trimmed || trimmed.length > MAX_REFERENCE_LENGTH) {
    return null;
  }

  // Reject Windows drive paths (C:\ or C:/) and backslashes
  if (/^[a-zA-Z]:/i.test(trimmed) || trimmed.includes('\\')) {
    return null;
  }

  // Reject absolute POSIX root paths
  if (trimmed.startsWith('/')) {
    return null;
  }

  // Reject directory traversals
  if (trimmed.includes('..')) {
    return null;
  }

  // Reject URL / URI schemes (runtime://, file://, javascript:, data:, http://, https://, etc.)
  if (/^[a-zA-Z0-9+.-]+:/i.test(trimmed) || trimmed.includes('://')) {
    return null;
  }

  // Reject control characters or newlines
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return null;
  }

  // Reject unsafe characters (quotes, angle brackets, shell/code symbols)
  if (/[<>"'`$#*?|{}[\]]/.test(trimmed)) {
    return null;
  }

  // Must match safe relative posix path or plain text identifier structure (alphanumeric, spaces, dots, hyphens, underscores, slashes)
  if (!/^[a-zA-Z0-9_.\- /]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
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

  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');
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

const audiencePermissions = (audience) => {
  if (audience === 'admin') return new Set(['admin']);
  if (audience === 'customer') return new Set(['customer', 'anonymous']);
  return new Set(['anonymous']);
};

const createKnowledgeEvidenceCard = (record) => {
  if (!record || typeof record !== 'object' || !record.id) {
    return null;
  }

  const safeReference = validateKnowledgeReference(record.sourceReference);
  if (!safeReference) {
    return null;
  }

  const card = {
    id: String(record.id),
    kind: 'knowledge',
    title: sanitizeTitle(record.title),
    category: String(record.category || 'general'),
    reference: safeReference,
    referenceType: 'logical',
    resolvable: false,
    audience: Object.freeze(
      Array.isArray(record.audience)
        ? [...new Set(record.audience)].sort()
        : ['anonymous']
    ),
    snippet: buildSafeSnippet(record.content)
  };

  return Object.freeze(card);
};

const createToolEvidenceCard = (toolName) => {
  if (!toolName || typeof toolName !== 'string') {
    return null;
  }

  const allowlisted = ALLOWED_TOOL_CARDS[toolName];
  if (!allowlisted) {
    return null;
  }

  const card = {
    id: allowlisted.id,
    kind: 'tool',
    title: allowlisted.title,
    category: allowlisted.category,
    reference: allowlisted.reference,
    referenceType: allowlisted.referenceType,
    resolvable: allowlisted.resolvable,
    audience: allowlisted.audience
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
    .map((match) => createKnowledgeEvidenceCard(match))
    .filter(Boolean);

  return Object.freeze(cards);
};

module.exports = {
  ALLOWED_TOOL_CARDS,
  createKnowledgeEvidenceCard,
  createToolEvidenceCard,
  buildEvidenceCards,
  validateKnowledgeReference,
  sanitizeTitle,
  buildSafeSnippet
};
