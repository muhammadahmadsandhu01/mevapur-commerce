module.exports = {
  jwt: {
    accessExpiry: process.env.JWT_ACCESS_EXPIRE || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRE || '7d',
    issuer: process.env.JWT_ISSUER || 'mevapur-auth',
    audience: process.env.JWT_AUDIENCE || 'mevapur-users'
  },
  cookies: {
    enabled: process.env.COOKIE_AUTH_ENABLED === 'true',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    accessExpiry: parseInt(process.env.JWT_ACCESS_EXPIRE) || 15 * 60,
    refreshExpiry: parseInt(process.env.JWT_REFRESH_EXPIRE) || 7 * 24 * 60 * 60
  },
  security: {
    maxLoginAttempts: 5,
    lockoutDurationMs: 60 * 60 * 1000, // 1 hour
    passwordMinLength: 12,
    resetTokenExpiryMs: 15 * 60 * 1000 // 15 minutes
  },
  email: {
    from: process.env.EMAIL_FROM || 'MevaPur <noreply@mevapur.com>',
    verificationSubject: 'Verify Your MevaPur Account',
    resetSubject: 'Password Reset Request'
  }
};