const Setting = require('../models/Setting');
const { logActivity } = require('../middleware/activityLogger');
const logger = require('../common/utils/logger');
const {
  getProviderCredentialStatus
} = require('../config/payment.config');
const {
  PROVIDER_SECRET_EXCLUSION,
  buildSettingsUpdate,
  containsProviderCredentialInput,
  getUpdatedGroups
} = require('../services/SettingSecurityService');

const logSettingsError = (operation, error) => {
  logger.error(`Settings ${operation} failed`, {
    errorCode: error.code,
    errorName: error.name
  });
};

const toPlainSettings = (settings) => (
  typeof settings?.toObject === 'function'
    ? settings.toObject()
    : settings
);

const toAdminSettings = (settings) => ({
  ...toPlainSettings(settings),
  providerCredentials: getProviderCredentialStatus()
});

const findSettingsWithoutProviderSecrets = () => (
  Setting.findOne().select(PROVIDER_SECRET_EXCLUSION)
);

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
  try {
    let settings = await findSettingsWithoutProviderSecrets();

    if (!settings) {
      settings = await Setting.create({});
    }

    res.json({
      success: true,
      data: toAdminSettings(settings)
    });
  } catch (error) {
    logSettingsError('read', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

// @desc    Update settings (Grouped Update)
// @route   PUT /api/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
  try {
    const settingsData = req.body;

    if (containsProviderCredentialInput(settingsData)) {
      return res.status(400).json({
        success: false,
        message: 'Provider credentials are managed through deployment configuration',
        error: {
          code: 'PROVIDER_CREDENTIALS_ENVIRONMENT_MANAGED'
        }
      });
    }

    const safeUpdate = buildSettingsUpdate(settingsData);

    let settings;
    if (Object.keys(safeUpdate).length > 0) {
      settings = await Setting.findOneAndUpdate(
        {},
        { $set: safeUpdate },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true
        }
      ).select(PROVIDER_SECRET_EXCLUSION);
    } else {
      settings = await findSettingsWithoutProviderSecrets();
      if (!settings) settings = await Setting.create({});
    }

    const updatedGroups = getUpdatedGroups(settingsData);
    await logActivity(
      req,
      'SETTINGS_UPDATE',
      `Updated settings groups: ${updatedGroups.join(', ')}`,
      { groupsUpdated: updatedGroups }
    );

    return res.json({
      success: true,
      message: 'Settings updated successfully',
      data: toAdminSettings(settings)
    });
  } catch (error) {
    logSettingsError('update', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};

// @desc    Get public settings (for frontend)
// @route   GET /api/settings/public
// @access  Public
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await findSettingsWithoutProviderSecrets();

    res.json({
      success: true,
      data: toPlainSettings(settings)
    });
  } catch (error) {
    logSettingsError('public read', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public settings'
    });
  }
};
