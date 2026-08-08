jest.mock('../../../repositories/UserRepository', () => ({
  findByEmail: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  create: jest.fn(),
  resetFailedLogin: jest.fn(),
  recordFailedLogin: jest.fn(),
  updateLastLogin: jest.fn(),
  incrementTokenVersion: jest.fn(),
  findByIdWithTokenVersion: jest.fn(),
  findByValidPasswordResetToken: jest.fn(),
  findByIdWithPassword: jest.fn(),
  save: jest.fn(),
  setPasswordResetToken: jest.fn(),
}));
jest.mock('../../../services/TokenService', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  getAccessTokenExpiry: jest.fn(),
}));
jest.mock('../../../services/SessionService', () => ({
  createSessionId: jest.fn(),
  createSession: jest.fn(),
  assertRefreshSession: jest.fn(),
  rotateRefreshToken: jest.fn(),
  revokeOwnedSession: jest.fn(),
  revokeAllSessions: jest.fn(),
  getActiveSessions: jest.fn(),
  hashToken: jest.fn(),
}));
jest.mock('../../../services/AuditService', () => ({
  log: jest.fn(),
}));
jest.mock('../../../services/EmailService', () => ({
  sendPasswordResetEmail: jest.fn(),
}));
jest.mock('../../../config/auth.config', () => ({
  email: { autoVerify: true },
  security: {
    maxLoginAttempts: 5,
    lockoutDurationMs: 3600000,
    resetTokenExpiryMs: 900000,
  },
}));

const AuthService = require('../../../services/AuthService');
const UserRepository = require('../../../repositories/UserRepository');
const TokenService = require('../../../services/TokenService');
const SessionService = require('../../../services/SessionService');
const AuditService = require('../../../services/AuditService');
const { AppError } = require('../../../common/errors/AppError');
const ERROR_CODES = require('../../../constants/errorCodes');

const makeUser = (overrides = {}) => ({
  _id: '60d5ecb5c7f6a92c8c3e4f1b',
  fullName: 'Test User',
  email: 'test@example.com',
  role: 'customer',
  isVerified: true,
  isBlocked: false,
  isDeleted: false,
  tokenVersion: 0,
  loginAttempts: 0,
  lockUntil: null,
  isAccountLocked: jest.fn().mockReturnValue(false),
  matchPassword: jest.fn().mockResolvedValue(true),
  toJSON() {
    return {
      _id: this._id,
      fullName: this.fullName,
      email: this.email,
      role: this.role,
      isVerified: this.isVerified,
    };
  },
  ...overrides,
});

describe('AuthService', () => {
  beforeEach(() => {
    SessionService.createSessionId.mockReturnValue(
      '60d5ecb5c7f6a92c8c3e4f1c'
    );
    SessionService.createSession.mockResolvedValue({
      _id: '60d5ecb5c7f6a92c8c3e4f1c',
    });
    TokenService.generateAccessToken.mockReturnValue('access.jwt');
    TokenService.generateRefreshToken.mockReturnValue('refresh.jwt');
    TokenService.getAccessTokenExpiry.mockReturnValue('15m');
    AuditService.log.mockResolvedValue({});
  });

  it('registers through the repository and returns the canonical token shape', async () => {
    const user = makeUser();
    UserRepository.findByEmail.mockResolvedValue(null);
    UserRepository.create.mockResolvedValue(user);

    const result = await AuthService.register({
      fullName: user.fullName,
      email: user.email,
      password: 'Violet!9Mountain',
      phone: '03001234567',
      requestId: 'request-1',
    });

    expect(UserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'customer',
        isVerified: true,
      })
    );
    expect(result).toEqual(expect.objectContaining({
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      expiresIn: '15m',
    }));
    expect(result.user).not.toHaveProperty('tokenVersion');
  });

  it('rejects a duplicate registration with a stable code', async () => {
    UserRepository.findByEmail.mockResolvedValue(makeUser());

    await expect(AuthService.register({
      fullName: 'Duplicate User',
      email: 'test@example.com',
      password: 'Violet!9Mountain',
    })).rejects.toMatchObject({
      code: ERROR_CODES.AUTH_EMAIL_EXISTS,
      statusCode: 409,
    });
  });

  it('logs in with a session-bound access and refresh token', async () => {
    const user = makeUser();
    UserRepository.findByEmailWithPassword.mockResolvedValue(user);

    const result = await AuthService.login({
      email: user.email,
      password: 'Violet!9Mountain',
      requestId: 'request-2',
    });

    expect(user.matchPassword).toHaveBeenCalledWith('Violet!9Mountain');
    expect(SessionService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user._id,
        refreshToken: 'refresh.jwt',
      })
    );
    expect(result.accessToken).toBe('access.jwt');
    expect(result.refreshToken).toBe('refresh.jwt');
  });

  it('rejects a blocked user before password verification', async () => {
    const user = makeUser({ isBlocked: true });
    UserRepository.findByEmailWithPassword.mockResolvedValue(user);

    try {
      await AuthService.login({
        email: user.email,
        password: 'Violet!9Mountain',
      });
      throw new Error('Expected login to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ERROR_CODES.AUTH_ACCOUNT_BLOCKED);
      expect(user.matchPassword).not.toHaveBeenCalled();
    }
  });

  it('increments tokenVersion and revokes every session on logout-all', async () => {
    UserRepository.incrementTokenVersion.mockResolvedValue({ tokenVersion: 2 });
    SessionService.revokeAllSessions.mockResolvedValue(3);

    const result = await AuthService.logoutAll({
      userId: '60d5ecb5c7f6a92c8c3e4f1b',
      requestId: 'request-3',
    });

    expect(UserRepository.incrementTokenVersion).toHaveBeenCalled();
    expect(SessionService.revokeAllSessions).toHaveBeenCalledWith(
      '60d5ecb5c7f6a92c8c3e4f1b',
      'USER_LOGOUT_ALL'
    );
    expect(result.sessionsRevoked).toBe(3);
  });

  it('validates and atomically rotates the refresh-token hash', async () => {
    const user = makeUser({ tokenVersion: 2 });
    TokenService.verifyRefreshToken.mockReturnValue({
      sub: user._id,
      sid: '60d5ecb5c7f6a92c8c3e4f1c',
      tokenVersion: 2,
      tokenFamilyId: 'family-1',
    });
    UserRepository.findByIdWithTokenVersion.mockResolvedValue(user);

    const result = await AuthService.refreshTokens({
      refreshToken: 'old-refresh.jwt',
      requestId: 'request-4',
    });

    expect(SessionService.assertRefreshSession).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'old-refresh.jwt' })
    );
    expect(SessionService.rotateRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        currentRefreshToken: 'old-refresh.jwt',
        nextRefreshToken: 'refresh.jwt',
      })
    );
    expect(result.accessToken).toBe('access.jwt');
  });
});
