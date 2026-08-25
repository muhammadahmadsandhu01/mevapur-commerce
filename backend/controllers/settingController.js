const Setting = require('../models/Setting');
const { logActivity } = require('../middleware/activityLogger');  
const logger = require('../common/utils/logger');
const {
  SECRET_SETTING_PATHS,
  buildSettingsUpdate,
  getUpdatedGroups,
  sanitizeSettings
} = require('../services/SettingSecurityService');

const SECRET_FIELD_SELECTION = SECRET_SETTING_PATHS
  .map((path) => `+${path}`)
  .join(' ');

const logSettingsError = (operation, error) => {
  logger.error(`Settings ${operation} failed`, {
    errorCode: error.code,
    errorName: error.name
  });
};

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne().select(SECRET_FIELD_SELECTION);
    
    // Agar pehli baar hai, to default settings create karein
    if (!settings) {
      settings = await Setting.create({});
    }

    res.json({
      success: true,
      data: sanitizeSettings(settings)
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
      ).select(SECRET_FIELD_SELECTION);
    } else {
      settings = await Setting.findOne().select(SECRET_FIELD_SELECTION);
      if (!settings) settings = await Setting.create({});
    }

    const updatedGroups = getUpdatedGroups(settingsData);
    await logActivity(req, 'SETTINGS_UPDATE', 
      `Updated settings groups: ${updatedGroups.join(', ')}`, 
      { groupsUpdated: updatedGroups }
    );

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: sanitizeSettings(settings)
    });
  } catch (error) {
    logSettingsError('update', error);
    res.status(500).json({
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
    // 🛡️ SECURITY BEST PRACTICE: Sensitive payment credentials ko public API se exclude karein
    const settings = await Setting.findOne().select(
      '-payment.jazzcash_password -payment.visa_api_key -payment.visa_secret_key -payment.mastercard_api_key -payment.mastercard_secret_key'
    );

    res.json({
      success: true,
      data: sanitizeSettings(settings, { includeSecretIndicators: false })
    });
  } catch (error) {
    logSettingsError('public read', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public settings'
    });
  }
};
