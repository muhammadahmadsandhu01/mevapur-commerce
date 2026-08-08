const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

jest.mock('jsonwebtoken');
jest.mock('uuid');
jest.mock('../../../config/auth.config', () => ({
  jwtSecret: 'test-secret-key-for-unit-tests-only',
  jwtIssuer: 'MevaPur-Test',
  jwtAudience: 'mevapur-users',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d'
}));

const TokenService = require('../../../services/TokenService');
const User = require('../../../models/User');
const { AppError } = require('../../../common/errors/AppError');

describe('TokenService Unit Tests', () => {
  const testUserId = '60d5ecb5c7f6a92c8c3e4f1b';
  const testSessionId = 'sess_123456';
  
  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValue('mock-uuid-12345');
  });

  describe('generateAccessToken', () => {
    it('should generate valid JWT token with correct claims', () => {
      const mockToken = 'mock.jwt.token';
      jwt.sign.mockReturnValue(mockToken);

      const token = TokenService.generateAccessToken(testUserId, testSessionId);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: testUserId,
          sid: testSessionId,
          jti: 'mock-uuid-12345',
          ver: 0,
          type: 'access'
        }),
        'test-secret-key-for-unit-tests-only',
        expect.objectContaining({
          expiresIn: '15m',
          issuer: 'MevaPur-Test',
          audience: 'mevapur-users'
        })
      );

      expect(token).toBe(mockToken);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token and return decoded payload', () => {
      const mockDecoded = { sub: testUserId, sid: testSessionId };
      jwt.verify.mockReturnValue(mockDecoded);

      const result = TokenService.verifyToken('valid.token.here');

      expect(jwt.verify).toHaveBeenCalled();
      expect(result).toEqual(mockDecoded);
    });

    it('should throw AppError for expired token', () => {
      const expiredError = new jwt.TokenExpiredError('Token expired', new Date());
      jwt.verify.mockImplementation(() => { throw expiredError; });

      expect(() => TokenService.verifyToken('expired.token')).toThrow(AppError);
      expect(() => TokenService.verifyToken('expired.token')).toThrow('Token has expired');
    });

    it('should throw AppError for invalid token', () => {
      const invalidError = new jwt.JsonWebTokenError('Invalid token');
      jwt.verify.mockImplementation(() => { throw invalidError; });

      expect(() => TokenService.verifyToken('invalid.token')).toThrow(AppError);
      expect(() => TokenService.verifyToken('invalid.token')).toThrow('Invalid token');
    });
  });

  describe('rotateToken', () => {
    it('should increment token version and save user', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockUser = {
        _id: testUserId,
        tokenVersion: 0,
        save: mockSave
      };
      
      const mockQuery = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockUser)
      };

      User.findById = jest.fn().mockReturnValue(mockQuery);

      const result = await TokenService.rotateToken(testUserId, 'dummy-session');

      expect(User.findById).toHaveBeenCalledWith(testUserId);
      expect(mockSave).toHaveBeenCalledWith({ session: 'dummy-session' });
      expect(result).toBe(1);
    });
  });
});