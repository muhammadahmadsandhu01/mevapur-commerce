/**
 * @file paymentDisputeRoutes.js
 * @description Admin routes for payment disputes and chargebacks.
 */

'use strict';

const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/paymentDisputeController');
const { protect, admin } = require('../middleware/auth');

router.use(protect, admin);

router.get('/', disputeController.listDisputes);
router.get('/:id', disputeController.getDispute);
router.post('/:id/evidence', disputeController.submitEvidence);

module.exports = router;
