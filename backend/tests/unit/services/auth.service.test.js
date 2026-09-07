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
  clearPasswordResetTokenConditionally: jest.fn(),
  setEmailVerificationToken: jest.fn(),
  findByValidEmailVerificationToken: jest.fn(),
  verifyEmailAndClearToken: jest.fn(),
  clearEmailVerificationTokenConditionally: jest.fn(),
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
  hashToken: jest.fn().mockImplementation(token => `hashed-${token}`),
}));
jest.mock('../../../services/AuditService', () => ({
  log: jest.fn(),
}));
jest.mock('../../../services/EmailService', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendVerificationEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
}));
let mockAutoVerify = true;
jest.mock('../../../config/auth.config', () => ({
  email: {
    get autoVerify() {
      return mockAutoVerify;
    }
  },
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

  describe('forgotPassword recovery routing and role security', () => {
    const EmailService = require('../../../services/EmailService');

    const rolesTable = [
      { role: 'customer', expectedAudience: 'storefront' },
      { role: 'admin', expectedAudience: 'admin' },
      { role: 'super_admin', expectedAudience: 'admin' },
      { role: 'support', expectedAudience: 'admin' },
      { role: 'inventory', expectedAudience: 'admin' },
      { role: 'manager', expectedAudience: 'admin' }
    ];

    beforeEach(() => {
      jest.clearAllMocks();
    });

    rolesTable.forEach(({ role, expectedAudience }) => {
      it(`maps role "${role}" to audience "${expectedAudience}" and sends email`, async () => {
        const user = makeUser({ email: `user-${role}@example.com`, role });
        UserRepository.findByEmail.mockResolvedValue(user);
        UserRepository.setPasswordResetToken.mockResolvedValue(user);
        EmailService.sendPasswordResetEmail.mockResolvedValue({ success: true });
        SessionService.hashToken.mockReturnValue('hashed-reset-token');

        const result = await AuthService.forgotPassword({
          email: user.email,
          requestId: 'request-forgot-role',
        });

        expect(result).toEqual({ success: true });
        expect(UserRepository.findByEmail).toHaveBeenCalledWith(user.email);
        expect(EmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
          user.email,
          user.fullName,
          expect.any(String),
          { audience: expectedAudience }
        );
      });
    });

    it('fails safely for an invalid or unknown role while keeping response account-neutral', async () => {
      const user = makeUser({ email: 'unknown-role@example.com', role: 'guest' });
      UserRepository.findByEmail.mockResolvedValue(user);

      const result = await AuthService.forgotPassword({
        email: user.email,
        requestId: 'request-forgot-invalid-role',
      });

      expect(result).toEqual({ success: true });
      expect(EmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'AUTH.PASSWORD.RESET.REQUEST',
          status: 'FAILURE',
          errorCode: ERROR_CODES.AUTH_ROLE_NOT_FOUND,
        })
      );
    });

    it('returns indistinguishable response for a non-existent email and logs warning', async () => {
      UserRepository.findByEmail.mockResolvedValue(null);

      const result = await AuthService.forgotPassword({
        email: 'not-exists@example.com',
        requestId: 'request-forgot-nonexistent',
      });

      expect(result).toEqual({ success: true });
      expect(EmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'AUTH.PASSWORD.RESET.REQUEST',
          status: 'WARNING',
        })
      );
    });

    it('performs conditional rollback when email delivery fails and clears matching token hash', async () => {
      const user = { _id: 'user-id', email: 'test@example.com', fullName: 'Test', role: 'admin' };
      UserRepository.findByEmail.mockResolvedValue(user);
      EmailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP connection timed out'));
      UserRepository.clearPasswordResetTokenConditionally.mockResolvedValue(user);
      SessionService.hashToken.mockReturnValue('mock-hash');

      const result = await AuthService.forgotPassword({
        email: user.email,
        requestId: 'request-forgot-fail'
      });

      expect(result).toEqual({ success: true });
      expect(UserRepository.clearPasswordResetTokenConditionally).toHaveBeenCalledWith(
        user._id,
        'mock-hash'
      );
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'AUTH.PASSWORD.RESET.REQUEST',
          status: 'FAILURE',
          errorCode: 'EMAIL_SEND_FAILED'
        })
      );
    });

    it('does not clear a newer concurrently created token if rollback target does not match', async () => {
      const user = { _id: 'user-id', email: 'test@example.com', fullName: 'Test', role: 'admin' };
      UserRepository.findByEmail.mockResolvedValue(user);
      EmailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP connection timed out'));
      UserRepository.clearPasswordResetTokenConditionally.mockResolvedValue(null);
      SessionService.hashToken.mockReturnValue('mock-hash');

      const result = await AuthService.forgotPassword({
        email: user.email,
        requestId: 'request-forgot-fail-concurrent'
      });

      expect(result).toEqual({ success: true });
      expect(UserRepository.clearPasswordResetTokenConditionally).toHaveBeenCalledWith(
        user._id,
        'mock-hash'
      );
    });
  });

  describe('email verification lifecycle', () => {
    const EmailService = require('../../../services/EmailService');

    beforeEach(() => {
      jest.clearAllMocks();
      SessionService.hashToken.mockImplementation(token => `hashed-${token}`);
      mockAutoVerify = false;
    });

    afterEach(() => {
      mockAutoVerify = true;
    });

    it('creates unverified user and dispatches verification email without issuing session tokens', async () => {
      const user = makeUser({ isVerified: false });
      UserRepository.findByEmail.mockResolvedValue(null);
      UserRepository.create.mockResolvedValue(user);
      UserRepository.setEmailVerificationToken.mockResolvedValue(user);
      EmailService.sendVerificationEmail.mockResolvedValue({ success: true });

      const result = await AuthService.register({
        fullName: 'Pending User',
        email: 'pending@example.com',
        password: 'Violet!9Mountain',
        redirect: '/checkout',
        requestId: 'request-pending-reg'
      });

      expect(UserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'pending@example.com',
          isVerified: false,
        })
      );
      expect(UserRepository.setEmailVerificationToken).toHaveBeenCalledWith(
        user._id,
        expect.any(String),
        expect.any(Date)
      );
      expect(EmailService.sendVerificationEmail).toHaveBeenCalledWith(
        user.email,
        user.fullName,
        expect.any(String),
        { redirect: '/checkout' }
      );
      expect(result).toEqual({
        user: expect.objectContaining({ email: user.email }),
        requiresEmailVerification: true,
        emailDeliveryFailed: false
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
      expect(SessionService.createSession).not.toHaveBeenCalled();
    });

    it('handles SMTP failure gracefully during pending registration keeping account recoverable', async () => {
      const user = makeUser({ isVerified: false });
      UserRepository.findByEmail.mockResolvedValue(null);
      UserRepository.create.mockResolvedValue(user);
      UserRepository.setEmailVerificationToken.mockResolvedValue(user);
      EmailService.sendVerificationEmail.mockRejectedValue(new Error('SMTP down'));

      const result = await AuthService.register({
        fullName: 'Pending User',
        email: 'pending@example.com',
        password: 'Violet!9Mountain',
        requestId: 'request-smtp-fail'
      });

      expect(result).toEqual({
        user: expect.objectContaining({ email: user.email }),
        requiresEmailVerification: true,
        emailDeliveryFailed: true
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(SessionService.createSession).not.toHaveBeenCalled();
    });

    it('successfully verifies email, revokes pre-verification sessions, increments tokenVersion, and sends welcome email', async () => {
      const user = makeUser({ isVerified: false });
      const verifiedUser = makeUser({ isVerified: true, tokenVersion: 1 });
      UserRepository.findByValidEmailVerificationToken.mockResolvedValue(user);
      UserRepository.verifyEmailAndClearToken.mockResolvedValue(verifiedUser);
      SessionService.revokeAllSessions.mockResolvedValue(2);
      EmailService.sendWelcomeEmail.mockResolvedValue({ success: true });

      const result = await AuthService.verifyEmail({
        token: 'plain-token-12345',
        requestId: 'request-verify'
      });

      expect(SessionService.hashToken).toHaveBeenCalledWith('plain-token-12345');
      expect(UserRepository.findByValidEmailVerificationToken).toHaveBeenCalledWith('hashed-plain-token-12345');
      expect(UserRepository.verifyEmailAndClearToken).toHaveBeenCalledWith(user._id, 'hashed-plain-token-12345');
      expect(SessionService.revokeAllSessions).toHaveBeenCalledWith(user._id, 'EMAIL_VERIFIED');
      expect(EmailService.sendWelcomeEmail).toHaveBeenCalledWith(verifiedUser.email, verifiedUser.fullName);
      expect(result.success).toBe(true);
      expect(result.user.isVerified).toBe(true);
    });

    it('rejects verification if token is invalid, expired or already consumed', async () => {
      UserRepository.findByValidEmailVerificationToken.mockResolvedValue(null);

      await expect(AuthService.verifyEmail({
        token: 'invalid-or-expired-token',
        requestId: 'request-verify-fail'
      })).rejects.toMatchObject({
        code: ERROR_CODES.AUTH_INVALID_TOKEN,
        statusCode: 400
      });
    });

    it('resends verification email, revokes sessions, and returns enumeration-neutral message for unverified user', async () => {
      const user = makeUser({ isVerified: false });
      UserRepository.findByEmail.mockResolvedValue(user);
      UserRepository.incrementTokenVersion.mockResolvedValue({ tokenVersion: 1 });
      SessionService.revokeAllSessions.mockResolvedValue(1);
      UserRepository.setEmailVerificationToken.mockResolvedValue(user);
      EmailService.sendVerificationEmail.mockResolvedValue({ success: true });

      const result = await AuthService.resendVerification({
        email: 'pending@example.com',
        redirect: '/checkout',
        requestId: 'request-resend'
      });

      expect(result).toEqual({
        success: true,
        message: 'If an unverified account exists with this email, a verification link has been sent.'
      });
      expect(UserRepository.incrementTokenVersion).toHaveBeenCalledWith(user._id);
      expect(SessionService.revokeAllSessions).toHaveBeenCalledWith(user._id, 'EMAIL_VERIFICATION_RESENT');
      expect(UserRepository.setEmailVerificationToken).toHaveBeenCalled();
      expect(EmailService.sendVerificationEmail).toHaveBeenCalledWith(
        user.email,
        user.fullName,
        expect.any(String),
        { redirect: '/checkout' }
      );
    });

    it('returns enumeration-neutral message for non-existent or already verified email without resending', async () => {
      UserRepository.findByEmail.mockResolvedValue(null);

      const nonExistentResult = await AuthService.resendVerification({
        email: 'nobody@example.com',
        requestId: 'request-resend-nobody'
      });

      expect(nonExistentResult.success).toBe(true);
      expect(EmailService.sendVerificationEmail).not.toHaveBeenCalled();

      const verifiedUser = makeUser({ isVerified: true });
      UserRepository.findByEmail.mockResolvedValue(verifiedUser);

      const verifiedResult = await AuthService.resendVerification({
        email: 'verified@example.com',
        requestId: 'request-resend-verified'
      });

      expect(verifiedResult.success).toBe(true);
      expect(EmailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
});
