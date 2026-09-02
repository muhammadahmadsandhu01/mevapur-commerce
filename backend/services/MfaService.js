const crypto = require('crypto');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

// Base32 alphabet according to RFC 4648
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input) {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue; // Skip invalid or padding chars

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

class MfaService {
  getEncryptionKey() {
    const rawKey = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'mevapur-dev-fallback-encryption-key-32bytes!';
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  encryptSecret(plainSecret) {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decryptSecret(encryptedSecret) {
    if (!encryptedSecret || typeof encryptedSecret !== 'string') {
      throw new AppError('Invalid MFA secret format', 500, ERROR_CODES.INTERNAL_SERVER_ERROR);
    }

    const parts = encryptedSecret.split(':');
    if (parts.length !== 3) {
      throw new AppError('Invalid MFA secret payload', 500, ERROR_CODES.INTERNAL_SERVER_ERROR);
    }

    const [ivHex, authTagHex, cipherText] = parts;
    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  generateSecret({ accountEmail, issuer = 'MevaPur' }) {
    const randomBytes = crypto.randomBytes(20);
    const secret = base32Encode(randomBytes);
    const label = encodeURIComponent(`${issuer}:${accountEmail}`);
    const encodedIssuer = encodeURIComponent(issuer);
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    return {
      secret,
      otpauthUri
    };
  }

  computeTotp(secret, timeStep) {
    const key = base32Decode(secret);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(timeStep));

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(timeBuffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return String(otp).padStart(6, '0');
  }

  verifyTotp({ secret, token, lastUsedTimestep = null, window = 1 }) {
    if (!token || typeof token !== 'string') return { valid: false };

    const sanitizedToken = token.trim();
    if (!/^\d{6}$/.test(sanitizedToken)) return { valid: false };

    const currentTimestep = Math.floor(Date.now() / 1000 / 30);

    // Check window [-window, +window]
    for (let stepOffset = -window; stepOffset <= window; stepOffset++) {
      const step = currentTimestep + stepOffset;

      // Replay prevention: do not allow a timestep less than or equal to lastUsedTimestep
      if (lastUsedTimestep !== null && step <= lastUsedTimestep) {
        continue;
      }

      const expectedOtp = this.computeTotp(secret, step);
      if (crypto.timingSafeEqual(Buffer.from(sanitizedToken), Buffer.from(expectedOtp))) {
        return {
          valid: true,
          timestepUsed: step
        };
      }
    }

    return { valid: false };
  }

  generateRecoveryCodes(count = 8) {
    const plainCodes = [];
    const hashedCodes = [];

    for (let i = 0; i < count; i++) {
      const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
      const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
      const hash = crypto.createHash('sha256').update(formatted).digest('hex');

      plainCodes.push(formatted);
      hashedCodes.push({
        hash,
        usedAt: null
      });
    }

    return {
      plainCodes,
      hashedCodes
    };
  }

  verifyRecoveryCode(recoveryCodeHashes, inputCode) {
    if (!inputCode || typeof inputCode !== 'string' || !Array.isArray(recoveryCodeHashes)) {
      return { valid: false, updatedHashes: recoveryCodeHashes };
    }

    const normalizedInput = inputCode.trim().toUpperCase();
    const inputHash = crypto.createHash('sha256').update(normalizedInput).digest('hex');

    let matched = false;
    const updatedHashes = recoveryCodeHashes.map((item) => {
      if (!matched && !item.usedAt && item.hash === inputHash) {
        matched = true;
        return {
          hash: item.hash,
          usedAt: new Date()
        };
      }
      return item;
    });

    return {
      valid: matched,
      updatedHashes
    };
  }
}

module.exports = new MfaService();
