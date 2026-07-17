const express = require('express');
const router = express.Router();
const { protect, admin, superAdmin } = require('../middleware/auth');
const {
  getStaffUsers,
  getCustomers,          // 🌟 ADDED
  createStaffUser,
  updateStaffUser,
  deleteStaffUser
} = require('../controllers/userController');

// All routes require authentication
router.use(protect);

// Staff Management (Admin/SuperAdmin)
router.get('/staff', admin, getStaffUsers);
router.post('/staff', superAdmin, createStaffUser);
router.put('/staff/:id', superAdmin, updateStaffUser);
router.delete('/staff/:id', superAdmin, deleteStaffUser);

// 🌟 Customer Management (Admin)
router.get('/customers', admin, getCustomers);

module.exports = router;