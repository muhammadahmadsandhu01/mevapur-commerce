const fs = require('fs');
const path = require('path');
const {
  validateKnowledgeRecords
} = require('./knowledgeIndexContract');

const DEFAULT_INDEX_PATH = path.resolve(__dirname, 'index.json');

const REASONS = Object.freeze({
  MISSING: 'MISSING',
  READ_FAILED: 'READ_FAILED',
  MALFORMED_JSON: 'MALFORMED_JSON',
  INVALID_SCHEMA: 'INVALID_SCHEMA'
});

const STATUSES = Object.freeze({
  READY: 'READY',
  UNAVAILABLE: 'UNAVAILABLE'
});

/**
 * Deeply freezes a knowledge records array to prevent external runtime mutation.
 *
 * @param {Array<object>} records
 * @returns {ReadonlyArray<object>}
 */
function freezeRecords(records) {
  return Object.freeze(
    records.map((record) => Object.freeze({
      id: record.id,
      title: record.title,
      audience: Object.freeze([...record.audience]),
      category: record.category,
      content: record.content,
      sourceReference: record.sourceReference
    }))
  );
}

class KnowledgeIndexLoader {
  constructor(options = {}) {
    this.indexPath = options.indexPath || DEFAULT_INDEX_PATH;
    this.snapshot = null;
    this.loadSnapshot();
  }

  loadSnapshot() {
    if (!fs.existsSync(this.indexPath)) {
      this.snapshot = Object.freeze({
        status: STATUSES.UNAVAILABLE,
        reason: REASONS.MISSING,
        recordCount: 0,
        records: Object.freeze([])
      });
      return this.snapshot;
    }

    let rawContent;
    try {
      rawContent = fs.readFileSync(this.indexPath, 'utf8');
    } catch {
      this.snapshot = Object.freeze({
        status: STATUSES.UNAVAILABLE,
        reason: REASONS.READ_FAILED,
        recordCount: 0,
        records: Object.freeze([])
      });
      return this.snapshot;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      this.snapshot = Object.freeze({
        status: STATUSES.UNAVAILABLE,
        reason: REASONS.MALFORMED_JSON,
        recordCount: 0,
        records: Object.freeze([])
      });
      return this.snapshot;
    }

    try {
      validateKnowledgeRecords(parsed);
    } catch {
      this.snapshot = Object.freeze({
        status: STATUSES.UNAVAILABLE,
        reason: REASONS.INVALID_SCHEMA,
        recordCount: 0,
        records: Object.freeze([])
      });
      return this.snapshot;
    }

    this.snapshot = Object.freeze({
      status: STATUSES.READY,
      reason: null,
      recordCount: parsed.length,
      records: freezeRecords(parsed)
    });
    return this.snapshot;
  }

  getSnapshot() {
    if (!this.snapshot) {
      return this.loadSnapshot();
    }
    return this.snapshot;
  }

  isReady() {
    return this.getSnapshot().status === STATUSES.READY;
  }

  getRecords() {
    return this.getSnapshot().records;
  }
}

const defaultKnowledgeLoader = new KnowledgeIndexLoader();

const createKnowledgeLoader = (options = {}) => new KnowledgeIndexLoader(options);

module.exports = {
  REASONS,
  STATUSES,
  DEFAULT_INDEX_PATH,
  KnowledgeIndexLoader,
  createKnowledgeLoader,
  defaultKnowledgeLoader
};
