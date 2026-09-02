const MfaService = require('../../services/MfaService');

describe('MfaService Unit Tests (TOTP RFC 6238 & Recovery Codes)', () => {
  describe('AES-256-GCM Secret Encryption & Decryption', () => {
    test('encrypts and decrypts a plain secret symmetrically', () => {
      const plainSecret = 'JBSWY3DPEHPK3PXP';
      const encrypted = MfaService.encryptSecret(plainSecret);

      expect(typeof encrypted).toBe('string');
      expect(encrypted).toContain(':');
      expect(encrypted).not.toEqual(plainSecret);

      const decrypted = MfaService.decryptSecret(encrypted);
      expect(decrypted).toBe(plainSecret);
    });

    test('fails closed with error on corrupted encrypted payload', () => {
      expect(() => {
        MfaService.decryptSecret('corrupted_payload');
      }).toThrow();
    });
  });

  describe('TOTP Generation & Verification', () => {
    test('generates valid base32 secret and otpauth URI with brand name', () => {
      const { secret, otpauthUri } = MfaService.generateSecret({
        accountEmail: 'admin@mevapur.test',
        issuer: 'MevaPur'
      });

      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThanOrEqual(16);
      expect(otpauthUri).toContain('otpauth://totp/MevaPur%3Aadmin%40mevapur.test');
      expect(otpauthUri).toContain(`secret=${secret}`);
      expect(otpauthUri).toContain('issuer=MevaPur');
    });

    test('computes predictable 6-digit TOTP and verifies successfully', () => {
      const { secret } = MfaService.generateSecret({ accountEmail: 'admin@test.com' });
      const currentTimestep = Math.floor(Date.now() / 1000 / 30);
      const token = MfaService.computeTotp(secret, currentTimestep);

      expect(token).toMatch(/^\d{6}$/);

      const verification = MfaService.verifyTotp({
        secret,
        token
      });

      expect(verification.valid).toBe(true);
      expect(verification.timestepUsed).toBe(currentTimestep);
    });

    test('accepts tokens within ±1 timestep window', () => {
      const { secret } = MfaService.generateSecret({ accountEmail: 'admin@test.com' });
      const currentTimestep = Math.floor(Date.now() / 1000 / 30);
      const pastToken = MfaService.computeTotp(secret, currentTimestep - 1);
      const futureToken = MfaService.computeTotp(secret, currentTimestep + 1);

      expect(MfaService.verifyTotp({ secret, token: pastToken, window: 1 }).valid).toBe(true);
      expect(MfaService.verifyTotp({ secret, token: futureToken, window: 1 }).valid).toBe(true);
    });

    test('rejects tokens outside the timestep window', () => {
      const { secret } = MfaService.generateSecret({ accountEmail: 'admin@test.com' });
      const currentTimestep = Math.floor(Date.now() / 1000 / 30);
      const wayPastToken = MfaService.computeTotp(secret, currentTimestep - 5);

      expect(MfaService.verifyTotp({ secret, token: wayPastToken, window: 1 }).valid).toBe(false);
    });

    test('prevents replay of the same timestep when lastUsedTimestep is supplied', () => {
      const { secret } = MfaService.generateSecret({ accountEmail: 'admin@test.com' });
      const currentTimestep = Math.floor(Date.now() / 1000 / 30);
      const token = MfaService.computeTotp(secret, currentTimestep);

      // First verification: should succeed
      const firstCheck = MfaService.verifyTotp({
        secret,
        token,
        lastUsedTimestep: currentTimestep - 1
      });
      expect(firstCheck.valid).toBe(true);

      // Second verification with current timestep as lastUsedTimestep: MUST FAIL (replay prevention)
      const secondCheck = MfaService.verifyTotp({
        secret,
        token,
        lastUsedTimestep: currentTimestep
      });
      expect(secondCheck.valid).toBe(false);
    });

    test('rejects invalid, malformed, or non-numeric tokens safely', () => {
      const { secret } = MfaService.generateSecret({ accountEmail: 'admin@test.com' });
      expect(MfaService.verifyTotp({ secret, token: '12345' }).valid).toBe(false);
      expect(MfaService.verifyTotp({ secret, token: 'abcdef' }).valid).toBe(false);
      expect(MfaService.verifyTotp({ secret, token: null }).valid).toBe(false);
      expect(MfaService.verifyTotp({ secret, token: '' }).valid).toBe(false);
    });
  });

  describe('Backup Recovery Codes', () => {
    test('generates exactly 8 formatted recovery codes with sha256 hashes', () => {
      const { plainCodes, hashedCodes } = MfaService.generateRecoveryCodes(8);

      expect(plainCodes).toHaveLength(8);
      expect(hashedCodes).toHaveLength(8);
      plainCodes.forEach((code) => {
        expect(code).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/);
      });
      hashedCodes.forEach((item) => {
        expect(item.hash).toHaveLength(64);
        expect(item.usedAt).toBeNull();
      });
    });

    test('verifies a valid recovery code once and marks it as used', () => {
      const { plainCodes, hashedCodes } = MfaService.generateRecoveryCodes(8);
      const codeToUse = plainCodes[0];

      const firstAttempt = MfaService.verifyRecoveryCode(hashedCodes, codeToUse);
      expect(firstAttempt.valid).toBe(true);
      expect(firstAttempt.updatedHashes[0].usedAt).toBeInstanceOf(Date);

      // Attempting to reuse the exact same code must fail
      const secondAttempt = MfaService.verifyRecoveryCode(firstAttempt.updatedHashes, codeToUse);
      expect(secondAttempt.valid).toBe(false);
    });

    test('rejects invalid or unknown recovery code safely', () => {
      const { hashedCodes } = MfaService.generateRecoveryCodes(8);
      const invalidAttempt = MfaService.verifyRecoveryCode(hashedCodes, 'AAAAA-BBBBB');
      expect(invalidAttempt.valid).toBe(false);
    });
  });
});
