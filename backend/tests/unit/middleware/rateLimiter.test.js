const {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  resendVerificationLimiter,
  verifyEmailLimiter,
  mfaVerifyLimiter,
  invitationAcceptLimiter,
  parseRateLimitMax
} = require('../../../middleware/rateLimiter');
const {
  limiter,
  parseRateLimitMax: securityParseMax,
  parseRateLimitWindowMs
} = require('../../../middleware/security');

describe('rateLimiter middlewares and helper unit tests', () => {
  it('defines all dedicated authentication rate limiters', () => {
    expect(loginLimiter).toBeDefined();
    expect(registerLimiter).toBeDefined();
    expect(forgotPasswordLimiter).toBeDefined();
    expect(resetPasswordLimiter).toBeDefined();
    expect(resendVerificationLimiter).toBeDefined();
    expect(verifyEmailLimiter).toBeDefined();
    expect(mfaVerifyLimiter).toBeDefined();
    expect(invitationAcceptLimiter).toBeDefined();
    expect(limiter).toBeDefined();
  });

  describe('parseRateLimitMax and parseRateLimitWindowMs integer parsing bounds', () => {
    it('returns default when input is undefined, null, or empty string', () => {
      expect(parseRateLimitMax(undefined, 10)).toBe(10);
      expect(parseRateLimitMax(null, 10)).toBe(10);
      expect(parseRateLimitMax('', 10)).toBe(10);
      expect(securityParseMax(undefined, 100)).toBe(100);
      expect(parseRateLimitWindowMs(undefined, 900000)).toBe(900000);
    });

    it('returns default when input is non-numeric or NaN', () => {
      expect(parseRateLimitMax('invalid', 10)).toBe(10);
      expect(parseRateLimitMax('abc123', 10)).toBe(10);
      expect(parseRateLimitMax({}, 10)).toBe(10);
      expect(securityParseMax('NaN', 100)).toBe(100);
      expect(parseRateLimitWindowMs('not-a-number', 900000)).toBe(900000);
    });

    it('returns default when parsed value is below minVal', () => {
      expect(parseRateLimitMax('0', 10, 1)).toBe(10);
      expect(parseRateLimitMax('-50', 10, 1)).toBe(10);
      expect(parseRateLimitWindowMs('500', 900000, 1000)).toBe(900000);
    });

    it('caps values at maxVal when parsed value exceeds maximum', () => {
      expect(parseRateLimitMax('999999', 10, 1, 10000)).toBe(10000);
      expect(securityParseMax('50000', 100, 1, 10000)).toBe(10000);
      expect(parseRateLimitWindowMs('999999999', 900000, 1000, 86400000)).toBe(86400000);
    });

    it('parses valid integer strings within range', () => {
      expect(parseRateLimitMax('25', 10)).toBe(25);
      expect(securityParseMax('200', 100)).toBe(200);
      expect(parseRateLimitWindowMs('60000', 900000)).toBe(60000);
    });
  });
});
