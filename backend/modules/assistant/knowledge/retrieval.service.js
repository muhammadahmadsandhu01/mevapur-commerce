const { defaultKnowledgeLoader } = require('./knowledgeIndexLoader');

class KnowledgeUnavailableError extends Error {
  constructor(reason = 'UNAVAILABLE') {
    super('Assistant knowledge index is unavailable');
    this.name = 'KnowledgeUnavailableError';
    this.code = 'ASSISTANT_KNOWLEDGE_UNAVAILABLE';
    this.reason = reason;
    this.statusCode = 503;
  }
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please', 'the', 'to', 'what',
  'when', 'where', 'with', 'you'
]);

const tokenize = (value) => (
  String(value)
    .toLowerCase()
    .normalize('NFKC')
    .match(/[a-z0-9]+/g) || []
).filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const allowedAudiences = (audience) => {
  if (audience === 'admin') return new Set(['admin']);
  if (audience === 'customer') return new Set(['customer', 'anonymous']);
  return new Set(['anonymous']);
};

class RetrievalService {
  constructor(options = {}) {
    this.loader = options.loader || defaultKnowledgeLoader;
  }

  isAvailable() {
    return this.loader.isReady();
  }

  getStatus() {
    const snapshot = this.loader.getSnapshot();
    return {
      status: snapshot.status,
      reason: snapshot.reason,
      recordCount: snapshot.recordCount
    };
  }

  retrieve(query, audience, limit = 5) {
    if (!this.isAvailable()) {
      const status = this.getStatus();
      throw new KnowledgeUnavailableError(status.reason);
    }

    const queryTokens = [...new Set(tokenize(query))];
    if (queryTokens.length === 0) return [];

    const allowed = allowedAudiences(audience);
    const records = this.loader.getRecords();

    return records
      .filter((record) => record.audience.some((entry) => allowed.has(entry)))
      .map((record) => {
        const titleTokens = new Set(tokenize(record.title));
        const categoryTokens = new Set(tokenize(record.category));
        const contentTokens = new Set(tokenize(record.content));
        const score = queryTokens.reduce((total, token) => (
          total
          + (titleTokens.has(token) ? 5 : 0)
          + (categoryTokens.has(token) ? 4 : 0)
          + (contentTokens.has(token) ? 1 : 0)
        ), 0);
        return { record, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => (
        right.score - left.score
        || left.record.id.localeCompare(right.record.id)
      ))
      .slice(0, limit)
      .map(({ record, score }) => ({ ...record, score }));
  }
}

const defaultRetrievalService = new RetrievalService();

const createRetrievalService = (options = {}) => new RetrievalService(options);

module.exports = {
  KnowledgeUnavailableError,
  RetrievalService,
  createRetrievalService,
  defaultRetrievalService,
  retrieve: (query, audience, limit) => defaultRetrievalService.retrieve(query, audience, limit),
  tokenize,
  isAvailable: () => defaultRetrievalService.isAvailable(),
  getStatus: () => defaultRetrievalService.getStatus()
};
