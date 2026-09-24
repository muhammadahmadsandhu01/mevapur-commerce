/**
 * @file codGovernanceRoutes.js
 * @description Dedicated Admin and Governance Routes for Cash on Delivery (COD) Policies.
 * Enforces strict RBAC:
 *   - Read access: ['admin', 'super_admin', 'support']
 *   - Write access: ['admin', 'super_admin'] (support is strictly read-only, customer gets 403)
 */

'use strict';

const express = require('express');
const { protect, admin, checkRoles } = require('../middleware/auth');
const controller = require('../controllers/codGovernanceController');

const router = express.Router();

const allowStaffRead = checkRoles('admin', 'super_admin', 'support');

// 1. COD Serviceability Rules
router.get('/rules', protect, allowStaffRead, controller.listServiceabilityRules);
router.post('/rules', protect, admin, controller.upsertServiceabilityRule);
router.delete('/rules/:id', protect, admin, controller.deleteServiceabilityRule);

// 2. Customer Risk & Policy Restriction Status
router.get('/customers/:id/status', protect, allowStaffRead, controller.getCustomerCodStatus);
router.post('/customers/:id/block', protect, admin, controller.blockCustomerCod);
router.post('/customers/:id/unblock', protect, admin, controller.unblockCustomerCod);
router.post('/customers/:id/override', protect, admin, controller.overrideCustomerCod);

// 3. Courier Delivery Outcome Recording
router.post('/orders/:id/delivery-outcome', protect, admin, controller.recordDeliveryOutcome);

// 4. Product Market Offering COD Eligibility Governance
router.get('/offerings', protect, allowStaffRead, controller.listOfferings);
router.put('/offerings/:id/eligibility', protect, admin, controller.updateOfferingEligibility);

// 5. Governance Audit History
router.get('/audit-history', protect, allowStaffRead, controller.listAuditHistory);

module.exports = router;
