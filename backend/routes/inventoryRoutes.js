/**
 * @file inventoryRoutes.js
 * @description Tenant-scoped inventory routes with RBAC enforcement and Zod input validation.
 */

const express = require('express');
const router = express.Router();
const { protect, checkRoles } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  createLocationSchema,
  updateLocationSchema,
  updateLocationStatusSchema,
  updatePositionControlsSchema,
  adjustStockSchema,
  previewAllocationSchema,
  releaseReservationSchema,
  returnReceiptSchema,
  returnInspectionSchema
} = require('../validators/inventoryValidator');

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
  processReturnReceipt,
  processReturnInspection,
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

// 1. Locations Governance
router.get('/locations', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getLocations);
router.post('/locations', checkRoles('admin', 'super_admin'), validate(createLocationSchema), createLocation);
router.get('/locations/:id', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getLocationById);
router.put('/locations/:id', checkRoles('admin', 'super_admin'), validate(updateLocationSchema), updateLocation);
router.post('/locations/:id/status', checkRoles('admin', 'super_admin'), validate(updateLocationStatusSchema), updateLocationStatus);

// 2. Positions & Controls
router.get('/positions', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getPositions);
router.get('/positions/:id', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getPositionById);
router.put('/positions/:id/controls', checkRoles('admin', 'super_admin'), validate(updatePositionControlsSchema), updatePositionControls);

// 3. Reservations & Allocation Preview
router.get('/reservations', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getReservations);
router.get('/reservations/:id', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getReservationById);
router.post('/reservations/:id/release', checkRoles('admin', 'super_admin'), validate(releaseReservationSchema), releaseReservation);
router.post('/allocation/preview', checkRoles('inventory', 'manager', 'admin', 'super_admin'), validate(previewAllocationSchema), previewAllocation);
router.post('/allocations/preview', checkRoles('inventory', 'manager', 'admin', 'super_admin'), validate(previewAllocationSchema), previewAllocation);

// 4. Returns Lifecycle (Quarantine Receipt & Inspection)
router.post('/returns/receipt', checkRoles('inventory', 'manager', 'admin', 'super_admin'), validate(returnReceiptSchema), processReturnReceipt);
router.post('/returns/inspection', checkRoles('admin', 'super_admin'), validate(returnInspectionSchema), processReturnInspection);

// 5. Reconciliation
router.get('/reconciliation', checkRoles('admin', 'super_admin'), getReconciliationReport);

// 6. Adjustments, History & Export
router.get('/export', checkRoles('inventory', 'manager', 'admin', 'super_admin'), exportInventory);
router.get('/stats', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventoryStats);
router.get('/overview', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventoryOverview);
router.get('/low-stock', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getLowStock);
router.get('/history/:productId?', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getStockHistory);
router.get('/', checkRoles('inventory', 'manager', 'admin', 'super_admin'), getInventory);
router.post('/adjust', checkRoles('inventory', 'manager', 'admin', 'super_admin'), validate(adjustStockSchema), adjustStock);

module.exports = router;
