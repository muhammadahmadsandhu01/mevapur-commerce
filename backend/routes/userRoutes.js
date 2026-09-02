const express = require('express');
const router = express.Router();
const { protect, admin, superAdmin } = require('../middleware/auth');
const {
  getStaffUsers,
  getCustomers,
  createStaffUser,
  updateStaffUser,
  deleteStaffUser,
  inviteStaffUser,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  getRolesMatrix
} = require('../controllers/userController');

// All routes require authentication
router.use(protect);

// Staff Management (Admin/SuperAdmin)
router.get('/staff', admin, getStaffUsers);
router.post('/staff', superAdmin, createStaffUser);
router.put('/staff/:id', superAdmin, updateStaffUser);
router.delete('/staff/:id', superAdmin, deleteStaffUser);

// Staff Invitations (SuperAdmin)
router.post('/invite', superAdmin, inviteStaffUser);
router.get('/invitations', superAdmin, listInvitations);
router.post('/invitations/:id/resend', superAdmin, resendInvitation);
router.delete('/invitations/:id', superAdmin, revokeInvitation);

// Roles Matrix (Staff viewable)
router.get('/roles-matrix', admin, getRolesMatrix);

// Customer Management (Admin)
router.get('/customers', admin, getCustomers);

module.exports = router;