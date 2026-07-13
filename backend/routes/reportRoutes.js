const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getSalesReport,
  getProductReport,
  getCustomerReport,
  getOrderReport,
  getAnalytics,
  exportReport
} = require('../controllers/reportController');

router.use(protect, admin);

router.get('/analytics', getAnalytics);
router.get('/sales', getSalesReport);
router.get('/products', getProductReport);
router.get('/customers', getCustomerReport);
router.get('/orders', getOrderReport);
router.get('/export/:type', exportReport);

module.exports = router;