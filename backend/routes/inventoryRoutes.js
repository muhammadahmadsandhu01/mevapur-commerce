const express = require('express');
const router = express.Router();
const { protect, checkRoles } = require('../middleware/auth');
const {
  getInventory,
  getInventoryOverview,
  getInventoryStats,
  getLowStock,
  adjustStock,
  getStockHistory,
  exportInventory
} = require('../controllers/inventoryController');

router.use(protect);

router.get('/export', checkRoles('inventory', 'manager', 'admin', 'super_admin'), exportInventory);
router.get('/stats', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventoryStats);
router.get('/overview', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventoryOverview);
router.get('/low-stock', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getLowStock);
router.get('/history/:productId?', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getStockHistory);
router.get('/', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventory);
router.post('/adjust', checkRoles('inventory', 'manager', 'admin', 'super_admin'), adjustStock);

module.exports = router;
