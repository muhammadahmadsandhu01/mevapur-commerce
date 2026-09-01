const express = require('express');
const router = express.Router();
const { protect, checkRoles, admin } = require('../middleware/auth');
const {
  getCustomers,
  getCustomer,
  updateCustomerProfile,
  toggleBlockCustomer,
  getCustomerStats,
  exportCustomers
} = require('../controllers/customerController');

router.use(protect);

router.get('/stats', checkRoles('support', 'manager', 'admin', 'super_admin'), getCustomerStats);
router.get('/export', checkRoles('manager', 'admin', 'super_admin'), exportCustomers);
router.get('/', checkRoles('support', 'manager', 'admin', 'super_admin'), getCustomers);
router.get('/:id', checkRoles('support', 'manager', 'admin', 'super_admin'), getCustomer);
router.patch('/:id/profile', checkRoles('manager', 'admin', 'super_admin'), updateCustomerProfile);
router.put('/:id/block', admin, toggleBlockCustomer);

module.exports = router;