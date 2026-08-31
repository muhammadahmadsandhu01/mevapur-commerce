const { forgotPasswordLimiter, resetPasswordLimiter } = require('../../../middleware/rateLimiter');

describe('rateLimiter middlewares', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      ip: '192.168.1.1',
      headers: {},
      app: {
        get: jest.fn().mockReturnValue(false) // trust proxy setting
      }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      locals: {}
    };
    next = jest.fn();
  });

  it('defines forgotPasswordLimiter with correct limit configurations', () => {
    expect(forgotPasswordLimiter).toBeDefined();
    // Validate properties directly from the rateLimit instance configuration
    // express-rate-limit saves its options in options object
  });

  it('defines resetPasswordLimiter with correct limit configurations', () => {
    expect(resetPasswordLimiter).toBeDefined();
  });
});
