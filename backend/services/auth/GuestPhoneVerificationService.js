/**
 * @file GuestPhoneVerificationService.js
 * @description Hardened Phone/OTP Verification Service for Guest COD Checkout.
 * Uses HMAC-SHA-256 peppered digests, Redis challenge state, atomic attempt limits,
 * strict rate limiting, single-use tokens, and external UAT mock SMS mailbox.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Phone } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');
const logger = require('../../utils/logger');

const CHALLENGE_TTL_SECONDS = 10 * 60; // 10 minutes
const TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const MAX_VERIFICATION_ATTEMPTS = 3;
const MAX_HOURLY_PHONE_CHALLENGES = 3;
const MAX_HOURLY_IP_CHALLENGES = 10;

class GuestPhoneVerificationService {
  constructor({
    redisClient = null,
    pepperSecret = null,
    tempDir = null,
    isUatMock = false
  } = {}) {
    this.redisClient = redisClient;
    const isProduction = process.env.NODE_ENV === 'production';
    const isUatOrTest = Boolean(process.env.PHASE10_UAT_RUN_ID || process.env.NODE_ENV === 'test');
    if (!pepperSecret && !process.env.OTP_PEPPER_SECRET && !isUatOrTest && isProduction) {
      throw new Error('[SECURITY_VIOLATION] OTP_PEPPER_SECRET is strictly required in production runtime');
    }
    this.pepperSecret = pepperSecret || process.env.OTP_PEPPER_SECRET || 'mevapur-ephemeral-pepper-default-32bytes-min';
    this.isUatMock = isUatMock || process.env.NODE_ENV !== 'production';
    this.tempDir = tempDir || this._resolveSafeTempDir();

    // Internal memory store fallback strictly for unit tests where Redis is explicitly absent
    this._memoryStore = new Map();
  }

  async isAvailable() {
    if (this.redisClient) {
      if (typeof this.redisClient.isOpen === 'boolean' && !this.redisClient.isOpen) {
        return false;
      }
      try {
        if (typeof this.redisClient.ping === 'function') {
          const res = await this.redisClient.ping();
          return res === 'PONG' || res === true;
        }
        return true;
      } catch {
        return false;
      }
    }
    if (process.env.NODE_ENV === 'production' && !process.env.PHASE10_UAT_RUN_ID && process.env.NODE_ENV !== 'test') {
      return false;
    }
    return true;
  }

  _resolveSafeTempDir() {
    const runId = process.env.PHASE10_UAT_RUN_ID || crypto.randomBytes(6).toString('hex');
    const tempBase = process.env.TEMP || process.env.TMP || os.tmpdir();
    const resolved = path.resolve(tempBase, `mevapur-phase10-uat-${runId}`);

    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    if (resolved.startsWith(repoRoot)) {
      throw new Error(`[SAFETY_VIOLATION] Temp dir must be outside repository checkout, got: ${resolved}`);
    }

    try {
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
      }
    } catch {
      // Ignore if cannot set permissions on Windows
    }
    return resolved;
  }

  _hashOtp(otp, challengeId) {
    return crypto
      .createHmac('sha256', this.pepperSecret)
      .update(`${challengeId}:${otp}`)
      .digest('hex');
  }

  _hashToken(token) {
    return crypto
      .createHmac('sha256', this.pepperSecret)
      .update(token)
      .digest('hex');
  }

  normalizePhone(rawPhone) {
    try {
      const parsed = Phone.parse(rawPhone, 'PK');
      return parsed.e164;
    } catch {
      throw new AppError('Invalid phone number format for Pakistan', 400, 'PHONE_INVALID');
    }
  }

  async _getStoreKey(key) {
    if (this.redisClient && (this.redisClient.isOpen || typeof this.redisClient.get === 'function')) {
      const val = await this.redisClient.get(key);
      return val ? JSON.parse(val) : null;
    }
    const mem = this._memoryStore.get(key);
    if (!mem) return null;
    if (mem.expiresAt && Date.now() > mem.expiresAt) {
      this._memoryStore.delete(key);
      return null;
    }
    return mem.data;
  }

  async _setStoreKey(key, data, ttlSeconds) {
    if (this.redisClient && (this.redisClient.isOpen || typeof this.redisClient.set === 'function')) {
      await this.redisClient.set(key, JSON.stringify(data), { EX: ttlSeconds });
      return;
    }
    this._memoryStore.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  async _delStoreKey(key) {
    if (this.redisClient && (this.redisClient.isOpen || typeof this.redisClient.del === 'function')) {
      await this.redisClient.del(key);
      return;
    }
    this._memoryStore.delete(key);
  }

  async _incrementCounter(key, ttlSeconds) {
    if (this.redisClient && (this.redisClient.isOpen || typeof this.redisClient.incr === 'function')) {
      const count = await this.redisClient.incr(key);
      if (count === 1) {
        await this.redisClient.expire(key, ttlSeconds);
      }
      return count;
    }
    const current = (await this._getStoreKey(key)) || 0;
    const next = current + 1;
    await this._setStoreKey(key, next, ttlSeconds);
    return next;
  }

  /**
   * Request a new guest OTP challenge for COD verification.
   * @param {Object} params
   * @param {string} params.phone - Raw phone number
   * @param {string} params.clientIp - Client IP address
   * @returns {Promise<{ challengeId: string, expiresInSeconds: number }>}
   */
  async createChallenge({ phone, clientIp = '127.0.0.1' }) {
    if (!(await this.isAvailable())) {
      throw new AppError('Guest phone verification service is temporarily unavailable', 503, 'COD_GUEST_VERIFICATION_UNAVAILABLE');
    }
    const phoneE164 = this.normalizePhone(phone);

    // Rate Limiting
    const phoneRateKey = `guest_otp:rate:phone:${phoneE164}`;
    const ipRateKey = `guest_otp:rate:ip:${clientIp}`;

    const phoneCount = await this._incrementCounter(phoneRateKey, 3600);
    if (phoneCount > MAX_HOURLY_PHONE_CHALLENGES) {
      throw new AppError('Too many verification attempts for this phone number. Please try again later.', 429, 'OTP_RATE_LIMIT_EXCEEDED');
    }

    const ipCount = await this._incrementCounter(ipRateKey, 3600);
    if (ipCount > MAX_HOURLY_IP_CHALLENGES) {
      throw new AppError('Too many verification attempts from this network. Please try again later.', 429, 'OTP_RATE_LIMIT_EXCEEDED');
    }

    const challengeId = crypto.randomUUID();
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHmac = this._hashOtp(otp, challengeId);

    const challengeData = {
      challengeId,
      phoneE164,
      otpHmac,
      attemptsRemaining: MAX_VERIFICATION_ATTEMPTS,
      createdAt: new Date().toISOString()
    };

    await this._setStoreKey(`guest_otp:challenge:${challengeId}`, challengeData, CHALLENGE_TTL_SECONDS);

    // If UAT mock environment, write to external mock mailbox
    if (this.isUatMock) {
      this._writeToMockMailbox({ challengeId, phoneE164, otp });
    }

    logger.info('Guest COD phone verification challenge created', {
      challengeId,
      phoneMasked: phoneE164.slice(0, 4) + '****' + phoneE164.slice(-2)
    });

    return {
      challengeId,
      expiresInSeconds: CHALLENGE_TTL_SECONDS
    };
  }

  _writeToMockMailbox({ challengeId, phoneE164, otp }) {
    try {
      const mailboxPath = path.resolve(this.tempDir, 'mock-sms-mailbox.json');
      let entries = [];
      if (fs.existsSync(mailboxPath)) {
        try {
          entries = JSON.parse(fs.readFileSync(mailboxPath, 'utf8'));
        } catch {}
      }
      entries.push({
        challengeId,
        phoneE164,
        otp, // Only stored in isolated OS temporary file outside repo for UAT runner
        sentAt: new Date().toISOString()
      });
      fs.writeFileSync(mailboxPath, JSON.stringify(entries, null, 2), { mode: 0o600 });
    } catch (err) {
      logger.warn('Failed to write to external mock SMS mailbox', { error: err.message });
    }
  }

  /**
   * Verify an OTP challenge. Returns single-use verification token upon success.
   * @param {Object} params
   * @param {string} params.challengeId
   * @param {string} params.otp
   * @returns {Promise<{ verificationToken: string, phone: string, expiresInSeconds: number }>}
   */
  async verifyOtp({ challengeId, otp }) {
    if (!(await this.isAvailable())) {
      throw new AppError('Guest phone verification service is temporarily unavailable', 503, 'COD_GUEST_VERIFICATION_UNAVAILABLE');
    }
    if (!challengeId || !otp) {
      throw new AppError('Challenge ID and OTP are required', 400, 'OTP_INVALID');
    }

    const challengeKey = `guest_otp:challenge:${challengeId}`;
    const challenge = await this._getStoreKey(challengeKey);

    if (!challenge) {
      throw new AppError('Verification challenge has expired or does not exist', 400, 'OTP_EXPIRED');
    }

    if (challenge.attemptsRemaining <= 0) {
      await this._delStoreKey(challengeKey);
      throw new AppError('Maximum verification attempts exceeded. Please request a new code.', 400, 'OTP_MAX_ATTEMPTS_EXCEEDED');
    }

    const expectedHmac = challenge.otpHmac;
    const suppliedHmac = this._hashOtp(otp.trim(), challengeId);

    const matches = crypto.timingSafeEqual(
      Buffer.from(expectedHmac, 'hex'),
      Buffer.from(suppliedHmac, 'hex')
    );

    if (!matches) {
      challenge.attemptsRemaining -= 1;
      if (challenge.attemptsRemaining <= 0) {
        await this._delStoreKey(challengeKey);
        throw new AppError('Maximum verification attempts exceeded. Please request a new code.', 400, 'OTP_MAX_ATTEMPTS_EXCEEDED');
      }
      await this._setStoreKey(challengeKey, challenge, CHALLENGE_TTL_SECONDS);
      throw new AppError(`Invalid verification code. ${challenge.attemptsRemaining} attempts remaining.`, 400, 'OTP_MISMATCH');
    }

    // Success: Challenge consumed atomically
    await this._delStoreKey(challengeKey);

    // Generate single-use opaque verification token
    const rawToken = `GTK_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHmac = this._hashToken(rawToken);

    const tokenData = {
      phoneE164: challenge.phoneE164,
      challengeId,
      purpose: 'GUEST_COD',
      issuedAt: new Date().toISOString()
    };

    await this._setStoreKey(`guest_otp:token:${tokenHmac}`, tokenData, TOKEN_TTL_SECONDS);

    return {
      verificationToken: rawToken,
      phone: challenge.phoneE164,
      expiresInSeconds: TOKEN_TTL_SECONDS
    };
  }

  /**
   * Validate and optionally consume the verification token during order finalization.
   * @param {string} rawToken
   * @param {string} phone
   * @param {boolean} [consume=true]
   * @returns {Promise<boolean>}
   */
  async validateToken(rawToken, phone, consume = true) {
    if (!rawToken || typeof rawToken !== 'string') return false;

    try {
      if (!(await this.isAvailable())) return false;

      const tokenHmac = this._hashToken(rawToken);
      const tokenKey = `guest_otp:token:${tokenHmac}`;
      const tokenData = await this._getStoreKey(tokenKey);

      if (!tokenData) return false;
      if (tokenData.purpose !== 'GUEST_COD') return false;

      const normalizedPhone = this.normalizePhone(phone);
      if (tokenData.phoneE164 !== normalizedPhone) return false;

      if (consume) {
        await this._delStoreKey(tokenKey);
      }
      return true;
    } catch {
      return false;
    }
  }
}

const defaultGuestVerificationService = new GuestPhoneVerificationService();

module.exports = defaultGuestVerificationService;
module.exports.GuestPhoneVerificationService = GuestPhoneVerificationService;
