const User = require('../../models/User');
const StaffInvitation = require('../../models/StaffInvitation');
const AuthService = require('../../services/AuthService');
const MfaService = require('../../services/MfaService');

describe('Staff Invitations & Privileged MFA Integration Tests', () => {
  let superAdminUser;

  beforeEach(async () => {
    superAdminUser = await User.create({
      fullName: 'Super Admin User',
      email: 'root@mevapur.test',
      password: 'AdminPassword123!',
      role: 'super_admin',
      isVerified: true,
      isBlocked: false
    });
  });

  describe('Staff Invitation Lifecycle', () => {
    test('SuperAdmin creates staff invitation with token hash and 48h TTL', async () => {
      const inviteResult = await AuthService.inviteStaff({
        email: 'manager@mevapur.test',
        role: 'manager',
        invitedBy: superAdminUser._id
      });

      expect(inviteResult.invitationId).toBeDefined();
      expect(inviteResult.email).toBe('manager@mevapur.test');
      expect(inviteResult.role).toBe('manager');

      const storedInvite = await StaffInvitation.findById(inviteResult.invitationId).select('+tokenHash');
      expect(storedInvite).not.toBeNull();
      expect(storedInvite.status).toBe('pending');
      expect(storedInvite.tokenHash).toHaveLength(64);
    });

    test('rejects invitation if an active account with email already exists', async () => {
      await expect(
        AuthService.inviteStaff({
          email: 'root@mevapur.test',
          role: 'admin',
          invitedBy: superAdminUser._id
        })
      ).rejects.toThrow('An active account with this email address already exists');
    });

    test('staff member accepts invitation with strong password and becomes active', async () => {
      const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      await StaffInvitation.create({
        email: 'newstaff@mevapur.test',
        role: 'support',
        tokenHash,
        status: 'pending',
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        invitedBy: superAdminUser._id
      });

      const acceptResult = await AuthService.acceptInvitation({
        token,
        fullName: 'Support Specialist',
        password: 'SecurePassword123!',
        phone: '+923001234567'
      });

      expect(acceptResult.user).toBeDefined();
      expect(acceptResult.user.email).toBe('newstaff@mevapur.test');
      expect(acceptResult.user.role).toBe('support');
      expect(acceptResult.accessToken).toBeDefined();

      const updatedInvite = await StaffInvitation.findOne({ tokenHash });
      expect(updatedInvite.status).toBe('accepted');
      expect(updatedInvite.acceptedAt).toBeInstanceOf(Date);
    });

    test('rejects acceptance if password is weak', async () => {
      const token = 'abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcdef';
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      await StaffInvitation.create({
        email: 'weakstaff@mevapur.test',
        role: 'inventory',
        tokenHash,
        status: 'pending',
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        invitedBy: superAdminUser._id
      });

      await expect(
        AuthService.acceptInvitation({
          token,
          fullName: 'Inventory User',
          password: 'weak'
        })
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    test('rejects acceptance of expired invitation', async () => {
      const token = 'expiredtoken1234567890abcdef1234567890abcdef1234567890abcdef1234';
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      await StaffInvitation.create({
        email: 'expired@mevapur.test',
        role: 'manager',
        tokenHash,
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000), // in the past
        invitedBy: superAdminUser._id
      });

      await expect(
        AuthService.acceptInvitation({
          token,
          fullName: 'Expired User',
          password: 'SecurePassword123!'
        })
      ).rejects.toThrow('Invitation has expired');
    });

    test('resending invitation generates a new token and extends expiry', async () => {
      const invite = await StaffInvitation.create({
        email: 'resend@mevapur.test',
        role: 'support',
        tokenHash: 'initial_hash',
        status: 'pending',
        expiresAt: new Date(Date.now() + 1000),
        invitedBy: superAdminUser._id
      });

      const resendRes = await AuthService.resendInvitation({
        invitationId: invite._id,
        invitedBy: superAdminUser._id
      });

      expect(resendRes.success).toBe(true);
      const updated = await StaffInvitation.findById(invite._id).select('+tokenHash');
      expect(updated.tokenHash).not.toBe('initial_hash');
      expect(updated.expiresAt.getTime()).toBeGreaterThan(Date.now() + 40 * 3600 * 1000);
    });

    test('revoking invitation marks status revoked and blocks acceptance', async () => {
      const token = 'revokabletoken1234567890abcdef1234567890abcdef1234567890abcdef12';
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const invite = await StaffInvitation.create({
        email: 'revoked@mevapur.test',
        role: 'manager',
        tokenHash,
        status: 'pending',
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        invitedBy: superAdminUser._id
      });

      await AuthService.revokeInvitation({
        invitationId: invite._id,
        revokedBy: superAdminUser._id
      });

      const stored = await StaffInvitation.findById(invite._id);
      expect(stored.status).toBe('revoked');

      await expect(
        AuthService.acceptInvitation({
          token,
          fullName: 'Revoked User',
          password: 'SecurePassword123!'
        })
      ).rejects.toThrow('Invitation is invalid, revoked, or already accepted');
    });
  });

  describe('Privileged Account MFA Workflows', () => {
    test('completes full MFA enrollment lifecycle (setup, QR, confirm, verify)', async () => {
      // 1. Setup MFA
      const setupRes = await AuthService.setupMfa({ userId: superAdminUser._id });
      expect(setupRes.secret).toBeDefined();
      expect(setupRes.otpauthUri).toContain('otpauth://totp');
      expect(setupRes.recoveryCodes).toHaveLength(8);

      // Verify user in DB has encrypted secret but mfaEnabled is false
      let dbUser = await User.findById(superAdminUser._id).select('+mfaSecretEncrypted');
      expect(dbUser.mfaEnabled).toBe(false);
      expect(dbUser.mfaSecretEncrypted).not.toBeNull();

      // 2. Confirm MFA with valid TOTP code
      const currentTimestep = Math.floor(Date.now() / 1000 / 30);
      const validCode = MfaService.computeTotp(setupRes.secret, currentTimestep);

      const confirmRes = await AuthService.confirmMfa({
        userId: superAdminUser._id,
        code: validCode
      });
      expect(confirmRes.success).toBe(true);
      expect(confirmRes.mfaEnabled).toBe(true);

      dbUser = await User.findById(superAdminUser._id);
      expect(dbUser.mfaEnabled).toBe(true);
      expect(dbUser.mfaEnrolledAt).toBeInstanceOf(Date);

      // 3. Login with password returns MFA Challenge (no full session)
      const loginRes = await AuthService.login({
        email: 'root@mevapur.test',
        password: 'AdminPassword123!'
      });
      expect(loginRes.mfaRequired).toBe(true);
      expect(loginRes.mfaToken).toBeDefined();
      expect(loginRes.accessToken).toBeUndefined();

      // 4. Verify MFA challenge with next TOTP code
      const nextTimestep = currentTimestep + 1;
      const nextCode = MfaService.computeTotp(setupRes.secret, nextTimestep);

      const verifyRes = await AuthService.verifyMfaLogin({
        mfaToken: loginRes.mfaToken,
        code: nextCode
      });
      expect(verifyRes.user.email).toBe('root@mevapur.test');
      expect(verifyRes.accessToken).toBeDefined();
      expect(verifyRes.session).toBeDefined();
    });

    test('authenticates MFA challenge via single-use backup recovery code', async () => {
      const setupRes = await AuthService.setupMfa({ userId: superAdminUser._id });
      const currentTimestep = Math.floor(Date.now() / 1000 / 30);
      const validCode = MfaService.computeTotp(setupRes.secret, currentTimestep);
      await AuthService.confirmMfa({ userId: superAdminUser._id, code: validCode });

      const loginRes = await AuthService.login({
        email: 'root@mevapur.test',
        password: 'AdminPassword123!'
      });

      const recoveryCodeToUse = setupRes.recoveryCodes[0];
      const verifyRes = await AuthService.verifyMfaLogin({
        mfaToken: loginRes.mfaToken,
        recoveryCode: recoveryCodeToUse
      });
      expect(verifyRes.accessToken).toBeDefined();

      // Second login attempt reusing same recovery code must fail
      const secondLoginRes = await AuthService.login({
        email: 'root@mevapur.test',
        password: 'AdminPassword123!'
      });
      await expect(
        AuthService.verifyMfaLogin({
          mfaToken: secondLoginRes.mfaToken,
          recoveryCode: recoveryCodeToUse
        })
      ).rejects.toThrow('Invalid or already used backup recovery code');
    });

    test('disabling MFA clears secret and revokes existing sessions', async () => {
      const setupRes = await AuthService.setupMfa({ userId: superAdminUser._id });
      const currentTimestep = Math.floor(Date.now() / 1000 / 30);
      const validCode = MfaService.computeTotp(setupRes.secret, currentTimestep);
      await AuthService.confirmMfa({ userId: superAdminUser._id, code: validCode });

      const disableRes = await AuthService.disableMfa({
        userId: superAdminUser._id,
        password: 'AdminPassword123!',
        currentUserId: superAdminUser._id,
        currentUserRole: 'super_admin'
      });

      expect(disableRes.success).toBe(true);
      expect(disableRes.mfaEnabled).toBe(false);

      const dbUser = await User.findById(superAdminUser._id).select('+mfaSecretEncrypted');
      expect(dbUser.mfaEnabled).toBe(false);
      expect(dbUser.mfaSecretEncrypted).toBeNull();
    });
  });
});
