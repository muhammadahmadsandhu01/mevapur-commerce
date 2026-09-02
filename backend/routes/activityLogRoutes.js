const express = require('express');
const router = express.Router();
const { protect, requireRoles } = require('../middleware/auth');
const {
  getActivityLogs,
  getActivityLogStats,
  exportActivityLogs
} = require('../controllers/activityLogController');

// All activity routes require authentication
router.use(protect);

// Specific sub-routes registered before parameterized routes
router.get('/export', requireRoles('admin', 'super_admin'), exportActivityLogs);
router.get('/stats', requireRoles('manager', 'admin', 'super_admin'), getActivityLogStats);
router.get('/', requireRoles('manager', 'admin', 'super_admin'), getActivityLogs);

module.exports = router;