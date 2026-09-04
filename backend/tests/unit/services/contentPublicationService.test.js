const ContentPublicationService = require('../../../services/ContentPublicationService');

describe('ContentPublicationService Unit Tests', () => {
  describe('isValidContentType', () => {
    test('accepts allowed content types', () => {
      expect(ContentPublicationService.isValidContentType('banner')).toBe(true);
      expect(ContentPublicationService.isValidContentType('slider')).toBe(true);
      expect(ContentPublicationService.isValidContentType('page')).toBe(true);
      expect(ContentPublicationService.isValidContentType('blog')).toBe(true);
      expect(ContentPublicationService.isValidContentType(' BANNER ')).toBe(true);
    });

    test('rejects disallowed or invalid content types', () => {
      expect(ContentPublicationService.isValidContentType('product')).toBe(false);
      expect(ContentPublicationService.isValidContentType('order')).toBe(false);
      expect(ContentPublicationService.isValidContentType('')).toBe(false);
      expect(ContentPublicationService.isValidContentType(null)).toBe(false);
      expect(ContentPublicationService.isValidContentType(undefined)).toBe(false);
      expect(ContentPublicationService.isValidContentType(123)).toBe(false);
    });
  });

  describe('isValidSlug', () => {
    test('accepts valid slug formats', () => {
      expect(ContentPublicationService.isValidSlug('about-us')).toBe(true);
      expect(ContentPublicationService.isValidSlug('privacy-policy-2026')).toBe(true);
      expect(ContentPublicationService.isValidSlug('terms')).toBe(true);
      expect(ContentPublicationService.isValidSlug('faq-general')).toBe(true);
    });

    test('rejects invalid slug formats', () => {
      expect(ContentPublicationService.isValidSlug('')).toBe(false);
      expect(ContentPublicationService.isValidSlug(' ')).toBe(false);
      expect(ContentPublicationService.isValidSlug('About Us')).toBe(false);
      expect(ContentPublicationService.isValidSlug('about/us')).toBe(false);
      expect(ContentPublicationService.isValidSlug('about_us')).toBe(false);
      expect(ContentPublicationService.isValidSlug('-about')).toBe(false);
      expect(ContentPublicationService.isValidSlug('about-')).toBe(false);
      expect(ContentPublicationService.isValidSlug('about--us')).toBe(false);
      expect(ContentPublicationService.isValidSlug('a'.repeat(201))).toBe(false);
      expect(ContentPublicationService.isValidSlug(null)).toBe(false);
      expect(ContentPublicationService.isValidSlug(undefined)).toBe(false);
    });
  });

  describe('buildPublicationQuery', () => {
    const fixedNow = new Date('2026-06-15T12:00:00.000Z');

    test('builds query enforcing isActive: true and conjunction of start/end boundaries', () => {
      const query = ContentPublicationService.buildPublicationQuery({
        type: 'banner',
        referenceDate: fixedNow
      });

      expect(query.isActive).toBe(true);
      expect(query.type).toBe('banner');
      expect(query.$and).toBeDefined();
      expect(query.$and).toHaveLength(2);

      // Start condition: missing, null, or <= now
      expect(query.$and[0]).toEqual({
        $or: [
          { startDate: { $exists: false } },
          { startDate: null },
          { startDate: { $lte: fixedNow } }
        ]
      });

      // End condition: missing, null, or >= now
      expect(query.$and[1]).toEqual({
        $or: [
          { endDate: { $exists: false } },
          { endDate: null },
          { endDate: { $gte: fixedNow } }
        ]
      });
    });

    test('includes slug in query when provided', () => {
      const query = ContentPublicationService.buildPublicationQuery({
        type: 'page',
        slug: 'terms-and-conditions',
        referenceDate: fixedNow
      });

      expect(query.isActive).toBe(true);
      expect(query.type).toBe('page');
      expect(query.slug).toBe('terms-and-conditions');
    });

    test('falls back to current time if invalid referenceDate provided', () => {
      const before = new Date();
      const query = ContentPublicationService.buildPublicationQuery({ referenceDate: 'invalid-date' });
      const after = new Date();

      expect(query.$and[0].$or[2].startDate.$lte.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(query.$and[0].$or[2].startDate.$lte.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('validateSchedule', () => {
    test('allows valid date bounds where startDate <= endDate', () => {
      expect(() => {
        ContentPublicationService.validateSchedule({
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-12-31T23:59:59Z'
        });
      }).not.toThrow();

      expect(() => {
        ContentPublicationService.validateSchedule({
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-06-01')
        });
      }).not.toThrow();
    });

    test('allows open bounds (missing or null dates)', () => {
      expect(() => ContentPublicationService.validateSchedule({})).not.toThrow();
      expect(() => ContentPublicationService.validateSchedule({ startDate: null, endDate: null })).not.toThrow();
      expect(() => ContentPublicationService.validateSchedule({ startDate: '2026-01-01', endDate: null })).not.toThrow();
      expect(() => ContentPublicationService.validateSchedule({ startDate: null, endDate: '2026-12-31' })).not.toThrow();
    });

    test('throws error when startDate is after endDate', () => {
      expect(() => {
        ContentPublicationService.validateSchedule({
          startDate: '2026-12-31T00:00:00Z',
          endDate: '2026-01-01T00:00:00Z'
        });
      }).toThrow('startDate cannot be later than endDate');
    });

    test('throws error on invalid date formats', () => {
      expect(() => {
        ContentPublicationService.validateSchedule({ startDate: 'not-a-date' });
      }).toThrow('Invalid date format for startDate');

      expect(() => {
        ContentPublicationService.validateSchedule({ endDate: 'invalid-date-string' });
      }).toThrow('Invalid date format for endDate');
    });

    test('validates merged schedules on partial updates', () => {
      // Existing start 2026-06-01, new end 2026-05-01 -> Error
      expect(() => {
        ContentPublicationService.validateSchedule({
          endDate: '2026-05-01T00:00:00Z',
          existingStartDate: new Date('2026-06-01T00:00:00Z')
        });
      }).toThrow('startDate cannot be later than endDate');

      // Existing end 2026-06-01, new start 2026-07-01 -> Error
      expect(() => {
        ContentPublicationService.validateSchedule({
          startDate: '2026-07-01T00:00:00Z',
          existingEndDate: new Date('2026-06-01T00:00:00Z')
        });
      }).toThrow('startDate cannot be later than endDate');

      // Partial update with valid merge
      expect(() => {
        ContentPublicationService.validateSchedule({
          startDate: '2026-05-01T00:00:00Z',
          existingEndDate: new Date('2026-06-01T00:00:00Z')
        });
      }).not.toThrow();
    });
  });
});
