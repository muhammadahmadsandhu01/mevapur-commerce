/**
 * Centralized Content Publication and Scheduling Policy Service
 * Ensures deterministic, synchronized publication criteria across collection and page endpoints.
 */

const ALLOWED_CONTENT_TYPES = Object.freeze(['banner', 'slider', 'page', 'blog']);

const PUBLIC_CONTENT_SORT = Object.freeze({
  position: 1,
  createdAt: -1,
  _id: 1
});

const PUBLIC_PROJECTION = Object.freeze(
  '_id type title slug subtitle description content image images button position isActive isFeatured category seo startDate endDate views createdAt updatedAt'
);

const isValidContentType = (type) => (
  typeof type === 'string' && ALLOWED_CONTENT_TYPES.includes(type.trim().toLowerCase())
);

const isValidSlug = (slug) => {
  if (typeof slug !== 'string') return false;
  const trimmed = slug.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed);
};

/**
 * Builds the authoritative MongoDB query for publicly published content.
 * Enforces active status, allowed content type, and strict temporal boundary conjunction.
 */
const buildPublicationQuery = ({ type, slug, referenceDate = new Date() } = {}) => {
  const query = {
    isActive: true
  };

  if (type) {
    query.type = type.trim().toLowerCase();
  }

  if (slug) {
    query.slug = slug.trim().toLowerCase();
  }

  const now = referenceDate instanceof Date && !isNaN(referenceDate.getTime())
    ? referenceDate
    : new Date();

  query.$and = [
    {
      $or: [
        { startDate: { $exists: false } },
        { startDate: null },
        { startDate: { $lte: now } }
      ]
    },
    {
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gte: now } }
      ]
    }
  ];

  return query;
};

/**
 * Validates scheduling dates for create and partial update mutations.
 */
const validateSchedule = ({ startDate, endDate, existingStartDate, existingEndDate } = {}) => {
  const parseDate = (val, fieldName) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid date format for ${fieldName}`);
    }
    return d;
  };

  const parsedStart = parseDate(startDate, 'startDate');
  const parsedEnd = parseDate(endDate, 'endDate');

  const effectiveStart = parsedStart !== undefined ? parsedStart : existingStartDate;
  const effectiveEnd = parsedEnd !== undefined ? parsedEnd : existingEndDate;

  if (effectiveStart && effectiveEnd) {
    const startMs = effectiveStart instanceof Date ? effectiveStart.getTime() : new Date(effectiveStart).getTime();
    const endMs = effectiveEnd instanceof Date ? effectiveEnd.getTime() : new Date(effectiveEnd).getTime();

    if (isNaN(startMs)) throw new Error('Invalid date format for startDate');
    if (isNaN(endMs)) throw new Error('Invalid date format for endDate');

    if (startMs > endMs) {
      throw new Error('startDate cannot be later than endDate');
    }
  }
};

module.exports = {
  ALLOWED_CONTENT_TYPES,
  PUBLIC_CONTENT_SORT,
  PUBLIC_PROJECTION,
  isValidContentType,
  isValidSlug,
  buildPublicationQuery,
  validateSchedule
};
