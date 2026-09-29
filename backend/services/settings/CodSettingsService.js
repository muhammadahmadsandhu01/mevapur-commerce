/**
 * @file CodSettingsService.js
 * @description Service for managing Cash on Delivery (COD) configuration and disallowed cities.
 * Provides atomic getter, updater, and high-performance in-memory caching.
 */

'use strict';

const Setting = require('../../models/Setting');
const logger = require('../../common/utils/logger');

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

class CodSettingsService {
  constructor() {
    this._cache = null;
    this._cachedAt = 0;
  }

  /**
   * Normalize and deduplicate city list case-insensitively.
   * @param {Array<string>} cities
   * @returns {Array<string>}
   */
  sanitizeCities(cities) {
    if (!Array.isArray(cities)) return [];

    const seen = new Set();
    const result = [];

    for (const item of cities) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;

      const lower = trimmed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(trimmed);
      }
    }

    return result;
  }

  /**
   * Invalidate local memory cache.
   */
  clearCache() {
    this._cache = null;
    this._cachedAt = 0;
  }

  /**
   * Retrieve active COD settings.
   * Defaults to enabled: true, allowedCountry: 'PK', disallowedCities: [] (100% of Pakistan allowed).
   * @returns {Promise<{ enabled: boolean, allowedCountry: string, disallowedCities: string[] }>}
   */
  async getCodSettings() {
    const now = Date.now();
    if (this._cache && (now - this._cachedAt < CACHE_TTL_MS)) {
      return { ...this._cache, disallowedCities: [...this._cache.disallowedCities] };
    }

    try {
      let settingDoc = await Setting.findOne();
      if (!settingDoc) {
        settingDoc = await Setting.create({
          codSettings: {
            enabled: true,
            allowedCountry: 'PK',
            disallowedCities: []
          }
        });
      } else if (!settingDoc.codSettings) {
        settingDoc.codSettings = {
          enabled: true,
          allowedCountry: 'PK',
          disallowedCities: []
        };
        await Setting.updateOne(
          { _id: settingDoc._id },
          { $set: { codSettings: settingDoc.codSettings } }
        );
      }

      const rawCod = settingDoc.codSettings || {};
      const settings = {
        enabled: typeof rawCod.enabled === 'boolean' ? rawCod.enabled : true,
        allowedCountry: rawCod.allowedCountry || 'PK',
        disallowedCities: Array.isArray(rawCod.disallowedCities) ? rawCod.disallowedCities : []
      };

      this._cache = settings;
      this._cachedAt = now;

      return { ...settings, disallowedCities: [...settings.disallowedCities] };
    } catch (error) {
      logger.error('Failed to retrieve COD settings from database', { error: error.message });
      // Safe fallback: 100% nationwide allowed if DB error
      return {
        enabled: true,
        allowedCountry: 'PK',
        disallowedCities: []
      };
    }
  }

  /**
   * Atomically update COD settings.
   * @param {Object} params
   * @param {boolean} [params.enabled]
   * @param {Array<string>} [params.disallowedCities]
   * @returns {Promise<{ enabled: boolean, allowedCountry: string, disallowedCities: string[] }>}
   */
  async updateCodSettings({ enabled, disallowedCities } = {}) {
    const updateObj = {};

    if (typeof enabled === 'boolean') {
      updateObj['codSettings.enabled'] = enabled;
      updateObj['payment.cod_enabled'] = enabled;
    }

    if (Array.isArray(disallowedCities)) {
      const sanitized = this.sanitizeCities(disallowedCities);
      updateObj['codSettings.disallowedCities'] = sanitized;
    }

    const updatedDoc = await Setting.findOneAndUpdate(
      {},
      {
        $set: updateObj,
        $setOnInsert: {
          'codSettings.allowedCountry': 'PK'
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    this.clearCache();

    const rawCod = updatedDoc?.codSettings || {};
    const result = {
      enabled: typeof rawCod.enabled === 'boolean' ? rawCod.enabled : true,
      allowedCountry: rawCod.allowedCountry || 'PK',
      disallowedCities: Array.isArray(rawCod.disallowedCities) ? rawCod.disallowedCities : []
    };

    this._cache = result;
    this._cachedAt = Date.now();

    return result;
  }

  /**
   * Get list of disallowed cities.
   * @returns {Promise<string[]>}
   */
  async getDisallowedCities() {
    const settings = await this.getCodSettings();
    return settings.disallowedCities || [];
  }

  /**
   * Check if a city is disallowed for COD.
   * Case-insensitive, trimmed comparison.
   * @param {string} city
   * @returns {Promise<boolean>}
   */
  async isCityDisallowed(city) {
    if (!city || typeof city !== 'string') return false;
    const normalizedCity = city.trim().toLowerCase();
    if (!normalizedCity) return false;

    const disallowedCities = await this.getDisallowedCities();
    return disallowedCities.some((c) => c.trim().toLowerCase() === normalizedCity);
  }
}

const defaultCodSettingsService = new CodSettingsService();

module.exports = defaultCodSettingsService;
module.exports.CodSettingsService = CodSettingsService;
