/**
 * @file commerceGovernanceRoutes.js
 * @description Dedicated admin routes for versioned commerce configuration governance.
 */

const express = require('express');
const { protect, admin, superAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/commerceGovernanceController');
const ERROR_CODES = require('../constants/errorCodes');
const {
  createDraftSchema,
  updateDraftSchema,
  activateVersionSchema,
  retireVersionSchema,
  previewQuoteSchema
} = require('../validators/commerceGovernanceValidator');

const router = express.Router();
const validation = (schema, source = 'body') => validate(schema, {
  source,
  code: ERROR_CODES.COMMERCIAL_CORE_VALIDATION_FAILED
});

// 1. Read & Readiness Endpoints (protect, admin)
router.get('/versions', protect, admin, controller.listVersions);
router.get('/versions/:id', protect, admin, controller.getVersion);
router.get('/readiness', protect, admin, controller.getReadiness);

// 2. Draft Lifecycle Endpoints (protect, admin)
router.post('/draft', protect, admin, validation(createDraftSchema), controller.createDraft);
router.put('/draft/:id', protect, admin, validation(updateDraftSchema), controller.updateDraft);
router.post('/draft/:id/validate', protect, admin, controller.validateDraft);

// 3. Activation & Retirement Endpoints (protect, superAdmin)
router.post('/versions/:id/activate', protect, superAdmin, validation(activateVersionSchema), controller.activateVersion);
router.post('/versions/:id/retire', protect, superAdmin, validation(retireVersionSchema), controller.retireVersion);

// 4. Read-Only Preview Simulation (protect, admin)
router.post('/preview', protect, admin, validation(previewQuoteSchema), controller.previewQuote);

module.exports = router;
