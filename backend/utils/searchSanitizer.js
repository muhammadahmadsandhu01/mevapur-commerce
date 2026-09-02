function sanitizeSearchRegex(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim().slice(0, maxLength);
  if (!trimmed) return '';
  return trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePaginationParams(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query?.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip
  };
}

module.exports = {
  sanitizeSearchRegex,
  parsePaginationParams
};
