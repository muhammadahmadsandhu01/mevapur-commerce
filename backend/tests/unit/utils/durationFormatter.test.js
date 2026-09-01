const { formatExpiryDuration } = require('../../../utils/durationFormatter');

describe('durationFormatter', () => {
  it('formats minutes with singular and plural units', () => {
    expect(formatExpiryDuration(15 * 60 * 1000)).toBe('15 minutes');
    expect(formatExpiryDuration(1 * 60 * 1000)).toBe('1 minute');
    expect(formatExpiryDuration(30 * 60 * 1000)).toBe('30 minutes');
  });

  it('formats hours with singular and plural units', () => {
    expect(formatExpiryDuration(1 * 60 * 60 * 1000)).toBe('1 hour');
    expect(formatExpiryDuration(2 * 60 * 60 * 1000)).toBe('2 hours');
    expect(formatExpiryDuration(24 * 60 * 60 * 1000)).toBe('1 day');
    expect(formatExpiryDuration(48 * 60 * 60 * 1000)).toBe('2 days');
  });

  it('formats seconds with singular and plural units', () => {
    expect(formatExpiryDuration(1000)).toBe('1 second');
    expect(formatExpiryDuration(45 * 1000)).toBe('45 seconds');
  });

  it('falls back safely for invalid, negative, or non-numeric inputs', () => {
    expect(formatExpiryDuration(null)).toBe('15 minutes');
    expect(formatExpiryDuration(undefined)).toBe('15 minutes');
    expect(formatExpiryDuration(-5000)).toBe('15 minutes');
    expect(formatExpiryDuration(NaN)).toBe('15 minutes');
    expect(formatExpiryDuration('invalid')).toBe('15 minutes');
  });
});
