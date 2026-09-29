const crypto = require('crypto');
const MfaService = require('../../../services/MfaService');
const { AppError } = require('../../../common/errors/AppError');

describe('MfaService AES-256-GCM Security & Authentication Tag Tests', () => {
  const sampleSecret = 'JBSWY3DPEHPK3PXP';

  describe('Encryption & Decryption Contract', () => {
    it('symmetrically encrypts and decrypts secret with valid 16-byte auth tag', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      expect(typeof encrypted).toBe('string');

      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      const [ivHex, authTagHex, cipherText] = parts;
      expect(Buffer.from(ivHex, 'hex')).toHaveLength(12);
      expect(Buffer.from(authTagHex, 'hex')).toHaveLength(16);
      expect(cipherText.length).toBeGreaterThan(0);

      const decrypted = MfaService.decryptSecret(encrypted);
      expect(decrypted).toBe(sampleSecret);
    });
  });

  describe('Authentication Tag Length & Truncation Defenses', () => {
    it('rejects truncated 8-byte authentication tags', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      const [ivHex, authTagHex, cipherText] = encrypted.split(':');
      const truncatedTagHex = authTagHex.slice(0, 16); // 8 bytes = 16 hex chars

      const tampered = `${ivHex}:${truncatedTagHex}:${cipherText}`;
      expect(() => MfaService.decryptSecret(tampered)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(tampered)).toThrow('Invalid MFA authentication tag length');
    });

    it('rejects truncated 12-byte authentication tags', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      const [ivHex, authTagHex, cipherText] = encrypted.split(':');
      const truncatedTagHex = authTagHex.slice(0, 24); // 12 bytes = 24 hex chars

      const tampered = `${ivHex}:${truncatedTagHex}:${cipherText}`;
      expect(() => MfaService.decryptSecret(tampered)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(tampered)).toThrow('Invalid MFA authentication tag length');
    });

    it('rejects truncated 15-byte authentication tags', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      const [ivHex, authTagHex, cipherText] = encrypted.split(':');
      const truncatedTagHex = authTagHex.slice(0, 30); // 15 bytes = 30 hex chars

      const tampered = `${ivHex}:${truncatedTagHex}:${cipherText}`;
      expect(() => MfaService.decryptSecret(tampered)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(tampered)).toThrow('Invalid MFA authentication tag length');
    });

    it('rejects oversized 20-byte or 32-byte authentication tags', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      const [ivHex, authTagHex, cipherText] = encrypted.split(':');
      const oversizedTagHex = authTagHex + '00112233'; // 20 bytes

      const tampered = `${ivHex}:${oversizedTagHex}:${cipherText}`;
      expect(() => MfaService.decryptSecret(tampered)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(tampered)).toThrow('Invalid MFA authentication tag length');
    });
  });

  describe('Integrity & Tampering Verification (GCM Authenticity)', () => {
    it('rejects tampered authentication tag bytes with authenticity failure', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      const [ivHex, authTagHex, cipherText] = encrypted.split(':');

      // Flip first byte of the auth tag
      const tagBuffer = Buffer.from(authTagHex, 'hex');
      tagBuffer[0] ^= 0xff;
      const tamperedTagHex = tagBuffer.toString('hex');

      const tampered = `${ivHex}:${tamperedTagHex}:${cipherText}`;
      expect(() => MfaService.decryptSecret(tampered)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(tampered)).toThrow('Failed to decrypt MFA secret');
    });

    it('rejects tampered ciphertext bytes with authenticity failure', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      const [ivHex, authTagHex, cipherText] = encrypted.split(':');

      // Flip byte of ciphertext
      const cipherBuffer = Buffer.from(cipherText, 'hex');
      cipherBuffer[0] ^= 0x01;
      const tamperedCipher = cipherBuffer.toString('hex');

      const tampered = `${ivHex}:${authTagHex}:${tamperedCipher}`;
      expect(() => MfaService.decryptSecret(tampered)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(tampered)).toThrow('Failed to decrypt MFA secret');
    });

    it('rejects tampered or invalid initialization vector (IV) lengths', () => {
      const encrypted = MfaService.encryptSecret(sampleSecret);
      const [ivHex, authTagHex, cipherText] = encrypted.split(':');
      const truncatedIvHex = ivHex.slice(0, 16); // 8 bytes instead of 12

      const tampered = `${truncatedIvHex}:${authTagHex}:${cipherText}`;
      expect(() => MfaService.decryptSecret(tampered)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(tampered)).toThrow('Invalid MFA initialization vector length');
    });
  });

  describe('Input Validation & Malformed Format Handling', () => {
    it('rejects malformed secret formats missing delimiter', () => {
      expect(() => MfaService.decryptSecret('malformed_no_colons')).toThrow(AppError);
      expect(() => MfaService.decryptSecret('part1:part2')).toThrow(AppError);
      expect(() => MfaService.decryptSecret('p1:p2:p3:p4')).toThrow(AppError);
    });

    it('rejects empty, null, or non-string secret inputs', () => {
      expect(() => MfaService.decryptSecret('')).toThrow(AppError);
      expect(() => MfaService.decryptSecret(null)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(undefined)).toThrow(AppError);
      expect(() => MfaService.decryptSecret(12345)).toThrow(AppError);
    });
  });
});
