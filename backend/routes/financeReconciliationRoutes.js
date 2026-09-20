/**
 * @file financeReconciliationRoutes.js
 * @description Admin routes for finance reconciliation.
 */

'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/financeReconciliationController');
const { protect, admin } = require('../middleware/auth');

router.use(protect, admin);

router.get('/period', controller.reconcilePeriod);
router.get('/payment/:paymentId', controller.reconcilePayment);

module.exports = router;
