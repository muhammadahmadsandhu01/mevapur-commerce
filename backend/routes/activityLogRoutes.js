const express = require('express');
const router = express.Router();
const { protect, admin, superAdmin } = require('../middleware/auth');
const {
  getActivityLogs,
  getActivityLogStats,
  createActivityLog,
  cleanupActivityLogs
} = require('../controllers/activityLogController');

// All routes require authentication and admin role
router.use(protect, admin);

router.get('/stats', getActivityLogStats);
router.get('/', getActivityLogs);
router.post('/', createActivityLog);
router.delete('/cleanup', superAdmin, cleanupActivityLogs);

module.exports = router;