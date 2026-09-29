const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getSettings,
  updateSettings,
  getPublicSettings
} = require('../controllers/settingController');

const codSettingsController = require('../controllers/codSettingsController');

// Public route (bina login ke store info fetch karne ke liye)
router.get('/public', getPublicSettings);

// Protected routes (sirf Admin ke liye)
router.get('/cod', protect, admin, codSettingsController.getCodSettings);
router.put('/cod', protect, admin, codSettingsController.updateCodSettings);
router.get('/', protect, admin, getSettings);
router.put('/', protect, admin, updateSettings);

module.exports = router;