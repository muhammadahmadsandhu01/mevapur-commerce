const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  createNotification,
  getNotificationStats
} = require('../controllers/notificationController');

router.use(protect);

router.get('/stats', getNotificationStats);
router.get('/unread-count', getUnreadCount);
router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/mark-all-read', markAllAsRead);
router.delete('/:id', deleteNotification);
router.delete('/delete-all', deleteAllNotifications);
router.post('/', createNotification);

module.exports = router;