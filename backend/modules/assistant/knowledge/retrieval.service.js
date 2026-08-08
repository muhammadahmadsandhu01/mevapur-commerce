const records = require('./index.json');

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

const retrieve = (query, audience, limit = 5) => {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  const allowed = allowedAudiences(audience);
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
};

module.exports = {
  retrieve,
  tokenize
};
