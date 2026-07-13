const express = require('express');
const router = express.Router();
const { protect, admin, superAdmin } = require('../middleware/auth');
const {
  getStaffUsers,
  createStaffUser,
  updateStaffUser,
  deleteStaffUser
} = require('../controllers/userController');

// All routes require authentication and admin role
router.use(protect, admin);

router.get('/staff', getStaffUsers);
router.post('/staff', superAdmin, createStaffUser);
router.put('/staff/:id', superAdmin, updateStaffUser);
router.delete('/staff/:id', superAdmin, deleteStaffUser);

module.exports = router;