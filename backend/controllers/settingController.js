const Setting = require('../models/Setting');
const { logActivity } = require('../middleware/activityLogger');  

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne();
    
    // Agar pehli baar hai, to default settings create karein
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

// @desc    Update settings (Grouped Update)
// @route   PUT /api/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
  try {
    const settingsData = req.body; // e.g., { store: { store_name: '...', ... } }
    
    // MongoDB $set operator use karein taake sirf provided groups update hon
    const updateQuery = { $set: settingsData };
    
    let settings = await Setting.findOneAndUpdate(
      {}, // Pehla (aur akela) settings document dhundhein
      updateQuery,
      { new: true, upsert: true, runValidators: true }
    );

    const updatedGroups = Object.keys(settingsData);
    await logActivity(req, 'SETTINGS_UPDATE', 
      `Updated settings groups: ${updatedGroups.join(', ')}`, 
      { groupsUpdated: updatedGroups }
    );

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
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
    // 🛡️ SECURITY BEST PRACTICE: Sensitive payment credentials ko public API se exclude karein
    const settings = await Setting.findOne().select(
      '-payment.jazzcash_password -payment.visa_api_key -payment.visa_secret_key -payment.mastercard_api_key -payment.mastercard_secret_key'
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