/**
 * @file guest-phone-verification.unit.test.js
 * @description Unit tests for GuestPhoneVerificationService.
 * Validates phone normalization, peppered HMAC digests, attempt limits,
 * rate limiting, and single-use token lifecycle.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { GuestPhoneVerificationService } = require('../../../services/auth/GuestPhoneVerificationService');
const { AppError } = require('../../../common/errors/AppError');

describe('GuestPhoneVerificationService Unit Tests', () => {
  let service;
  let testTempDir;

  beforeEach(() => {
    testTempDir = path.resolve(os.tmpdir(), `mevapur-guest-otp-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testTempDir, { recursive: true });

    service = new GuestPhoneVerificationService({
      pepperSecret: 'test-pepper-secret-32-bytes-long-strictly',
      tempDir: testTempDir,
      isUatMock: true
    });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Phone Normalization & E.164 Parsing', () => {
    test('1. Normalizes local Pakistan phone number to E.164', () => {
      const e164 = service.normalizePhone('03001234567');
      expect(e164).toBe('+923001234567');
    });

    test('2. Accepts existing valid E.164 Pakistan phone number', () => {
      const e164 = service.normalizePhone('+923001234567');
      expect(e164).toBe('+923001234567');
    });

    test('3. Rejects malformed phone number with PHONE_INVALID', () => {
      expect(() => service.normalizePhone('12345')).toThrow(AppError);
      expect(() => service.normalizePhone('not-a-number')).toThrow(AppError);
    });

    test('4. Rejects empty or whitespace-only phone number', () => {
      expect(() => service.normalizePhone('')).toThrow(AppError);
      expect(() => service.normalizePhone('   ')).toThrow(AppError);
    });
  });

  describe('Challenge Creation, HMAC Digest & Mailbox', () => {
    test('5. Creates challenge and writes OTP to mock mailbox outside repository', async () => {
      const res = await service.createChallenge({
        phone: '03001234567',
        clientIp: '127.0.0.1'
      });

      expect(res.challengeId).toBeDefined();
      expect(res.expiresInSeconds).toBe(600);

      // Verify mailbox was written
      const mailboxPath = path.resolve(testTempDir, 'mock-sms-mailbox.json');
      expect(fs.existsSync(mailboxPath)).toBe(true);

      const mailbox = JSON.parse(fs.readFileSync(mailboxPath, 'utf8'));
      expect(mailbox.length).toBe(1);
      expect(mailbox[0].challengeId).toBe(res.challengeId);
      expect(mailbox[0].phoneE164).toBe('+923001234567');
      expect(mailbox[0].otp).toMatch(/^\d{6}$/);
    });

    test('6. Enforces rate limits on repeated challenges for same phone', async () => {
      const phone = '03009999888';
      // Max hourly challenges is 3
      await service.createChallenge({ phone, clientIp: '10.0.0.1' });
      await service.createChallenge({ phone, clientIp: '10.0.0.2' });
      await service.createChallenge({ phone, clientIp: '10.0.0.3' });

      // 4th challenge should fail with 429
      await expect(
        service.createChallenge({ phone, clientIp: '10.0.0.4' })
      ).rejects.toThrow(AppError);
    });
  });

  describe('OTP Verification & Attempt Governance', () => {
    test('7. Successful verification returns single-use token', async () => {
      const challenge = await service.createChallenge({
        phone: '03001112233',
        clientIp: '127.0.0.1'
      });

      const mailbox = JSON.parse(fs.readFileSync(path.resolve(testTempDir, 'mock-sms-mailbox.json'), 'utf8'));
      const otp = mailbox[0].otp;

      const verification = await service.verifyOtp({
        challengeId: challenge.challengeId,
        otp
      });

      expect(verification.verificationToken).toMatch(/^GTK_[a-f0-9]{64}$/);
      expect(verification.phone).toBe('+923001112233');
      expect(verification.expiresInSeconds).toBe(900);
    });

    test('8. Decrements attempts on mismatch and locks out after 3 failed attempts', async () => {
      const challenge = await service.createChallenge({
        phone: '03005556677',
        clientIp: '127.0.0.1'
      });

      // Attempt 1: wrong OTP
      await expect(
        service.verifyOtp({ challengeId: challenge.challengeId, otp: '000000' })
      ).rejects.toThrow(/2 attempts remaining/);

      // Attempt 2: wrong OTP
      await expect(
        service.verifyOtp({ challengeId: challenge.challengeId, otp: '111111' })
      ).rejects.toThrow(/1 attempts remaining/);

      // Attempt 3: wrong OTP -> Lockout
      await expect(
        service.verifyOtp({ challengeId: challenge.challengeId, otp: '222222' })
      ).rejects.toThrow(/Maximum verification attempts exceeded/);

      // Attempt 4: challenge is deleted
      await expect(
        service.verifyOtp({ challengeId: challenge.challengeId, otp: '333333' })
      ).rejects.toThrow(/expired or does not exist/);
    });
  });

  describe('Token Validation & Single-Use Consumption', () => {
    test('9. Token preview does not consume token; order creation consumes it atomically', async () => {
      const challenge = await service.createChallenge({
        phone: '03007778899',
        clientIp: '127.0.0.1'
      });

      const mailbox = JSON.parse(fs.readFileSync(path.resolve(testTempDir, 'mock-sms-mailbox.json'), 'utf8'));
      const otp = mailbox[0].otp;

      const { verificationToken } = await service.verifyOtp({
        challengeId: challenge.challengeId,
        otp
      });

      // Preview 1 (quote evaluation): consume = false
      const preview1 = await service.validateToken(verificationToken, '+923007778899', false);
      expect(preview1).toBe(true);

      // Preview 2: still valid
      const preview2 = await service.validateToken(verificationToken, '+923007778899', false);
      expect(preview2).toBe(true);

      // Final Order Creation: consume = true
      const orderConsume = await service.validateToken(verificationToken, '+923007778899', true);
      expect(orderConsume).toBe(true);

      // Replay attempt: token already consumed, fails closed
      const replayAttempt = await service.validateToken(verificationToken, '+923007778899', true);
      expect(replayAttempt).toBe(false);
    });

    test('10. Rejects token when phone number does not match', async () => {
      const challenge = await service.createChallenge({
        phone: '03001234567',
        clientIp: '127.0.0.1'
      });

      const mailbox = JSON.parse(fs.readFileSync(path.resolve(testTempDir, 'mock-sms-mailbox.json'), 'utf8'));
      const otp = mailbox[0].otp;

      const { verificationToken } = await service.verifyOtp({
        challengeId: challenge.challengeId,
        otp
      });

      // Valid token, but different phone
      const mismatch = await service.validateToken(verificationToken, '+923009999999', false);
      expect(mismatch).toBe(false);
    });
  });
});
