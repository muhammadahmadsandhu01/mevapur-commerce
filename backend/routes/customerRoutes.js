const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getCustomers,
  getCustomer,
  toggleBlockCustomer,
  getCustomerStats
} = require('../controllers/customerController');

router.use(protect, admin);

router.get('/stats', getCustomerStats);
router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.put('/:id/block', toggleBlockCustomer);

module.exports = router;