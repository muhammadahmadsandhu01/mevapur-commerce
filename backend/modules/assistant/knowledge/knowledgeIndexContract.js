const CANONICAL_AUDIENCES = new Set(['admin', 'customer', 'anonymous']);

const REQUIRED_STRING_FIELDS = [
  'id',
  'title',
  'category',
  'content',
  'sourceReference'
];

const REQUIRED_FIELDS = [
  'id',
  'title',
  'audience',
  'category',
  'content',
  'sourceReference'
];

const FORBIDDEN_CONTENT_REGEX = /(?:mongodb(?:\+srv)?:\/\/|authorization:|bearer\s+|api[_-]?key\s*[=:]|password\s*[=:]|P5C_PRE_CHANGE_WORKING_TREE)/i;

/**
 * Validates raw knowledge records for schema, duplicate IDs, valid audiences,
 * and forbidden secret content.
 * Throws on any validation violation without exposing secret content in error messages.
 *
 * @param {Array<object>} records
 */
function validateKnowledgeRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('ASSISTANT_INDEX_SOURCE_EMPTY');
  }

  const ids = new Set();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`ASSISTANT_INDEX_RECORD_INVALID: Record at index ${index} must be an object`);
    }

    const recordId = typeof record.id === 'string' && record.id.trim().length > 0
      ? record.id.trim()
      : `index_${index}`;

    for (const key of REQUIRED_STRING_FIELDS) {
      const value = record[key];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`ASSISTANT_INDEX_RECORD_INVALID: Record "${recordId}" missing or invalid string field "${key}"`);
      }
      if (FORBIDDEN_CONTENT_REGEX.test(value)) {
        throw new Error(`ASSISTANT_INDEX_FORBIDDEN_CONTENT: Record "${recordId}" contains forbidden content in field "${key}"`);
      }
    }

    if (!Array.isArray(record.audience) || record.audience.length === 0) {
      throw new Error(`ASSISTANT_INDEX_RECORD_INVALID: Record "${recordId}" audience must be a non-empty array`);
    }

    for (const aud of record.audience) {
      if (typeof aud !== 'string' || !CANONICAL_AUDIENCES.has(aud.trim())) {
        throw new Error(`ASSISTANT_INDEX_RECORD_INVALID: Record "${recordId}" contains invalid audience "${String(aud)}"`);
      }
      if (FORBIDDEN_CONTENT_REGEX.test(aud)) {
        throw new Error(`ASSISTANT_INDEX_FORBIDDEN_CONTENT: Record "${recordId}" contains forbidden content in audience`);
      }
    }

    if (ids.has(record.id)) {
      throw new Error(`ASSISTANT_INDEX_DUPLICATE_ID: Duplicate record id "${record.id}"`);
    }
    ids.add(record.id);

    // Deep forbidden check across full stringified record
    if (FORBIDDEN_CONTENT_REGEX.test(JSON.stringify(record))) {
      throw new Error(`ASSISTANT_INDEX_FORBIDDEN_CONTENT: Record "${recordId}" contains forbidden content`);
    }
  }
}

/**
 * Pure function: takes raw knowledge records and builds the canonical, deterministic
 * knowledge index array sorted by ID with sorted audiences.
 *
 * @param {Array<object>} records
 * @returns {Array<object>}
 */
function buildKnowledgeIndex(records) {
  validateKnowledgeRecords(records);

  return records
    .map((record) => ({
      id: String(record.id).trim(),
      title: String(record.title).trim(),
      audience: [...new Set(record.audience.map((a) => String(a).trim()))].sort(),
      category: String(record.category).trim(),
      content: String(record.content).trim(),
      sourceReference: String(record.sourceReference).trim()
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Pure function: serializes canonical index to deterministic JSON with 2-space indentation
 * and a trailing newline.
 *
 * @param {Array<object>} index
 * @returns {string}
 */
function serializeKnowledgeIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

module.exports = {
  CANONICAL_AUDIENCES,
  REQUIRED_FIELDS,
  REQUIRED_STRING_FIELDS,
  FORBIDDEN_CONTENT_REGEX,
  validateKnowledgeRecords,
  buildKnowledgeIndex,
  serializeKnowledgeIndex
};
