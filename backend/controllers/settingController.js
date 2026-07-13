const Setting = require('../models/Setting');
const { logActivity } = require('../middleware/activityLogger');  

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne();
    
    if (!settings) {
      settings = await Setting.create({});
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
  try {
    const settingsData = req.body;
    
    const updatePromises = Object.entries(settingsData).map(async ([key, value]) => {
      const fullKey = key;
      
      let type = 'string';
      if (typeof value === 'number') type = 'number';
      if (typeof value === 'boolean') type = 'boolean';
      if (typeof value === 'object') type = 'object';

      await Setting.findOneAndUpdate(
        { key: fullKey },
        { key: fullKey, value, type },
        { upsert: true, new: true }
      );
    });

    await Promise.all(updatePromises);

    const updatedKeys = Object.keys(settingsData);
    await logActivity(req, 'SETTINGS_UPDATE', 
      `Updated settings: ${updatedKeys.join(', ')}`, 
      { 
        settingsUpdated: updatedKeys,
        group: updatedKeys[0]?.split('_')[0]
      }
    );

    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get public settings (for frontend)
// @route   GET /api/settings/public
// @access  Public
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await Setting.findOne().select(
      'storeName storeDescription logo contactEmail contactPhone address currency currencySymbol socialMedia maintenanceMode maintenanceMessage'
    );

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};