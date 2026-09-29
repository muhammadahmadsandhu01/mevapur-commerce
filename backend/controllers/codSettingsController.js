/**
 * @file codSettingsController.js
 * @description Admin Controller for dynamic Cash on Delivery (COD) City Exclusion configuration.
 */

'use strict';

const codSettingsService = require('../services/settings/CodSettingsService');
const logger = require('../common/utils/logger');

/**
 * @desc    Get COD settings (disallowed cities and enabled status)
 * @route   GET /api/admin/settings/cod
 * @access  Private/Admin
 */
exports.getCodSettings = async (req, res) => {
  try {
    const settings = await codSettingsService.getCodSettings();

    return res.json({
      success: true,
      enabled: settings.enabled,
      allowedCountry: settings.allowedCountry,
      disallowedCities: settings.disallowedCities,
      data: {
        enabled: settings.enabled,
        allowedCountry: settings.allowedCountry,
        disallowedCities: settings.disallowedCities
      }
    });
  } catch (error) {
    logger.error('Failed to get COD settings', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve COD settings'
    });
  }
};

/**
 * @desc    Update COD settings (disallowed cities and enabled status)
 * @route   PUT /api/admin/settings/cod
 * @access  Private/Admin
 */
exports.updateCodSettings = async (req, res) => {
  try {
    const { enabled, disallowedCities } = req.body || {};

    if (disallowedCities !== undefined && !Array.isArray(disallowedCities)) {
      return res.status(400).json({
        success: false,
        message: 'disallowedCities must be an array of city names'
      });
    }

    const updated = await codSettingsService.updateCodSettings({
      enabled,
      disallowedCities
    });

    return res.json({
      success: true,
      message: 'COD city restrictions updated successfully',
      enabled: updated.enabled,
      allowedCountry: updated.allowedCountry,
      disallowedCities: updated.disallowedCities,
      data: {
        enabled: updated.enabled,
        allowedCountry: updated.allowedCountry,
        disallowedCities: updated.disallowedCities
      }
    });
  } catch (error) {
    logger.error('Failed to update COD settings', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to update COD settings'
    });
  }
};
