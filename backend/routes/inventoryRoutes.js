const express = require('express');
const router = express.Router();
const { protect, checkRoles } = require('../middleware/auth');
const {
  getLocations,
  getLocationById,
  createLocation,
  updateLocation,
  updateLocationStatus,
  getPositions,
  getPositionById,
  updatePositionControls,
  getReservations,
  getReservationById,
  releaseReservation,
  previewAllocation,
  getReconciliationReport,
  getInventory,
  getInventoryOverview,
  getInventoryStats,
  getLowStock,
  adjustStock,
  getStockHistory,
  exportInventory
} = require('../controllers/inventoryController');

router.use(protect);

// 1. Locations
router.get('/locations', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getLocations);
router.post('/locations', checkRoles('admin', 'super_admin'), createLocation);
router.get('/locations/:id', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getLocationById);
router.put('/locations/:id', checkRoles('admin', 'super_admin'), updateLocation);
router.post('/locations/:id/status', checkRoles('admin', 'super_admin'), updateLocationStatus);

// 2. Positions & Controls
router.get('/positions', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getPositions);
router.get('/positions/:id', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getPositionById);
router.put('/positions/:id/controls', checkRoles('admin', 'super_admin'), updatePositionControls);

// 3. Reservations & Allocation Preview
router.get('/reservations', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getReservations);
router.get('/reservations/:id', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getReservationById);
router.post('/reservations/:id/release', checkRoles('admin', 'super_admin'), releaseReservation);
router.post('/allocation/preview', checkRoles('inventory', 'manager', 'admin', 'super_admin'), previewAllocation);

// 4. Reconciliation
router.get('/reconciliation', checkRoles('admin', 'super_admin'), getReconciliationReport);

// 5. Adjustments, History & Export
router.get('/export', checkRoles('inventory', 'manager', 'admin', 'super_admin'), exportInventory);
router.get('/stats', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventoryStats);
router.get('/overview', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventoryOverview);
router.get('/low-stock', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getLowStock);
router.get('/history/:productId?', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getStockHistory);
router.get('/', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventory);
router.post('/adjust', checkRoles('inventory', 'manager', 'admin', 'super_admin'), adjustStock);

module.exports = router;
