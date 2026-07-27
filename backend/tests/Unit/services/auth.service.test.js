// Mock ALL dependencies before importing
jest.mock('../../../models/User');
jest.mock('../../../services/TokenService');
jest.mock('../../../services/SessionService');
jest.mock('../../../services/AuditService');
jest.mock('../../../repositories/AuditLogRepository');
jest.mock('../../../config/auth.config', () => ({
  passwordLockoutThreshold: 5,
  lockoutDuration: 3600000,
  cookies: { enabled: false }
}));

const AuthService = require('../../../services/AuthService');
const User = require('../../../models/User');
const TokenService = require('../../../services/TokenService');
const SessionService = require('../../../services/SessionService');
const AuditService = require('../../../services/AuditService');
const { AppError } = require('../../../common/errors/AppError');

describe('AuthService Unit Tests', () => {
  const mockUserData = {
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'SecurePass123!',
    phone: '03001234567'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user successfully', async () => {
      const mockUser = { 
        _id: 'user123', 
        ...mockUserData, 
        toJSON: () => ({ _id: 'user123', email: mockUserData.email }) 
      };
      
      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue(mockUser);
      
      TokenService.generateAccessToken.mockReturnValue('access_token');
      TokenService.generateRefreshToken.mockReturnValue('refresh_token');
      SessionService.createSession.mockResolvedValue({ _id: 'sess123' });

      const result = await AuthService.register(mockUserData);

      expect(User.findOne).toHaveBeenCalledWith({ email: mockUserData.email.toLowerCase() });
      expect(User.create).toHaveBeenCalled();
      expect(result.user).toBeDefined();
      expect(result.accessToken).toBe('access_token');
    });

    it('should throw error if user already exists', async () => {
      User.findOne.mockResolvedValue({ email: 'existing@example.com' });

      await expect(AuthService.register(mockUserData))
        .rejects
        .toThrow(AppError);
    });
  });

  describe('login', () => {
    it('should login successfully and create session', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'customer',
        isBlocked: false,
        matchPassword: jest.fn().mockResolvedValue(true),
        toJSON: () => ({ _id: 'user123', email: 'test@example.com' })
      };

      User.findOne.mockResolvedValue(mockUser);
      TokenService.generateAccessToken.mockReturnValue('access_token');
      TokenService.generateRefreshToken.mockReturnValue('refresh_token');
      SessionService.createSession.mockResolvedValue({ _id: 'sess123' });

      const result = await AuthService.login({ 
        email: 'test@example.com', 
        password: 'SecurePass123!',
        ipAddress: '127.0.0.1',
        userAgent: 'JestTest'
      });

      expect(mockUser.matchPassword).toHaveBeenCalledWith('SecurePass123!');
      expect(SessionService.createSession).toHaveBeenCalled();
      expect(result.accessToken).toBeDefined();
    });

    it('should throw error for blocked user', async () => {
      const blockedUser = { isBlocked: true, matchPassword: jest.fn() };
      User.findOne.mockResolvedValue(blockedUser);

      await expect(AuthService.login({ email: 'blocked@test.com', password: 'pass' }))
        .rejects
        .toThrow('Your account has been blocked');
    });
  });
});