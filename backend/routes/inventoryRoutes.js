const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getInventoryOverview,
  getLowStock,
  adjustStock,
  getStockHistory,
  getInventoryStats,
  bulkStockUpdate
} = require('../controllers/inventoryController');

router.use(protect, admin);

router.get('/stats', getInventoryStats);
router.get('/overview', getInventoryOverview);
router.get('/low-stock', getLowStock);
router.get('/history/:productId?', getStockHistory);
router.post('/adjust', adjustStock);
router.post('/bulk-update', bulkStockUpdate);

module.exports = router;